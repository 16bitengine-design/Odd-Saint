// ---------------------------------------------------------------------------
// Odd Saint — data layer
// Ships with lightweight in-memory mock data so the UI is fully functional
// out of the box. Swap the two `fetch*` functions below for real Supabase
// table queries once your schema is ready (see comments inline).
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

const LEAGUES = ['EPL', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'UCL'];
const TEAMS = [
  'Arsenal', 'Chelsea', 'Real Madrid', 'Barcelona', 'Bayern Munich', 'Dortmund',
  'AC Milan', 'Inter Milan', 'PSG', 'Marseille', 'Man City', 'Liverpool',
  'Atletico Madrid', 'Juventus', 'Napoli', 'Leipzig',
];
const MARKETS = ['Over 1.5 Goals', 'Home Win', 'Away Win', 'BTTS', 'Draw No Bet', 'Over 2.5 Goals'];

function seededRandom(seed: number) {
  // Deterministic pseudo-random generator so mock data is stable per session.
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
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

function buildTicket(config: TierConfig, seedOffset: number): Ticket {
  const rand = seededRandom(seedOffset * 7919 + 13);
  const matches = Array.from({ length: config.matchCount }, (_, i) =>
    buildMatch(rand, i, seedOffset)
  );
  const totalOdds = Math.round(matches.reduce((acc, m) => acc * m.odds, 1) * 100) / 100;

  return {
    id: `t-${config.tier}`,
    tier: config.tier,
    label: config.label,
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
 * Fetch all tickets. Replace this mock implementation with a real
 * Supabase query, e.g.:
 *
 *   const { data, error } = await supabase
 *     .from('tickets')
 *     .select('*, matches(*)')
 *     .order('created_at', { ascending: false });
 */
export async function fetchTickets(): Promise<Ticket[]> {
  return TIER_CONFIG.map((config, idx) => buildTicket(config, idx + 1));
}

/**
 * Fetch a single ticket by tier.
 */
export async function fetchTicketByTier(tier: TicketTier): Promise<Ticket | null> {
  const config = TIER_CONFIG.find((c) => c.tier === tier);
  if (!config) return null;
  return buildTicket(config, TIER_CONFIG.indexOf(config) + 1);
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
