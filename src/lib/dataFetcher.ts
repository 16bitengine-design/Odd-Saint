// ---------------------------------------------------------------------------
// Odd Saint — data layer
// Ships with lightweight, DETERMINISTIC mock data so the UI is fully
// functional out of the box, including a rolling performance history —
// without needing a backend yet. Every ticket is seeded from its calendar
// date + tier + slip number, so calling the same day twice always returns
// identical tickets and identical outcomes.
//
// IMPORTANT — read before launching to real users:
// The outcome probabilities and daily slip counts below are PLACEHOLDER
// constants for demo purposes only. They are not derived from any real
// prediction model, and the "win rate" they produce is not a genuine track
// record. Once real grading exists, replace `fetchTickets` /
// `fetchPerformanceHistory` with queries against real, graded Supabase
// tables — advertising this mock win rate to paying users as if it were a
// real historical accuracy figure would be misleading and should be avoided.
// ---------------------------------------------------------------------------

export type MatchStatus = 'pending' | 'green' | 'red';

export type TicketTier =
  | 'mega'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'weekly_lite'
  | 'weekly_titan';

export interface Match {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  market: string; // e.g. "Over 1.5 Goals", "Home Win"
  odds: number;
  kickoff: string; // ISO date string
  status: MatchStatus;
  confidence: number; // AI Data Confidence Index, 0-100 (not a guarantee)
}

export interface Ticket {
  id: string;
  tier: TicketTier;
  label: string;
  /** e.g. "2 of 4" when a tier generates multiple slips per day, else undefined */
  slipLabel?: string;
  matchCount: number;
  oddsRange: string;
  totalOdds: number;
  isFree: boolean; // true if permanently free (Mega Day Ticket)
  matches: Match[];
}

export interface TierConfig {
  tier: TicketTier;
  label: string;
  matchCount: number;
  oddsRange: string;
  alwaysFree: boolean;
}

// Tier definitions per the product spec.
export const TIER_CONFIG: TierConfig[] = [
  { tier: 'mega', label: 'Mega Day Ticket', matchCount: 4, oddsRange: '1.5-3', alwaysFree: true },
  { tier: 'bronze', label: 'Bronze', matchCount: 3, oddsRange: '2-3', alwaysFree: false },
  { tier: 'silver', label: 'Silver', matchCount: 5, oddsRange: '3-5', alwaysFree: false },
  { tier: 'gold', label: 'Gold', matchCount: 7, oddsRange: '5-10', alwaysFree: false },
  { tier: 'platinum', label: 'Platinum', matchCount: 10, oddsRange: '25-300', alwaysFree: false },
  { tier: 'diamond', label: 'Diamond', matchCount: 15, oddsRange: '300+', alwaysFree: false },
  { tier: 'weekly_lite', label: 'Weekly Lite', matchCount: 20, oddsRange: 'Mixed', alwaysFree: false },
  { tier: 'weekly_titan', label: 'Weekly Titan', matchCount: 30, oddsRange: 'Mixed', alwaysFree: false },
];

// ---------------------------------------------------------------------------
// Daily slip volume
// ---------------------------------------------------------------------------
// - Gold ships a fixed 5 slips a day.
// - Tiers with 5 matches or fewer (Mega, Bronze, Silver) scale from 1 up to
//   4 slips a day depending on how many fixtures are "available" that day
//   (a deterministic per-day busyness factor — more fixtures, more slips).
// - Everything else (Platinum, Diamond, Weekly Lite, Weekly Titan) ships 1
//   curated slip a day, since these are large accumulators by nature.

function getDailySlipCount(tier: TicketTier, day: string): number {
  if (tier === 'gold') return 5;
  if (tier === 'mega' || tier === 'bronze' || tier === 'silver') {
    const busyness = hashSeed(`${day}-busyness`) / 233280; // deterministic 0..1
    return 1 + Math.round(busyness * 3); // 1..4, maxing out on "busy" days
  }
  return 1;
}

const LEAGUES = ['EPL', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'UCL'];
const TEAMS = [
  'Arsenal', 'Chelsea', 'Real Madrid', 'Barcelona', 'Bayern Munich', 'Dortmund',
  'AC Milan', 'Inter Milan', 'PSG', 'Marseille', 'Man City', 'Liverpool',
  'Atletico Madrid', 'Juventus', 'Napoli', 'Leipzig',
];
const MARKETS = ['Over 1.5 Goals', 'Home Win', 'Away Win', 'BTTS', 'Draw No Bet', 'Over 2.5 Goals'];

// ---------------------------------------------------------------------------
// Mock outcome probabilities (PLACEHOLDER — see file header note)
// Decided at the ticket level first, then matches are generated consistent
// with that outcome, so the aggregate win rate stays predictable regardless
// of how many legs a ticket has (a 30-leg accumulator isn't punished just
// for having more matches — this is mock data, not a real settlement engine).
// ---------------------------------------------------------------------------
const OUTCOME_PROBS = { green: 0.74, red: 0.11, pending: 0.15 } as const;

function seededRandom(seed: number) {
  // Deterministic pseudo-random generator — same seed always produces the
  // same sequence, which is what makes a given day's tickets stable.
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Simple string hash so any date+tier+slip combination maps to a stable numeric seed. */
function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % 233280;
}

/** Local calendar date as 'YYYY-MM-DD', used as the root of every day's seed. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMatch(rand: () => number, index: number, seedOffset: number, forcedStatus: MatchStatus): Match {
  const league = LEAGUES[Math.floor(rand() * LEAGUES.length)];
  const home = TEAMS[Math.floor(rand() * TEAMS.length)];
  let away = TEAMS[Math.floor(rand() * TEAMS.length)];
  if (away === home) away = TEAMS[(TEAMS.indexOf(away) + 1) % TEAMS.length];
  const market = MARKETS[Math.floor(rand() * MARKETS.length)];
  const odds = Math.round((1.3 + rand() * 2.5) * 100) / 100;
  const confidence = Math.round(60 + rand() * 38);

  return {
    id: `m-${seedOffset}-${index}`,
    league,
    homeTeam: home,
    awayTeam: away,
    market,
    odds,
    kickoff: new Date(Date.now() + index * 3600_000).toISOString(),
    status: forcedStatus,
    confidence,
  };
}

/** Decide the overall ticket outcome first, then build per-match statuses consistent with it. */
function buildTicket(config: TierConfig, seed: number, slipLabel?: string): Ticket {
  const rand = seededRandom(seed);
  const n = config.matchCount;

  const outcomeRoll = rand();
  const overall: MatchStatus =
    outcomeRoll < OUTCOME_PROBS.green ? 'green' : outcomeRoll < OUTCOME_PROBS.green + OUTCOME_PROBS.red ? 'red' : 'pending';

  const statuses: MatchStatus[] = new Array(n).fill('green');
  if (overall === 'red') {
    // Exactly one losing leg — the classic "one bad selection" accumulator failure.
    const badIndex = Math.floor(rand() * n);
    statuses[badIndex] = 'red';
  } else if (overall === 'pending') {
    // A handful of legs still in play, none failed yet.
    const pendingFraction = 0.3 + rand() * 0.4;
    let anyPending = false;
    for (let i = 0; i < n; i++) {
      if (rand() < pendingFraction) {
        statuses[i] = 'pending';
        anyPending = true;
      }
    }
    if (!anyPending) statuses[0] = 'pending';
  }
  // overall === 'green' → statuses stays all-green.

  const matches = Array.from({ length: n }, (_, i) => buildMatch(rand, i, seed, statuses[i]));
  const totalOdds = Math.round(matches.reduce((acc, m) => acc * m.odds, 1) * 100) / 100;

  return {
    id: `t-${config.tier}-${seed}`,
    tier: config.tier,
    label: config.label,
    slipLabel,
    matchCount: n,
    oddsRange: config.oddsRange,
    totalOdds,
    isFree: config.alwaysFree,
    matches,
  };
}

/**
 * Returns the overall grading status for a ticket container.
 * - 'red'     if ANY match inside has failed (red)
 * - 'green'   if ALL matches are green (ticket fully won)
 * - 'pending' otherwise (still in play)
 */
export function getTicketStatus(ticket: Ticket): MatchStatus {
  if (ticket.matches.some((m) => m.status === 'red')) return 'red';
  if (ticket.matches.every((m) => m.status === 'green')) return 'green';
  return 'pending';
}

/**
 * Generates every ticket for a given calendar day — deterministically, so
 * the same date always regenerates identical tickets and outcomes.
 *
 * Replace this with a real Supabase query once tickets are graded and
 * stored server-side, e.g.:
 *
 *   const { data } = await supabase
 *     .from('tickets')
 *     .select('*, matches(*)')
 *     .eq('ticket_date', dateKey(date));
 */
export function getTicketsForDate(date: Date): Ticket[] {
  const day = dateKey(date);
  const tickets: Ticket[] = [];

  TIER_CONFIG.forEach((config) => {
    const count = getDailySlipCount(config.tier, day);
    for (let i = 0; i < count; i++) {
      const seed = hashSeed(`${day}-${config.tier}-${i}`);
      const slipLabel = count > 1 ? `${i + 1} of ${count}` : undefined;
      tickets.push(buildTicket(config, seed, slipLabel));
    }
  });

  return tickets;
}

/** Fetch all of today's tickets (async wrapper kept for a drop-in Supabase swap later). */
export async function fetchTickets(date: Date = new Date()): Promise<Ticket[]> {
  return getTicketsForDate(date);
}

/**
 * Fetch every slip for one tier on a given day (e.g. all of today's Gold slips).
 */
export async function fetchTicketsByTier(tier: TicketTier, date: Date = new Date()): Promise<Ticket[]> {
  return getTicketsForDate(date).filter((t) => t.tier === tier);
}

/**
 * Trial helper: given a user's registration date (ISO string), returns
 * how many days remain in the 30-day free trial window (never negative).
 */
export function getTrialDaysRemaining(registeredAtISO: string | null): number {
  if (!registeredAtISO) return 30;
  const registeredAt = new Date(registeredAtISO).getTime();
  const elapsedDays = Math.floor((Date.now() - registeredAt) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsedDays);
}

export function isWithinFreeTrial(registeredAtISO: string | null): boolean {
  return getTrialDaysRemaining(registeredAtISO) > 0;
}

// ---------------------------------------------------------------------------
// Anonymous trial tracking
// ---------------------------------------------------------------------------
// Visitors get the full 30-day free trial WITHOUT creating an account. The
// trial clock starts the first time a browser hits the app and is stored in
// localStorage on that device. Signing in later (magic link) is optional —
// it's only needed once the trial ends, to unlock ads/payment/subscription
// paths, or if the person wants their trial tied to an account instead of a
// single device.
const ANON_TRIAL_KEY = 'odd_saint_anon_trial_start';

export function getAnonymousTrialStart(): string {
  const fallback = new Date().toISOString();
  if (typeof window === 'undefined') return fallback;
  try {
    const existing = window.localStorage.getItem(ANON_TRIAL_KEY);
    if (existing) return existing;
    window.localStorage.setItem(ANON_TRIAL_KEY, fallback);
    return fallback;
  } catch {
    // localStorage unavailable (e.g. private browsing) — fall back to a
    // fresh trial each visit rather than blocking access.
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Performance history
// ---------------------------------------------------------------------------
// A rolling record of how many tickets ran each day and how they graded out.
// Because ticket generation is fully deterministic by date, this "history"
// doesn't need a database yet — every past day can be re-derived on demand
// and will always produce the same result. Once matches are graded by a
// real backend job, swap this to read a `daily_performance` table instead
// of recomputing it client-side — see the file header note.

export interface DayPerformance {
  date: string; // 'YYYY-MM-DD'
  ticketsGenerated: number;
  won: number;
  failed: number;
  pending: number;
  /** Win rate among decided tickets (won / (won + failed)), 0-100. Null if none decided yet. */
  winRatePct: number | null;
}

export function getDayPerformance(date: Date): DayPerformance {
  const tickets = getTicketsForDate(date);
  let won = 0;
  let failed = 0;
  let pending = 0;

  tickets.forEach((t) => {
    const status = getTicketStatus(t);
    if (status === 'green') won++;
    else if (status === 'red') failed++;
    else pending++;
  });

  const decided = won + failed;
  return {
    date: dateKey(date),
    ticketsGenerated: tickets.length,
    won,
    failed,
    pending,
    winRatePct: decided > 0 ? Math.round((won / decided) * 100) : null,
  };
}

/**
 * Returns performance for the last `days` calendar days, most recent first
 * (today is index 0).
 */
export async function fetchPerformanceHistory(days: number = 14): Promise<DayPerformance[]> {
  const history: DayPerformance[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    history.push(getDayPerformance(d));
  }
  return history;
}

/**
 * Aggregate win rate across the last `days` days — a single headline number
 * for the landing hero (e.g. "78% win rate over the last 14 days").
 */
export function summarizeHistory(history: DayPerformance[]): {
  totalWon: number;
  totalFailed: number;
  winRatePct: number | null;
} {
  const totalWon = history.reduce((acc, d) => acc + d.won, 0);
  const totalFailed = history.reduce((acc, d) => acc + d.failed, 0);
  const decided = totalWon + totalFailed;
  return {
    totalWon,
    totalFailed,
    winRatePct: decided > 0 ? Math.round((totalWon / decided) * 100) : null,
  };
}
