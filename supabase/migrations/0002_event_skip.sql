-- Occurrences of an event the student cancelled (the event itself is never changed).
alter table calendar_events add column if not exists skip jsonb;
