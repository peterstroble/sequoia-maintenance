-- Adds fields needed for Schedule-tab progress tracking and scheduling history.
-- Run this once against the project's Supabase database (SQL editor or `supabase db push`).
-- The app degrades gracefully if these columns are missing (see src/supabase.js),
-- but the new features (status cycle, reschedule history) won't persist until this runs.

alter table tasks
  add column if not exists progress_status text default 'On Track',
  add column if not exists original_scheduled_date date,
  add column if not exists reschedule_count integer default 0;
