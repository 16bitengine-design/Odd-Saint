// ---------------------------------------------------------------------------
// Minimal API-Football (api-football.com / api-sports.io) client.
// Uses Node's built-in fetch (Node 18+), so no extra dependency is needed.
//
// Sign up at https://www.api-football.com — the free plan gives 100
// requests/day, which is enough for one daily generation run plus a few
// grading passes if you keep request usage modest (see the LEAGUE
// allowlist and MAX_FIXTURES cap in generate-tickets.mjs).
// ---------------------------------------------------------------------------

const API_BASE = 'https://v3.football.api-sports.io';

function requireApiKey() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error(
      'Missing API_FOOTBALL_KEY environment variable. Add it as a GitHub Actions secret.'
    );
  }
  return key;
}

async function apiFootballGet(path, params = {}) {
  const key = requireApiKey();
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url, {
    headers: { 'x-apisports-key': key },
  });

  if (!res.ok) {
    throw new Error(`API-Football request failed (${res.status}): ${url}`);
  }

  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    // eslint-disable-next-line no-console
    console.warn('API-Football returned errors:', json.errors);
  }
  return json.response ?? [];
}

/** Fixtures scheduled on a given YYYY-MM-DD date. */
export async function getFixturesForDate(dateStr) {
  return apiFootballGet('/fixtures', { date: dateStr });
}

/** Bookmaker odds for a single fixture ID (may be empty on the free plan for some leagues/fixtures). */
export async function getOddsForFixture(fixtureId) {
  return apiFootballGet('/odds', { fixture: fixtureId });
}

/** Re-fetch specific fixtures by ID — used to check final scores for grading. */
export async function getFixturesByIds(ids) {
  if (ids.length === 0) return [];
  return apiFootballGet('/fixtures', { ids: ids.join('-') });
}
