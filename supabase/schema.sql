-- ---------------------------------------------------------------------------
-- Odd Saint — database schema
-- Run this once in Supabase: Project → SQL Editor → New query → paste → Run.
--
-- Design: the daily ticket-generation and grading jobs (GitHub Actions,
-- using the SERVICE ROLE key — never exposed to the browser) write into
-- these tables. The live site reads them with the public ANON key, which
-- is restricted to read-only via the RLS policies below. The anon key can
-- never insert, update, or delete a row here, even though it's public.
-- ---------------------------------------------------------------------------

-- One row per real football fixture that's been pulled in and used as a
-- pick. `result_status` starts 'pending' and is updated by the grading job
-- once the match finishes.
create table if not exists fixtures (
  id bigint primary key,                 -- external API-Football fixture ID
  ticket_date date not null,
  league text not null,
  home_team text not null,
  away_team text not null,
  kickoff timestamptz not null,
  market text not null,                  -- e.g. "Home Win", "Over 2.5 Goals"
  odds numeric not null,
  confidence int not null check (confidence between 0 and 100),
  final_home_score int,
  final_away_score int,
  result_status text not null default 'pending'
    check (result_status in ('pending', 'green', 'red')),
  created_at timestamptz not null default now()
);

create index if not exists fixtures_date_idx on fixtures (ticket_date);
create index if not exists fixtures_pending_idx on fixtures (result_status) where result_status = 'pending';

-- One row per generated ticket (e.g. "2026-08-10-bronze-2").
create table if not exists tickets (
  id text primary key,
  ticket_date date not null,
  tier text not null,
  slip_label text,                       -- e.g. "2 of 4", null for single-slip tiers
  match_count int not null,
  odds_range text not null,
  total_odds numeric not null,
  is_free boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tickets_date_idx on tickets (ticket_date);

-- Join table: which fixtures belong to which ticket, and in what order.
create table if not exists ticket_matches (
  ticket_id text not null references tickets(id) on delete cascade,
  fixture_id bigint not null references fixtures(id) on delete cascade,
  sort_order int not null default 0,
  primary key (ticket_id, fixture_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — public can READ, nobody public can WRITE.
-- Writes only ever happen via the service_role key in the GitHub Actions
-- jobs, which bypasses RLS entirely, so no write policy is needed for it.
-- ---------------------------------------------------------------------------
alter table fixtures enable row level security;
alter table tickets enable row level security;
alter table ticket_matches enable row level security;

drop policy if exists "public read fixtures" on fixtures;
create policy "public read fixtures" on fixtures for select using (true);

drop policy if exists "public read tickets" on tickets;
create policy "public read tickets" on tickets for select using (true);

drop policy if exists "public read ticket_matches" on ticket_matches;
create policy "public read ticket_matches" on ticket_matches for select using (true);
