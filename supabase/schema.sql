-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run

create table if not exists public.itineraries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  request     jsonb not null,   -- the preferences the user entered
  itinerary   jsonb not null,   -- the generated day-by-day plan
  source      text not null default 'ai',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists itineraries_user_created_idx on public.itineraries (user_id, created_at desc);

alter table public.itineraries enable row level security;

create policy "Users read own trips"   on public.itineraries for select using (auth.uid() = user_id);
create policy "Users insert own trips" on public.itineraries for insert with check (auth.uid() = user_id);
create policy "Users update own trips" on public.itineraries for update using (auth.uid() = user_id);
create policy "Users delete own trips" on public.itineraries for delete using (auth.uid() = user_id);

-- ============ v2 additions: public share links (safe to re-run) ============
alter table public.itineraries add column if not exists share_token text unique;

-- Lets anyone with the link read ONE shared trip, without exposing the table or the owner.
create or replace function public.get_shared_trip(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(t) - 'user_id' - 'share_token'
  from public.itineraries t
  where t.share_token = p_token
  limit 1;
$$;

grant execute on function public.get_shared_trip(text) to anon, authenticated;
