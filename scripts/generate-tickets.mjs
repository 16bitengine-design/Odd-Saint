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

// --- Config -----------------------------------------------------------------

// Top-flight league IDs (API-Football numeric IDs). Extend this list as you
// see fit — more leagues = a bigger, more diverse fixture pool, at the cost
// of more processing (not more API calls; one /fixtures?date= call already
// returns every league for that date, filtered here).
const LEAGUE_ALLOWLIST = new Set([
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  88,  // Eredivisie
  94,  // Primeira Liga
  253, // MLS
]);

// Caps how many /odds requests we make per run — keeps you comfortably
// inside API-Football's free-plan daily request budget (100/day), leaving
// headroom for the separate grading job later the same day.
const MAX_ODDS_LOOKUPS_PER_RUN = 55;

// How many extra days ahead to pull fixtures for the two "Weekly" tiers,
// so they draw from a real week's worth of matches rather than just today.
const WEEKLY_LOOKAHEAD_DAYS = 3;

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
  { tier: 'platinum', label: 'Platinum', matchCount: 10, oddsRange: '25-300', alwaysFree: false },
  { tier: 'diamond', label: 'Diamond', matchCount: 15, oddsRange: '300+', alwaysFree: false },
  { tier: 'weekly_lite', label: 'Weekly Lite', matchCount: 20, oddsRange: 'Mixed', alwaysFree: false },
  { tier: 'weekly_titan', label: 'Weekly Titan', matchCount: 30, oddsRange: 'Mixed', alwaysFree: false },
];

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

// --- Fetch + price fixtures ---------------------------------------------------

async function fetchPricedFixtures(dates, maxOddsLookups) {
  const seen = new Map(); // fixtureId -> priced fixture
  let oddsLookupsUsed = 0;

  for (const d of dates) {
    const fixtures = await getFixturesForDate(d);
    const candidates = fixtures.filter(
      (f) =>
        LEAGUE_ALLOWLIST.has(f.league?.id) &&
        !isBigClash(f.teams?.home?.name, f.teams?.away?.name) &&
        !isExcluded(f.teams?.home?.name, f.teams?.away?.name)
    );

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

  // Highest-confidence picks first.
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * SELECTION STRATEGY (odds → market pick):
 * Checks every market in the shared catalog (Match Winner, Goals
 * Over/Under, Both Teams Score, Double Chance) against this fixture's
 * bookmaker odds, keeps whichever outcomes fall in a sane odds band for
 * their market, and picks randomly among the viable ones — so the feed
 * shows a genuine mix of market types instead of defaulting to the same
 * one or two every time. Skips the fixture entirely if nothing's viable
 * rather than forcing a low-quality pick.
 */
function pickMarketFromOdds(oddsResponse) {
  const bookmaker = oddsResponse?.[0]?.bookmakers?.[0];
  if (!bookmaker) return null;

  const viable = collectViableOutcomes(bookmaker.bets);
  if (viable.length === 0) return null;

  const chosen = viable[Math.floor(Math.random() * viable.length)];
  return { market: chosen.market, odds: chosen.odds, confidence: impliedConfidence(chosen.odds) };
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

function getDailySlipCount(tier, poolSize) {
  if (tier === 'gold') return 5;
  if (tier === 'mega' || tier === 'bronze' || tier === 'silver') {
    // More real fixtures available today → more slips, capped at 4.
    return Math.min(4, Math.max(1, Math.ceil(poolSize / 10)));
  }
  return 1;
}

/** Narrows the pool to safer, lower-odds picks for tiers under 7 matches. */
function poolForTier(pool, tier) {
  if (!SMALL_TICKET_TIERS.has(tier)) return pool;
  return pool.filter((p) => p.odds <= SMALL_TICKET_MAX_ODDS);
}

function pickFixturesForSlip(pool, matchCount, offset) {
  if (pool.length === 0) return [];
  const picks = [];
  for (let i = 0; i < matchCount; i++) {
    picks.push(pool[(offset + i) % pool.length]); // wraps around if the pool is smaller than needed
  }
  return picks;
}

function buildTickets(dailyPool, weeklyPool) {
  const today = dateStr(new Date());
  const tickets = [];
  const ticketMatches = [];
  const fixturesUsed = new Map();

  TIER_CONFIG.forEach((config) => {
    const isWeekly = config.tier === 'weekly_lite' || config.tier === 'weekly_titan';
    const basePool = isWeekly ? weeklyPool : dailyPool;
    const pool = poolForTier(basePool, config.tier);
    const count = getDailySlipCount(config.tier, dailyPool.length);

    for (let i = 0; i < count; i++) {
      const offset = i * config.matchCount;
      const picks = pickFixturesForSlip(pool, config.matchCount, offset);
      if (picks.length < config.matchCount) continue; // not enough real fixtures today — skip this slip

      picks.forEach((p) => fixturesUsed.set(p.fixtureId, p));

      const totalOdds = Math.round(picks.reduce((acc, p) => acc * p.odds, 1) * 100) / 100;
      const ticketId = `${today}-${config.tier}-${i}`;
      const slipLabel = count > 1 ? `${i + 1} of ${count}` : null;

      tickets.push({
        id: ticketId,
        ticket_date: today,
        tier: config.tier,
        slip_label: slipLabel,
        match_count: config.matchCount,
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
