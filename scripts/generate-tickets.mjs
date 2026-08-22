// ---------------------------------------------------------------------------
// Odd Saint — daily ticket generation
// Pulls real fixtures + bookmaker odds from API-Football, turns them into
// tickets for every tier, and writes them to Supabase. Runs once a day via
// .github/workflows/generate-tickets.yml.
//
// HONEST SCOPE NOTE (read this before treating the output as a finished
// prediction engine): the "AI Confidence Index" here is a simple, transparent
// heuristic derived from bookmaker consensus odds (implied probability),
// not a trained model. That's a legitimate, defensible basis for a
// confidence figure — real odds reflect real market consensus — but it's
// intentionally simple. Tune the SELECTION STRATEGY section below as your
// picks strategy matures.
// ---------------------------------------------------------------------------
import { getFixturesForDate, getOddsForFixture } from './lib/apiFootball.mjs';
import { getSupabaseAdmin } from './lib/supabaseAdmin.mjs';
import { collectViableOutcomes } from './lib/markets.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEAGUES_JSON_PATH = join(__dirname, 'lib', 'leagues.json');

// --- Config -----------------------------------------------------------------

// Small built-in default — used until scripts/resolve-leagues.mjs has been
// run at least once (via the manually-triggered "Resolve League IDs"
// workflow) to generate the full, verified league list at
// scripts/lib/leagues.json. One /fixtures?date= call already returns every
// league for that date regardless of allowlist size — filtering here
// doesn't cost extra API requests either way.
const DEFAULT_LEAGUE_ALLOWLIST = new Set([
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  88,  // Eredivisie
  253, // MLS
  // Belgium, Denmark, Norway are intentionally NOT hardcoded here — their
  // real numeric league IDs aren't something to guess. Run the "Resolve
  // League IDs" workflow (scripts/resolve-leagues.mjs already targets all
  // three) to bring them in via leagues.json with verified IDs instead.
]);

function loadLeagueAllowlist() {
  try {
    const raw = readFileSync(LEAGUES_JSON_PATH, 'utf8');
    const leagues = JSON.parse(raw);
    if (Array.isArray(leagues) && leagues.length > 0) {
      console.log(`Loaded ${leagues.length} resolved league(s) from leagues.json.`);
      return new Set(leagues.map((l) => l.id));
    }
  } catch {
    // leagues.json doesn't exist yet (or is invalid) — fall back below.
  }
  console.log(
    'leagues.json not found — using the small built-in default league set. ' +
      'Run the "Resolve League IDs" workflow for full regional coverage.'
  );
  return DEFAULT_LEAGUE_ALLOWLIST;
}

const LEAGUE_ALLOWLIST = loadLeagueAllowlist();

// Caps how many /odds requests we make per pool (daily, then weekly — so a
// full run uses at most ~2x this many, plus a couple of /fixtures calls).
// Kept modest because the free plan enforces both a 10-requests/minute
// throttle (handled in apiFootball.mjs) AND a daily request cap — this
// leaves headroom for the separate grading job, which runs several times
// the same day.
const MAX_ODDS_LOOKUPS_PER_RUN = 25;

// Priority leagues get first pick both when the API request budget limits
// how many fixtures get priced, and when assembling tickets from the
// priced pool. Belgium, Denmark, and Norway are prioritized here per
// product direction, replacing Portugal's former default-set slot. League
// *names* are used (rather than numeric IDs) since these are confirmed
// values from API-Football's published league list, unlike guessed ID
// numbers.
const PRIORITY_LEAGUE_NAMES = new Set([
  'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
  'UEFA Champions League', 'UEFA Europa League', 'Eredivisie', 'MLS',
  'Jupiler Pro League', // Belgium
  'Superligaen',        // Denmark
  'Eliteserien',        // Norway
]);

// How many extra days ahead to pull fixtures for the two "Weekly" tiers.
// API-Football's FREE plan only allows querying a narrow window around
// today (typically yesterday through tomorrow) — requesting further out
// returns a "Free plans do not have access to this date" error. Set to 1
// to stay within that window; if you upgrade your API plan later, this can
// go back up to pull a genuine week's worth of fixtures.
const WEEKLY_LOOKAHEAD_DAYS = 1;

// A curated set of marquee clubs across the covered leagues. Fixtures where
// BOTH sides are in this set (e.g. Real Madrid vs Barcelona, a Manchester
// or Milan derby) are skipped entirely — these are inherently the hardest
// matches to call with real confidence, so the platform avoids building
// picks around them rather than pretending otherwise.
const BIG_CLUBS = new Set([
  'Manchester City', 'Manchester United', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham',
  'Real Madrid', 'Barcelona', 'Atletico Madrid',
  'Bayern Munich', 'Borussia Dortmund',
  'Juventus', 'Inter', 'AC Milan', 'Napoli',
  'Paris Saint Germain', 'PSG',
  'Ajax', 'Benfica', 'Porto',
]);

function isBigClash(homeTeam, awayTeam) {
  return BIG_CLUBS.has(homeTeam) && BIG_CLUBS.has(awayTeam);
}

const TIER_CONFIG = [
  { tier: 'mega', label: 'Mega Day Ticket', matchCount: 4, oddsRange: '1.5-3', alwaysFree: true },
  { tier: 'bronze', label: 'Bronze', matchCount: 3, oddsRange: '2-3', alwaysFree: false },
  { tier: 'silver', label: 'Silver', matchCount: 5, oddsRange: '3-5', alwaysFree: false },
  { tier: 'gold', label: 'Gold', matchCount: 7, oddsRange: '5-10', alwaysFree: false },
  { tier: 'platinum', label: 'Platinum', matchCount: 9, oddsRange: '25-300', alwaysFree: false },
  { tier: 'diamond', label: 'Diamond', matchCount: 14, oddsRange: '300+', alwaysFree: false },
  { tier: 'weekly_lite', label: 'Weekly Lite', matchCount: 19, oddsRange: 'Mixed', alwaysFree: false },
  { tier: 'weekly_titan', label: 'Weekly Titan', matchCount: 29, oddsRange: 'Mixed', alwaysFree: false },
  // Single-match, ultra-high-confidence category. Only ever one match —
  // the single most confident pick available that day, and only ever
  // included if it clears SAINTS_LOCK_MIN_CONFIDENCE (see below), well
  // above the standard MIN_CONFIDENCE floor. $1, no sign-up required — see
  // the separate anonymous-checkout design.
  { tier: 'saints_lock', label: "Saint's Lock", matchCount: 1, oddsRange: '1.5-2', alwaysFree: false },
];

// Numeric cumulative-odds targets matching each tier's oddsRange label
// above. These are ACTUALLY ENFORCED during slip assembly (see
// pickFixturesForSlip) — previously oddsRange was just a display string
// with nothing checking whether a ticket's real combined odds landed
// inside it. Weekly Lite/Titan are intentionally left unset ("Mixed" by
// design, no fixed target).
const TIER_ODDS_TARGET = {
  mega: [1.5, 3],
  bronze: [2, 3],
  silver: [3, 5],
  gold: [5, 10],
  platinum: [25, 300],
  diamond: [300, Infinity],
  saints_lock: [1.5, 2],
};

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

// --- Fetch + price fixtures ---------------------------------------------------

async function fetchPricedFixtures(dates, maxOddsLookups) {
  const seen = new Map(); // fixtureId -> priced fixture
  let oddsLookupsUsed = 0;

  for (const d of dates) {
    const fixtures = await getFixturesForDate(d);
    const candidates = fixtures
      .filter(
        (f) =>
          LEAGUE_ALLOWLIST.has(f.league?.id) &&
          !isBigClash(f.teams?.home?.name, f.teams?.away?.name) &&
          !isExcluded(f.teams?.home?.name, f.teams?.away?.name)
      )
      .sort((a, b) => {
        const aPriority = PRIORITY_LEAGUE_NAMES.has(a.league?.name) ? 1 : 0;
        const bPriority = PRIORITY_LEAGUE_NAMES.has(b.league?.name) ? 1 : 0;
        return bPriority - aPriority;
      });

    for (const f of candidates) {
      if (oddsLookupsUsed >= maxOddsLookups) break;
      const fixtureId = f.fixture.id;
      if (seen.has(fixtureId)) continue;

      oddsLookupsUsed++;
      let oddsResponse;
      try {
        oddsResponse = await getOddsForFixture(fixtureId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Odds lookup failed for fixture ${fixtureId}:`, err.message);
        continue;
      }

      const picked = pickMarketFromOdds(oddsResponse);
      if (!picked) continue; // no usable market for this fixture — skip it

      seen.set(fixtureId, {
        fixtureId,
        ticketDate: dateStr(new Date()),
        league: f.league?.name ?? 'Unknown League',
        homeTeam: f.teams?.home?.name ?? 'Home',
        awayTeam: f.teams?.away?.name ?? 'Away',
        kickoff: f.fixture?.date,
        market: picked.market,
        odds: picked.odds,
        confidence: picked.confidence,
      });
    }
  }

  // Priority leagues first, then highest-confidence picks within each tier.
  return Array.from(seen.values()).sort((a, b) => {
    const aPriority = PRIORITY_LEAGUE_NAMES.has(a.league) ? 1 : 0;
    const bPriority = PRIORITY_LEAGUE_NAMES.has(b.league) ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return b.confidence - a.confidence;
  });
}

// A fixture is skipped entirely if nothing viable clears this confidence
// floor — better to generate one fewer match, or even skip a slip, than to
// force in a pick the market itself doesn't consider a clear favorite.
// Raised from 62 → 68: not every match from an allowed league is fit to be
// on a ticket — quality over quantity is the explicit priority here, even
// if it means fewer tickets on a given day.
const MIN_CONFIDENCE = 68;

// Result-based markets to steer away from when priced this short — an
// extremely tight price on any of these can still be upset (a draw, a cup
// shock, a keeper's bad day). Double Chance in particular is the market
// that actually reaches odds this low (as tight as 1.1) — Home/Away Win
// never goes below 1.3 per the market catalog's own bounds.
const RESULT_BASED_MARKETS = new Set([
  'Home Win', 'Away Win', 'Double Chance 1X', 'Double Chance X2', 'Double Chance 12',
]);
const WIN_MARKET_MIN_ODDS = 1.3;

/**
 * SELECTION STRATEGY (odds → market pick):
 * Checks every market in the shared catalog (Match Winner, Goals
 * Over/Under, Both Teams Score, Double Chance) against this fixture's
 * bookmaker odds, and takes the SAFEST viable outcome — i.e. whichever
 * has the lowest odds / highest implied confidence — rather than picking
 * randomly among them. If that safest outcome is a result-based market
 * (see RESULT_BASED_MARKETS) priced below WIN_MARKET_MIN_ODDS, an Over
 * Goals market is substituted instead when one's available. Skips the
 * fixture entirely if nothing clears MIN_CONFIDENCE, rather than forcing a
 * low-quality pick just to fill a ticket.
 */
function pickMarketFromOdds(oddsResponse) {
  const bookmaker = oddsResponse?.[0]?.bookmakers?.[0];
  if (!bookmaker) return null;

  const viable = collectViableOutcomes(bookmaker.bets);
  if (viable.length === 0) return null;

  const sorted = [...viable].sort((a, b) => a.odds - b.odds);
  let chosen = sorted[0]; // lowest odds = safest, by default

  const isResultMarket = RESULT_BASED_MARKETS.has(chosen.market);
  if (isResultMarket && chosen.odds < WIN_MARKET_MIN_ODDS) {
    const goalsAlt = sorted.find((o) => o.market === 'Over 1.5 Goals' || o.market === 'Over 2.5 Goals');
    if (goalsAlt) {
      chosen = goalsAlt;
    } else {
      // No Goals-market alternative for this fixture — fall back to the
      // next-safest non-result-based option if one exists (e.g. BTTS),
      // rather than the too-short result-based price.
      const nonResult = sorted.find((o) => !RESULT_BASED_MARKETS.has(o.market));
      if (nonResult) chosen = nonResult;
      // If truly nothing else is viable, the short price is accepted
      // rather than dropping the fixture entirely.
    }
  }

  const confidence = impliedConfidence(chosen.odds);
  if (confidence < MIN_CONFIDENCE) return null; // too uncertain even at its safest — skip this fixture

  return { market: chosen.market, odds: chosen.odds, confidence };
}

function impliedConfidence(odds) {
  const raw = Math.round((1 / odds) * 100);
  return Math.min(95, Math.max(55, raw)); // clipped to a sane display range
}

// --- Assemble tickets from the priced-fixture pool ---------------------------

// Tiers with fewer than 7 matches favor safer, more heavily-favored picks:
// their fixture pool is restricted to legs priced at 1.77 or below rather
// than the full odds range used for Gold and up.
const SMALL_TICKET_TIERS = new Set(['mega', 'bronze', 'silver']); // matchCount < 7
const SMALL_TICKET_MAX_ODDS = 1.77;

// Empty by default — add exact team names here (matching API-Football's
// naming) if there are specific clubs or competitions you want the
// pipeline to avoid picking entirely, for any reason (integrity concerns,
// unreliable data, or otherwise). This is a business decision left to you
// rather than a list Claude fills in, since flagging real clubs by name
// for something as serious as match-fixing needs to be based on your own
// verified, current judgment — not baked into the code as an assumption.
const EXCLUDED_TEAMS = new Set([
  // 'Example FC',
]);

function isExcluded(homeTeam, awayTeam) {
  return EXCLUDED_TEAMS.has(homeTeam) || EXCLUDED_TEAMS.has(awayTeam);
}

// Every standard category caps at this many tickets per day, regardless of
// how large the fixture pool is — a bigger pool means a better chance of
// REACHING this cap with genuinely well-priced picks, not permission to
// exceed it. Supersedes the older fixed-5/day Gold rule and the
// weekend-max-4 rule — quality over quantity applies uniformly now.
const MAX_TICKETS_PER_CATEGORY = 3;

function getDailySlipCount(tier, poolSize, date) {
  if (tier === 'saints_lock') return 2; // deliberately lower than the standard cap — see SAINTS_LOCK_MIN_CONFIDENCE
  if (tier === 'platinum' || tier === 'diamond' || tier === 'weekly_lite' || tier === 'weekly_titan') {
    return 1; // large accumulators — one curated slip a day, unchanged
  }
  // mega / bronze / silver / gold: scale with real fixture availability,
  // capped at MAX_TICKETS_PER_CATEGORY. Weekends naturally produce a
  // bigger, higher-quality pool (more leagues playing at once), so they'll
  // more often reach the cap on their own — no special-cased override
  // needed anymore now that the cap applies uniformly.
  return Math.min(MAX_TICKETS_PER_CATEGORY, Math.max(1, Math.ceil(poolSize / 10)));
}

/** Narrows the pool to safer, lower-odds picks for tiers under 7 matches. */
function poolForTier(pool, tier) {
  if (!SMALL_TICKET_TIERS.has(tier)) return pool;
  return pool.filter((p) => p.odds <= SMALL_TICKET_MAX_ODDS);
}

// No single match can appear in more than this many of the day's tickets,
// across every tier combined. Without this cap, a small fixture pool can
// end up reused in nearly every ticket — meaning one unexpected result
// takes down the whole day's slate at once instead of just a few tickets.
const MAX_FIXTURE_APPEARANCES_PER_DAY = 3;

function computeTotalOdds(picks) {
  return Math.round(picks.reduce((acc, p) => acc * p.odds, 1) * 100) / 100;
}

/**
 * Picks fixtures for one slip, preferring whichever fixtures in the pool
 * have been used the LEAST so far today (ties broken by lowest odds, i.e.
 * safest first) as a starting point — then, if the tier has a target
 * cumulative-odds range (see TIER_ODDS_TARGET), swaps picks in and out of
 * that starting selection to nudge the combined odds toward that range.
 * This is what makes a tier's oddsRange (e.g. Bronze "2-3") an actually
 * enforced target rather than just a display label. Not a full optimizer —
 * a handful of greedy swap passes — but meaningfully more accurate than
 * ignoring the target entirely. If the pool doesn't have enough variety to
 * get reasonably close even after swapping, the slip is dropped rather
 * than shipped mislabeled.
 */
/**
 * Picks fixtures for one slip using the FEWEST legs needed to reach the
 * tier's minimum target odds — starting from the safest available fixtures
 * and adding one at a time, stopping the moment the cumulative total lands
 * in range. `maxMatchCount` is a CEILING now, not a fixed requirement:
 * fewer legs at the same target odds means less compounded bookmaker
 * margin (every leg carries the house edge, and it multiplies) and fewer
 * independent things that can go wrong — so this deliberately favors using
 * as few legs as will actually get the job done, only adding more when
 * the safest legs alone can't reach the target.
 */
function pickFixturesForSlip(pool, maxMatchCount, usageCount, targetRange) {
  const eligible = pool.filter((f) => (usageCount.get(f.fixtureId) ?? 0) < MAX_FIXTURE_APPEARANCES_PER_DAY);
  if (eligible.length === 0) return [];

  const ranked = [...eligible].sort((a, b) => {
    const usedA = usageCount.get(a.fixtureId) ?? 0;
    const usedB = usageCount.get(b.fixtureId) ?? 0;
    if (usedA !== usedB) return usedA - usedB; // least-used first
    return a.odds - b.odds; // then safest first
  });

  if (!targetRange) {
    // No target range to hit (Weekly Lite/Titan, "Mixed") — just take the
    // safest available up to the max, as before.
    if (ranked.length < maxMatchCount) return [];
    return ranked.slice(0, maxMatchCount);
  }

  const [minTotal, maxTotal] = targetRange;

  // Greedily add the safest legs one at a time, stopping as soon as the
  // cumulative total reaches the target range.
  let picks = [];
  let unused = [...ranked];

  for (const fixture of ranked) {
    if (picks.length >= maxMatchCount) break;
    picks.push(fixture);
    unused = unused.filter((f) => f !== fixture);

    const total = computeTotalOdds(picks);
    if (total >= minTotal && total <= maxTotal) {
      return picks; // hit the target with this many legs — stop here
    }
    if (total > maxTotal) {
      // Overshot on the safest-first path (can happen with a wide odds
      // spread) — back this addition out and fall through to the swap
      // logic below instead of just continuing to pile on legs.
      picks.pop();
      unused.unshift(fixture);
      break;
    }
  }

  // Safest legs alone (within the max leg cap) didn't reach minTotal —
  // add more legs if there's still room, then fall back to swapping
  // weaker-for-stronger legs to close the gap.
  const MAX_SWAP_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_SWAP_ATTEMPTS; attempt++) {
    const total = computeTotalOdds(picks);
    if (total >= minTotal && total <= maxTotal) break;

    if (total < minTotal) {
      if (picks.length < maxMatchCount && unused.length > 0) {
        const next = [...unused].sort((a, b) => a.odds - b.odds)[0];
        picks.push(next);
        unused = unused.filter((f) => f !== next);
        continue;
      }
      const lowestIdx = picks.reduce((li, p, i) => (p.odds < picks[li].odds ? i : li), 0);
      const candidate = unused.find((f) => f.odds > picks[lowestIdx].odds);
      if (!candidate) break; // nothing left that would raise the total further
      picks[lowestIdx] = candidate;
      unused = unused.filter((f) => f !== candidate);
    } else {
      const highestIdx = picks.reduce((hi, p, i) => (p.odds > picks[hi].odds ? i : hi), 0);
      const candidate = [...unused].sort((a, b) => a.odds - b.odds).find((f) => f.odds < picks[highestIdx].odds);
      if (!candidate) break;
      picks[highestIdx] = candidate;
      unused = unused.filter((f) => f !== candidate);
    }
  }

  const finalTotal = computeTotalOdds(picks);
  const TOLERANCE = 0.3; // 30% slack either side of the target band
  const withinTolerance = finalTotal >= minTotal * (1 - TOLERANCE) && finalTotal <= maxTotal * (1 + TOLERANCE);
  if (!withinTolerance || picks.length === 0) return []; // pool doesn't have enough spread to hit this tier's range today

  return picks;
}

// Saint's Lock demands a far higher confidence bar than any other tier —
// "next to impossible to get wrong" framing means this should almost never
// miss. Well above the standard MIN_CONFIDENCE floor (68) used everywhere
// else. If fewer than 2 fixtures clear this bar on a given day, fewer than
// 2 Saint's Lock tickets get produced — quality over quantity applies here
// most strictly of all.
const SAINTS_LOCK_MIN_CONFIDENCE = 85;

/**
 * Dedicated selection for Saint's Lock — unlike every other tier (which
 * uses pickFixturesForSlip's least-used/safest-first logic), this picks
 * strictly the highest-confidence qualifying fixtures in the whole day's
 * pool, filtered to the 1.5–2.0 odds band and the much higher confidence
 * floor above. Each of up to 2 tickets uses a distinct fixture.
 */
function buildSaintsLockTickets(dailyPool, usageCount, today) {
  const config = TIER_CONFIG.find((c) => c.tier === 'saints_lock');
  const [minOdds, maxOdds] = TIER_ODDS_TARGET.saints_lock;
  const maxTickets = getDailySlipCount('saints_lock', dailyPool.length, new Date());

  const inOddsRange = (p) => {
    const used = usageCount.get(p.fixtureId) ?? 0;
    return used < MAX_FIXTURE_APPEARANCES_PER_DAY && p.odds >= minOdds && p.odds <= maxOdds;
  };

  let qualifying = dailyPool
    .filter((p) => inOddsRange(p) && p.confidence >= SAINTS_LOCK_MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence);

  // Minimum 1/day guarantee: if nothing clears the strict 85% bar, relax to
  // the single best-available fixture in the odds range rather than
  // shipping zero. Still quality-first — this only ever produces ONE
  // ticket at the relaxed bar, never a second one, since a second slot at
  // reduced confidence would defeat the "next to impossible" positioning.
  let usedFallback = false;
  if (qualifying.length === 0) {
    const fallback = dailyPool.filter(inOddsRange).sort((a, b) => b.confidence - a.confidence);
    if (fallback.length > 0) {
      qualifying = [fallback[0]];
      usedFallback = true;
      // eslint-disable-next-line no-console
      console.warn(
        `Saint's Lock: no fixture cleared ${SAINTS_LOCK_MIN_CONFIDENCE}% today — ` +
          `using best available (${fallback[0].confidence}%) to meet the minimum-1-per-day guarantee.`
      );
    }
  }

  const chosen = qualifying.slice(0, usedFallback ? 1 : maxTickets);
  const tickets = [];
  const ticketMatches = [];
  const fixturesUsed = [];

  chosen.forEach((pick, i) => {
    usageCount.set(pick.fixtureId, (usageCount.get(pick.fixtureId) ?? 0) + 1);
    fixturesUsed.push(pick);

    const ticketId = `${today}-saints_lock-${i}`;
    const slipLabel = chosen.length > 1 ? `${i + 1} of ${chosen.length}` : null;

    tickets.push({
      id: ticketId,
      ticket_date: today,
      tier: 'saints_lock',
      slip_label: slipLabel,
      match_count: 1,
      odds_range: config.oddsRange,
      total_odds: pick.odds,
      is_free: false,
    });
    ticketMatches.push({ ticket_id: ticketId, fixture_id: pick.fixtureId, sort_order: 0 });
  });

  return { tickets, ticketMatches, fixturesUsed };
}

function buildTickets(dailyPool, weeklyPool) {
  const now = new Date();
  const today = dateStr(now);
  const tickets = [];
  const ticketMatches = [];
  const fixturesUsed = new Map();
  const usageCount = new Map(); // shared across every tier/slip for the day

  // Saint's Lock uses its own dedicated selection (see buildSaintsLockTickets)
  // rather than the generic per-tier loop below — it's held to a much
  // stricter confidence bar than every other category.
  const saintsLock = buildSaintsLockTickets(dailyPool, usageCount, today);
  tickets.push(...saintsLock.tickets);
  ticketMatches.push(...saintsLock.ticketMatches);
  saintsLock.fixturesUsed.forEach((f) => fixturesUsed.set(f.fixtureId, f));

  TIER_CONFIG.forEach((config) => {
    if (config.tier === 'saints_lock') return; // handled above

    const isWeekly = config.tier === 'weekly_lite' || config.tier === 'weekly_titan';
    const basePool = isWeekly ? weeklyPool : dailyPool;
    const pool = poolForTier(basePool, config.tier);
    const count = getDailySlipCount(config.tier, dailyPool.length, now);
    const targetRange = TIER_ODDS_TARGET[config.tier] ?? null;

    for (let i = 0; i < count; i++) {
      const picks = pickFixturesForSlip(pool, config.matchCount, usageCount, targetRange);
      if (picks.length === 0) continue; // couldn't assemble a valid combination today — skip this slip rather than force it

      picks.forEach((p) => {
        fixturesUsed.set(p.fixtureId, p);
        usageCount.set(p.fixtureId, (usageCount.get(p.fixtureId) ?? 0) + 1);
      });

      const totalOdds = Math.round(picks.reduce((acc, p) => acc * p.odds, 1) * 100) / 100;
      const ticketId = `${today}-${config.tier}-${i}`;
      const slipLabel = count > 1 ? `${i + 1} of ${count}` : null;

      tickets.push({
        id: ticketId,
        ticket_date: today,
        tier: config.tier,
        slip_label: slipLabel,
        match_count: picks.length, // actual legs used — may be fewer than config.matchCount's ceiling
        odds_range: config.oddsRange,
        total_odds: totalOdds,
        is_free: config.alwaysFree,
      });

      picks.forEach((p, idx) => {
        ticketMatches.push({ ticket_id: ticketId, fixture_id: p.fixtureId, sort_order: idx });
      });
    }
  });

  return { tickets, ticketMatches, fixturesUsed: Array.from(fixturesUsed.values()) };
}

// --- Main ---------------------------------------------------------------------

async function main() {
  const today = new Date();
  const dailyDates = [dateStr(today)];
  const weeklyDates = [dateStr(today)];
  for (let i = 1; i <= WEEKLY_LOOKAHEAD_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    weeklyDates.push(dateStr(d));
  }

  console.log('Fetching daily fixture pool...');
  const dailyPool = await fetchPricedFixtures(dailyDates, MAX_ODDS_LOOKUPS_PER_RUN);
  console.log(`Priced ${dailyPool.length} fixtures for today.`);

  console.log('Fetching weekly fixture pool (for Weekly Lite / Weekly Titan)...');
  const weeklyPool = await fetchPricedFixtures(weeklyDates, MAX_ODDS_LOOKUPS_PER_RUN);
  console.log(`Priced ${weeklyPool.length} fixtures for the week ahead.`);

  const { tickets, ticketMatches, fixturesUsed } = buildTickets(dailyPool, weeklyPool);

  if (tickets.length === 0) {
    console.warn('No tickets could be assembled — not enough priced fixtures today. Nothing written.');
    return;
  }

  const supabase = getSupabaseAdmin();

  const fixtureRows = fixturesUsed.map((f) => ({
    id: f.fixtureId,
    ticket_date: f.ticketDate,
    league: f.league,
    home_team: f.homeTeam,
    away_team: f.awayTeam,
    kickoff: f.kickoff,
    market: f.market,
    odds: f.odds,
    confidence: f.confidence,
  }));

  const { error: fixturesErr } = await supabase.from('fixtures').upsert(fixtureRows, { onConflict: 'id' });
  if (fixturesErr) throw fixturesErr;

  const { error: ticketsErr } = await supabase.from('tickets').upsert(tickets, { onConflict: 'id' });
  if (ticketsErr) throw ticketsErr;

  const { error: linksErr } = await supabase
    .from('ticket_matches')
    .upsert(ticketMatches, { onConflict: 'ticket_id,fixture_id' });
  if (linksErr) throw linksErr;

  console.log(`Wrote ${tickets.length} tickets, ${fixtureRows.length} fixtures.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
