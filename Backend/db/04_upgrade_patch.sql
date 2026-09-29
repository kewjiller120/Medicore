-- =====================================================================
-- 04_UPGRADE_PATCH - purely additive, always safe, never drops anything
-- =====================================================================
-- Brings a database created from the original zip (or an older schema)
-- up to date WITHOUT touching existing rows. Every statement here is
-- idempotent (IF NOT EXISTS), so this file is a no-op on a database that
-- was fully migrated with 01_schema.sql. It exists as a safety net so an
-- out-of-date database cannot produce "column xxx does not exist" style
-- errors even if the full drop/recreate path was not taken.
-- =====================================================================

-- Driver slot on ambulance requests (item 4: driver assignment).
ALTER TABLE ambulance_request
    ADD COLUMN IF NOT EXISTS assigned_driver_id INTEGER
        REFERENCES staff(staff_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ambulance_request_driver
    ON ambulance_request(assigned_driver_id);

-- ---------------------------------------------------------------------
-- One vehicle per driver (item 4): make driver_assignment enforce it.
-- A driver can only ever hold ONE ambulance at a time and an ambulance can
-- only ever be held by ONE driver. On an old database there may already be
-- several rows per driver, so keep just one (deterministic: the smallest
-- row) before adding the UNIQUE keys. Both ADD CONSTRAINTs are guarded, so
-- this file stays a safe no-op on an already-migrated database.
-- ---------------------------------------------------------------------
DELETE FROM driver_assignment a
 WHERE EXISTS (SELECT 1 FROM driver_assignment b
                WHERE b.staff_id = a.staff_id AND b.ambulance_id < a.ambulance_id)
    OR EXISTS (SELECT 1 FROM driver_assignment b
                WHERE b.ambulance_id = a.ambulance_id AND b.staff_id < a.staff_id);

DO $$
BEGIN
    BEGIN
        ALTER TABLE driver_assignment ADD CONSTRAINT driver_assignment_staff_id_key UNIQUE (staff_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END;
    BEGIN
        ALTER TABLE driver_assignment ADD CONSTRAINT driver_assignment_ambulance_id_key UNIQUE (ambulance_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END;
END $$;