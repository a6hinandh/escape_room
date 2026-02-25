-- ============================================================
-- Run this in Supabase SQL Editor to update the existing schema
-- ============================================================

-- 1. Add 'terminated' column to teams (force-terminate by controller)
alter table teams add column if not exists terminated boolean default false;

-- 2. Enable Realtime on broadcast table so participants receive live inserts
alter publication supabase_realtime add table broadcast;

-- 3. Enable Realtime on teams table so dashboards can react to activation changes
alter publication supabase_realtime add table teams;

-- 4. RLS policies (adjust as needed for your project)
-- Allow anon read on teams (for login check + leaderboard)
alter table teams enable row level security;
create policy "anon_read_teams" on teams for select using (true);
create policy "anon_insert_teams" on teams for insert with check (true);
create policy "anon_update_teams" on teams for update using (true);

-- Allow anon read/insert on submissions
alter table submissions enable row level security;
create policy "anon_read_submissions" on submissions for select using (true);
create policy "anon_insert_submissions" on submissions for insert with check (true);

-- Allow anon delete on submissions (used by Admin "Clear Logs")
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'submissions'
      and policyname = 'anon_delete_submissions'
  ) then
    create policy "anon_delete_submissions" on submissions for delete using (true);
  end if;
end $$;

-- Allow anon read/insert on broadcast
alter table broadcast enable row level security;
create policy "anon_read_broadcast" on broadcast for select using (true);
create policy "anon_insert_broadcast" on broadcast for insert with check (true);

-- Allow anon read/update on settings
alter table settings enable row level security;
create policy "anon_read_settings" on settings for select using (true);
create policy "anon_update_settings" on settings for update using (true);

-- Allow anon insert on settings (required for UPSERT when row doesn't exist)
-- Constrain to the singleton row.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'settings'
      and policyname = 'anon_insert_settings'
  ) then
    create policy "anon_insert_settings" on settings for insert with check (id = 1);
  end if;
end $$;

-- Ensure the singleton settings row exists
insert into settings (id, final_key) values (1, '')
on conflict (id) do nothing;

-- Allow anon delete on teams (for remove team feature)
create policy "anon_delete_teams" on teams for delete using (true);

-- ============================================================
-- v2 migrations — run these in Supabase SQL Editor
-- ============================================================

-- 5. Add max_attempts per team (admin can set custom limit, default 2)
alter table teams add column if not exists max_attempts int default 2;

-- 6. Mark admin rows so they are hidden from the participant teams list
alter table teams add column if not exists is_admin boolean default false;

-- 7. Full replica identity so realtime delivers old/new rows on UPDATE/DELETE
alter table teams replica identity full;
alter table broadcast replica identity full;
alter table submissions replica identity full;

-- ============================================================
-- v3 migrations — document assignment + deactivate status
-- ============================================================

-- 8. Add deactivated column (used to pause a session from the control room)
alter table teams add column if not exists deactivated boolean default false;

-- 9. Add document_url column for admin-assigned documents per team
alter table teams add column if not exists document_url text;

-- 9b. Add per-team key (assigned by admin)
alter table teams add column if not exists final_key text;

-- 9c. Pause/resume support (Deactivate pauses the clock)
alter table teams add column if not exists paused_remaining_seconds int;
alter table teams add column if not exists paused_at timestamptz;

-- 10. Create storage bucket for team documents
--     Run this in the Supabase SQL Editor:
insert into storage.buckets (id, name, public) values ('team-documents', 'team-documents', true)
on conflict (id) do nothing;

-- 11. Allow public read access to team-documents bucket
create policy "public_read_team_documents" on storage.objects
  for select using (bucket_id = 'team-documents');

-- 12. Allow anon uploads to team-documents bucket
create policy "anon_upload_team_documents" on storage.objects
  for insert with check (bucket_id = 'team-documents');

-- 13. Allow anon updates (upsert) to team-documents bucket
create policy "anon_update_team_documents" on storage.objects
  for update using (bucket_id = 'team-documents');
