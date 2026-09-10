-- Final step of the add-backfill-constrain sequence: every recipient now
-- belongs to an institution, so enforce the invariant at the schema level.
-- After this, a recipient can never be created without an institution —
-- app/api/admin/recipients and seed scripts must always stamp institution_id.
-- Safe on an empty recipients table (no rows to violate the constraint).
alter table care_recipients
  alter column institution_id set not null;
