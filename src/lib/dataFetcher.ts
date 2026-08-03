// ---------------------------------------------------------------------------
// Odd Saint — data layer
// Ships with lightweight, DETERMINISTIC mock data so the UI is fully
// functional out of the box, including a rolling performance history —
// without needing a backend yet. Every ticket is seeded from its calendar
// date + tier + slip number, so calling the same day twice always returns
// identical tickets and identical red/green outcomes. That determinism is
// what lets `fetchPerformanceHistory()` "remember" past days without a
// database: it just re-derives them from the date.
//
// Swap the functions marked below for real Supabase table queries once your
// schema is ready — at that point tickets and results should be written
// once by your grading job and read verbatim, rather than regenerated.
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
  /** e.g. "2 of 5" when a tier generates multiple slips per day, else undefined */
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

// How many fresh slips of each tier get generated per calendar day.
// Bronze and Gold are the high-frequency, high-volume tiers; everything
// else ships one curated slip per day.
export const DAILY_TICKET_COUNTS: Record<TicketTier, number> = {
  mega: 1,
  bronze: 5,
  gold: 5,
  silver: 1,
  platinum: 1,
  diamond: 1,
  weekly_lite: 1,
  weekly_titan: 1,
};

const LEAGUES = ['EPL', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'UCL'];
const TEAMS = [
  'Arsenal', 'Chelsea', 'Real Madrid', 'Barcelona', 'Bayern Munich', 'Dortmund',
  'AC Milan', 'Inter Milan', 'PSG', 'Marseille', 'Man City', 'Liverpool',
  'Atletico Madrid', 'Juventus', 'Napoli', 'Leipzig',
];
const MARKETS = ['Over 1.5 Goals', 'Home Win', 'Away Win', 'BTTS', 'Draw No Bet', 'Over 2.5 Goals'];

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

function buildMatch(rand: () => number, index: number, seedOffset: number): Match {
  const league = LEAGUES[Math.floor(rand() * LEAGUES.length)];
  const home = TEAMS[Math.floor(rand() * TEAMS.length)];
  let away = TEAMS[Math.floor(rand() * TEAMS.length)];
  if (away === home) away = TEAMS[(TEAMS.indexOf(away) + 1) % TEAMS.length];
  const market = MARKETS[Math.floor(rand() * MARKETS.length)];
  const odds = Math.round((1.3 + rand() * 2.5) * 100) / 100;
  const statusRoll = rand();
  const status: MatchStatus = statusRoll < 0.55 ? 'green' : statusRoll < 0.8 ? 'pending' : 'red';
  const confidence = Math.round(60 + rand() * 38);

  return {
    id: `m-${seedOffset}-${index}`,
    league,
    homeTeam: home,
    awayTeam: away,
    market,
    odds,
    kickoff: new Date(Date.now() + index * 3600_000).toISOString(),
    status,
    confidence,
  };
}

function buildTicket(config: TierConfig, seed: number, slipLabel?: string): Ticket {
  const rand = seededRandom(seed);
  const matches = Array.from({ length: config.matchCount }, (_, i) => buildMatch(rand, i, seed));
  const totalOdds = Math.round(matches.reduce((acc, m) => acc * m.odds, 1) * 100) / 100;

  return {
    id: `t-${config.tier}-${seed}`,
    tier: config.tier,
    label: config.label,
    slipLabel,
    matchCount: config.matchCount,
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
 * Generates every ticket for a given calendar day: 5 Bronze slips, 5 Gold
 * slips, and 1 slip for every other tier — deterministically, so the same
 * date always regenerates identical tickets and outcomes.
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
    const count = DAILY_TICKET_COUNTS[config.tier];
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
 * Fetch every slip for one tier on a given day (e.g. all 5 Bronze slips).
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
// of recomputing it client-side.

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
