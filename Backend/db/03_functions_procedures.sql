-- =====================================================================
-- MEDICORE HOSPITAL MANAGEMENT SYSTEM
-- Stored Functions & Procedures
--
-- The API is deliberately thin here: hospital workflow actions and
-- analytical reports are implemented as PL/pgSQL functions/procedures
-- in the database, then exposed through the REST API (see
-- src/modules/notifications, src/modules/reports and the resource
-- controllers). Keeping this logic in Postgres means it stays correct
-- no matter which client calls it, and it directly satisfies the
-- "functions and procedures in the backend" requirement.
--
-- Naming: `fun_*` = functions (return something), `sp_*` = procedures
-- (perform an action). All are idempotent / safe to re-create.
-- =====================================================================

BEGIN;

-- =====================================================================
-- WORKFLOW PROCEDURES
-- =====================================================================

-- Approve a pending appointment (doctor accepts a requested slot).
-- Returns the updated appointment row or raises a clear error.
CREATE OR REPLACE PROCEDURE sp_approve_appointment(IN _appointment_id INTEGER, IN _doctor_id INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_row appointment%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM appointment WHERE appointment_id = _appointment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', _appointment_id;
    END IF;
    IF v_row.doctor_id <> _doctor_id THEN
        RAISE EXCEPTION 'This appointment belongs to a different doctor';
    END IF;
    IF v_row.status <> 'Pending' THEN
        RAISE EXCEPTION 'Only pending appointments can be approved (current status: %)', v_row.status;
    END IF;
    UPDATE appointment SET status = 'Approved' WHERE appointment_id = _appointment_id;
END;
$$;

-- Reject a pending appointment (doctor declines a requested slot).
CREATE OR REPLACE PROCEDURE sp_reject_appointment(IN _appointment_id INTEGER, IN _doctor_id INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_row appointment%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM appointment WHERE appointment_id = _appointment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', _appointment_id;
    END IF;
    IF v_row.doctor_id <> _doctor_id THEN
        RAISE EXCEPTION 'This appointment belongs to a different doctor';
    END IF;
    UPDATE appointment SET status = 'Rejected' WHERE appointment_id = _appointment_id;
END;
$$;

-- A doctor accepts an ambulance request addressed to their department and,
-- in that same action, dispatches it: they select an UNOCCUPIED ambulance
-- (status 'Available', not on any other trip) and an UNOCCUPIED driver (not
-- already on an active trip) and assign the task to that driver. The
-- request moves straight from Pending to Approved with both the vehicle and
-- the driver attached; the triggers flip the ambulance to 'On Trip' and
-- notify the patient + driver. The driver's single vehicle
-- (driver_assignment) becomes this ambulance, so a driver can never hold
-- two vehicles at the same time - completing/cancelling the trip releases
-- it again (trg_ambulance_request_release).
CREATE OR REPLACE PROCEDURE sp_accept_ambulance_request(
    IN _request_id INTEGER,
    IN _doctor_id INTEGER,
    IN _ambulance_id INTEGER,
    IN _driver_staff_id INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
    v_row ambulance_request%ROWTYPE;
    v_dep INTEGER;
    v_amb_status VARCHAR(20);
BEGIN
    SELECT * INTO v_row FROM ambulance_request WHERE request_id = _request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ambulance request % not found', _request_id;
    END IF;
    SELECT department_id INTO v_dep FROM doctor WHERE doctor_id = _doctor_id;
    IF v_row.department_id IS DISTINCT FROM v_dep THEN
        RAISE EXCEPTION 'You can only accept ambulance requests for your own department';
    END IF;
    IF v_row.status <> 'Pending' THEN
        RAISE EXCEPTION 'Only pending ambulance requests can be accepted (current status: %)', v_row.status;
    END IF;

    -- The driver must really be a driver. LOCK the staff row first so two
    -- requests cannot grab the same driver at the same instant.
    PERFORM 1 FROM staff WHERE staff_id = _driver_staff_id AND role = 'Driver' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only a staff member with role "Driver" can drive an ambulance';
    END IF;
    -- Availability: a driver may not be double-booked onto a second
    -- incomplete trip. 'Approved' is the active/in-trip state; terminal
    -- states (Completed/Cancelled/Rejected) free the driver again.
    IF EXISTS (
        SELECT 1 FROM ambulance_request ar
         WHERE ar.assigned_driver_id = _driver_staff_id
           AND ar.request_id <> _request_id
           AND ar.status NOT IN ('Completed', 'Cancelled', 'Rejected')
    ) THEN
        RAISE EXCEPTION 'Driver is already assigned to an active ambulance trip and cannot take another one until it is completed';
    END IF;

    -- The ambulance must exist and be free. The row lock serialises two
    -- doctors accepting at the same moment (the BEFORE trigger re-checks).
    SELECT status INTO v_amb_status FROM ambulance WHERE ambulance_id = _ambulance_id FOR UPDATE;
    IF v_amb_status IS NULL THEN
        RAISE EXCEPTION 'Ambulance % does not exist', _ambulance_id;
    ELSIF v_amb_status <> 'Available' THEN
        RAISE EXCEPTION 'Ambulance % is not available (status: %)', _ambulance_id, v_amb_status;
    END IF;

    -- Accept + dispatch in one step.
    UPDATE ambulance_request
       SET status = 'Approved',
           doctor_id = _doctor_id,
           ambulance_id = _ambulance_id,
           assigned_driver_id = _driver_staff_id
     WHERE request_id = _request_id;

    -- The driver's single vehicle becomes this ambulance (one vehicle per
    -- driver / one driver per vehicle is enforced by the UNIQUE keys).
    DELETE FROM driver_assignment WHERE ambulance_id = _ambulance_id;
    INSERT INTO driver_assignment (staff_id, ambulance_id)
    VALUES (_driver_staff_id, _ambulance_id)
    ON CONFLICT (staff_id) DO UPDATE SET ambulance_id = EXCLUDED.ambulance_id;
END;
$$;

-- A doctor rejects an ambulance request addressed to their department.
CREATE OR REPLACE PROCEDURE sp_reject_ambulance_request(IN _request_id INTEGER, IN _doctor_id INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_row ambulance_request%ROWTYPE;
    v_dep INTEGER;
BEGIN
    SELECT * INTO v_row FROM ambulance_request WHERE request_id = _request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ambulance request % not found', _request_id;
    END IF;
    SELECT department_id INTO v_dep FROM doctor WHERE doctor_id = _doctor_id;
    IF v_row.department_id IS DISTINCT FROM v_dep THEN
        RAISE EXCEPTION 'You can only reject ambulance requests for your own department';
    END IF;
    IF v_row.status <> 'Pending' THEN
        RAISE EXCEPTION 'Only pending ambulance requests can be rejected (current status: %)', v_row.status;
    END IF;
    UPDATE ambulance_request SET status = 'Rejected', doctor_id = _doctor_id
     WHERE request_id = _request_id;
END;
$$;

-- Admin may change the ambulance attached to an approved request (the
-- doctor attaches the vehicle at accept time; this is for corrections).
-- The vehicle must still be 'Available'; the triggers flip the old one back
-- to 'Available' and the new one to 'On Trip'. If a driver is already on
-- the request, their single vehicle (driver_assignment) follows the new
-- ambulance so the pairing never goes out of sync with what they drive.
CREATE OR REPLACE PROCEDURE sp_assign_ambulance(IN _request_id INTEGER, IN _ambulance_id INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_row ambulance_request%ROWTYPE;
    v_status VARCHAR(20);
BEGIN
    SELECT * INTO v_row FROM ambulance_request WHERE request_id = _request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ambulance request % not found', _request_id;
    END IF;
    IF v_row.status NOT IN ('Approved') THEN
        RAISE EXCEPTION 'Only approved ambulance requests can be assigned (current status: %)', v_row.status;
    END IF;
    SELECT status INTO v_status FROM ambulance WHERE ambulance_id = _ambulance_id FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Ambulance % does not exist', _ambulance_id;
    ELSIF v_status <> 'Available' THEN
        RAISE EXCEPTION 'Ambulance % is not available (status: %)', _ambulance_id, v_status;
    END IF;
    UPDATE ambulance_request SET ambulance_id = _ambulance_id WHERE request_id = _request_id;
    IF v_row.assigned_driver_id IS NOT NULL THEN
        DELETE FROM driver_assignment WHERE ambulance_id = _ambulance_id;
        INSERT INTO driver_assignment (staff_id, ambulance_id)
        VALUES (v_row.assigned_driver_id, _ambulance_id)
        ON CONFLICT (staff_id) DO UPDATE SET ambulance_id = EXCLUDED.ambulance_id;
    END IF;
END;
$$;

-- Pick (or swap) the driver for an accepted request that already has an
-- ambulance. Only staff with the 'Driver' role can be assigned; a driver
-- can only be put on ONE active trip at a time (availability check), and
-- their single vehicle (driver_assignment) follows this request's
-- ambulance. Completing/cancelling the trip releases the pairing again, so
-- the driver + vehicle become vacant (trg_ambulance_request_release).
CREATE OR REPLACE PROCEDURE sp_assign_driver(IN _request_id INTEGER, IN _driver_staff_id INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_row ambulance_request%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM ambulance_request WHERE request_id = _request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ambulance request % not found', _request_id;
    END IF;
    -- LOCK the staff row too, so two requests cannot grab the same driver.
    PERFORM 1 FROM staff WHERE staff_id = _driver_staff_id AND role = 'Driver' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only a staff member with role "Driver" can drive an ambulance';
    END IF;
    IF v_row.status <> 'Approved' THEN
        RAISE EXCEPTION 'A driver can only be assigned to an accepted ambulance request (current status: %)', v_row.status;
    END IF;
    IF v_row.ambulance_id IS NULL THEN
        RAISE EXCEPTION 'Assign an ambulance to the request before assigning a driver';
    END IF;
    -- Availability: a driver may not be double-booked onto a second
    -- incomplete trip. 'Approved' is the active/in-trip state; terminal
    -- states (Completed/Cancelled/Rejected) free the driver again.
    IF EXISTS (
        SELECT 1 FROM ambulance_request ar
         WHERE ar.assigned_driver_id = _driver_staff_id
           AND ar.request_id <> _request_id
           AND ar.status NOT IN ('Completed', 'Cancelled', 'Rejected')
    ) THEN
        RAISE EXCEPTION 'Driver is already assigned to an active ambulance trip and cannot take another one until it is completed';
    END IF;
    UPDATE ambulance_request SET assigned_driver_id = _driver_staff_id WHERE request_id = _request_id;

    -- Keep the driver's single vehicle in lockstep with the request's
    -- ambulance (one vehicle per driver / one driver per vehicle).
    DELETE FROM driver_assignment WHERE ambulance_id = v_row.ambulance_id;
    INSERT INTO driver_assignment (staff_id, ambulance_id)
    VALUES (_driver_staff_id, v_row.ambulance_id)
    ON CONFLICT (staff_id) DO UPDATE SET ambulance_id = EXCLUDED.ambulance_id;
END;
$$;

-- Mark an admission as discharged (trigger fills discharge_date and frees
-- the room). Nurses/front-desk use this at checkout.
CREATE OR REPLACE PROCEDURE sp_discharge_patient(IN _admission_id INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_row admission%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM admission WHERE admission_id = _admission_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admission % not found', _admission_id;
    END IF;
    UPDATE admission SET status = 'Discharged' WHERE admission_id = _admission_id;
END;
$$;

-- Record a payment against a bill. A payment starts 'Pending' and only
-- becomes valid (counts towards billing.status and revenue) once the
-- accountant confirms it via sp_confirm_payment() - see the
-- fn_update_billing_status + notification triggers.
CREATE OR REPLACE PROCEDURE sp_record_payment(
    IN _bill_id INTEGER, IN _amount NUMERIC, IN _payment_method VARCHAR(30), IN _payment_date DATE
)
LANGUAGE plpgsql AS $$
BEGIN
    IF _amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;
    INSERT INTO payment (bill_id, amount, payment_method, payment_date)
    VALUES (_bill_id, _amount, _payment_method, COALESCE(_payment_date, CURRENT_DATE));
END;
$$;

-- Confirm a pending payment: this is the moment it becomes a *valid*
-- payment. The AFTER UPDATE trigger on payment.status recalculates the
-- parent bill's status. Only an accountant (or admin) may call this.
CREATE OR REPLACE PROCEDURE sp_confirm_payment(
    IN _payment_id INTEGER, IN _accountant_staff_id INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM payment WHERE payment_id = _payment_id) THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;

    UPDATE payment
       SET status = 'Confirmed',
           confirmed_by = _accountant_staff_id,
           confirmed_at = CURRENT_TIMESTAMP
     WHERE payment_id = _payment_id
       AND status = 'Pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only a pending payment can be confirmed';
    END IF;
END;
$$;

-- Reject a pending payment (e.g. wrong amount or method). A rejected
-- payment never counts towards the bill; the row is kept for the audit
-- trail. May be called by an accountant (or admin).
CREATE OR REPLACE PROCEDURE sp_reject_payment(
    IN _payment_id INTEGER, IN _accountant_staff_id INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM payment WHERE payment_id = _payment_id) THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;

    UPDATE payment
       SET status = 'Rejected',
           confirmed_by = _accountant_staff_id,
           confirmed_at = CURRENT_TIMESTAMP
     WHERE payment_id = _payment_id
       AND status = 'Pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only a pending payment can be rejected';
    END IF;
END;
$$;

-- =====================================================================
-- ANALYTICAL / REPORTING FUNCTIONS
-- =====================================================================

-- Revenue summary broken down by payment method for a date range.
-- Only accountant-*confirmed* payments count as revenue; pending or
-- rejected payments are not realised income yet.
CREATE OR REPLACE FUNCTION fun_revenue_summary(_from_date DATE, _to_date DATE)
RETURNS TABLE (payment_method VARCHAR(30), tx_count BIGINT, total NUMERIC(12,2))
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT p.payment_method,
           COUNT(*)::BIGINT AS tx_count,
           COALESCE(SUM(p.amount), 0)::NUMERIC(12,2) AS total
      FROM payment p
     WHERE p.status = 'Confirmed'
       AND p.payment_date BETWEEN COALESCE(_from_date, '1900-01-01') AND COALESCE(_to_date, CURRENT_DATE)
     GROUP BY p.payment_method
     ORDER BY total DESC;
END;
$$;

-- Room occupancy snapshot grouped by room type.
CREATE OR REPLACE FUNCTION fun_room_occupancy()
RETURNS TABLE (type VARCHAR(30), total_rooms BIGINT, available BIGINT, occupied BIGINT, maintenance BIGINT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT r.type,
           COUNT(*)::BIGINT AS total_rooms,
           COUNT(*) FILTER (WHERE r.status = 'Available')::BIGINT AS available,
           COUNT(*) FILTER (WHERE r.status = 'Occupied')::BIGINT AS occupied,
           COUNT(*) FILTER (WHERE r.status = 'Maintenance')::BIGINT AS maintenance
      FROM room r
     GROUP BY r.type
     ORDER BY r.type;
END;
$$;

-- Medicines at or below a stock threshold (used by pharmacy re-ordering).
CREATE OR REPLACE FUNCTION fun_low_stock_medicines(_threshold INTEGER DEFAULT 20)
RETURNS TABLE (medicine_id INTEGER, name VARCHAR(150), stock_quantity INTEGER, unit_price NUMERIC(10,2), manufacturer VARCHAR(150))
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT m.medicine_id, m.name, m.stock_quantity, m.unit_price, m.manufacturer
      FROM medicine m
     WHERE m.stock_quantity <= COALESCE(_threshold, 20)
     ORDER BY m.stock_quantity ASC, m.name;
END;
$$;

-- Full chronological history of one patient: records, prescriptions,
-- lab tests/results, admissions, bills, ambulance requests.
CREATE OR REPLACE FUNCTION fun_patient_history(_patient_id INTEGER)
RETURNS TABLE (kind TEXT, ref_id INTEGER, event_date DATE, summary TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    -- NOTE: ORDER BY lives OUTSIDE the UNION (inside RETURN QUERY the ORDER BY
    -- of a UNION is resolved against the function's declared columns, which
    -- PostgreSQL rejects with "invalid UNION/INTERSECT/EXCEPT ORDER BY clause").
    RETURN QUERY
    SELECT sub.kind, sub.ref_id, sub.event_date, sub.summary
      FROM (
        SELECT 'visit'::TEXT AS kind, mr.record_id AS ref_id, mr.visit_date AS event_date,
               format('Visit with Dr. %s - %s', d.name, mr.diagnosis) AS summary
          FROM medical_record mr JOIN doctor d ON d.doctor_id = mr.doctor_id
         WHERE mr.patient_id = _patient_id
        UNION ALL
        SELECT 'lab_test'::TEXT, lt.test_id, lt.test_date,
               format('Lab test "%s" (%s)', lt.test_type, lt.status)
          FROM lab_test lt WHERE lt.patient_id = _patient_id
        UNION ALL
        SELECT 'lab_result'::TEXT, lr.result_id, lr.result_date,
               format('Lab result for "%s"', lt.test_type)
          FROM lab_result lr JOIN lab_test lt ON lt.test_id = lr.test_id
         WHERE lt.patient_id = _patient_id
        UNION ALL
        SELECT 'admission'::TEXT, ad.admission_id, ad.admit_date,
               format('Admitted to room %s (%s)', r.room_number, ad.status)
          FROM admission ad JOIN room r ON r.room_id = ad.room_id
         WHERE ad.patient_id = _patient_id
        UNION ALL
        SELECT 'bill'::TEXT, b.bill_id, b.bill_date,
               format('Bill %s - total %s (%s)', b.bill_id, b.total_amt, b.status)
          FROM billing b WHERE b.patient_id = _patient_id
        UNION ALL
        SELECT 'ambulance'::TEXT, ar.request_id, ar.request_time::DATE,
               format('Ambulance request %s to %s (%s)', ar.pickup_location, ar.drop_location, ar.status)
          FROM ambulance_request ar WHERE ar.patient_id = _patient_id
      ) sub
      ORDER BY sub.event_date DESC;
END;
$$;

-- Appointments per doctor for the next N days (schedule preview).
CREATE OR REPLACE FUNCTION fun_doctor_appointments(_doctor_id INTEGER, _days INTEGER DEFAULT 30)
RETURNS TABLE (appt_date DATE, appt_time TIME, patient_name VARCHAR(100), status VARCHAR(20), reason VARCHAR(150))
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT a.appt_date, a.appt_time, p.name AS patient_name, a.status, a.name AS reason
      FROM appointment a JOIN patient p ON p.patient_id = a.patient_id
     WHERE a.doctor_id = _doctor_id
       AND a.appt_date BETWEEN CURRENT_DATE AND CURRENT_DATE + COALESCE(_days, 30)
       AND a.status <> 'Cancelled'
     ORDER BY a.appt_date, a.appt_time;
END;
$$;

-- One-count summary of a doctor's current workload.
CREATE OR REPLACE FUNCTION fun_doctor_workload(_doctor_id INTEGER)
RETURNS TABLE (approved_appointments BIGINT, pending_appointments BIGINT, medical_records BIGINT, pending_lab_tests BIGINT, active_admissions BIGINT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM appointment WHERE doctor_id = _doctor_id AND status = 'Approved'
           AND appt_date >= CURRENT_DATE)::BIGINT,
        (SELECT COUNT(*) FROM appointment WHERE doctor_id = _doctor_id AND status = 'Pending')::BIGINT,
        (SELECT COUNT(*) FROM medical_record WHERE doctor_id = _doctor_id)::BIGINT,
        (SELECT COUNT(*) FROM lab_test WHERE doctor_id = _doctor_id AND status IN ('Pending','In Progress'))::BIGINT,
        (SELECT COUNT(*) FROM admission WHERE doctor_id = _doctor_id AND status = 'Admitted')::BIGINT;
END;
$$;

-- Patient census grouped by gender (demographic snapshot).
CREATE OR REPLACE FUNCTION fun_patient_census_by_gender()
RETURNS TABLE (gender VARCHAR(10), patient_count BIGINT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT p.gender, COUNT(*)::BIGINT
      FROM patient p
     GROUP BY p.gender
     ORDER BY p.gender NULLS LAST;
END;
$$;

-- Patient census grouped by blood group (useful for blood-bank planning).
CREATE OR REPLACE FUNCTION fun_patient_census_by_blood_group()
RETURNS TABLE (blood_group VARCHAR(5), patient_count BIGINT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT p.blood_group, COUNT(*)::BIGINT
      FROM patient p
     GROUP BY p.blood_group
     ORDER BY p.blood_group NULLS LAST;
END;
$$;

-- Doctors currently in a department (directory helper, also demonstrates
-- a classic routine-style function with an OUT argument list).
CREATE OR REPLACE FUNCTION fun_department_doctors(_department_id INTEGER)
RETURNS TABLE (doctor_id INTEGER, name VARCHAR(100), specialization VARCHAR(100), status VARCHAR(20))
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT d.doctor_id, d.name, d.specialization, d.status
      FROM doctor d
     WHERE d.department_id = _department_id
     ORDER BY d.name;
END;
$$;

COMMIT;