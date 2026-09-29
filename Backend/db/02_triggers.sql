-- =====================================================================
-- MEDICORE HOSPITAL MANAGEMENT SYSTEM
-- Trigger Functions
--
-- Business rules enforced in the database layer so they hold no matter
-- which client (API, psql, another app) touches the data:
--
--   1. Medicine stock control        (prescription_item)
--   2. Room availability + status    (admission)
--   3. Doctor double-booking guard   (appointment - only Approved slots)
--   4. Billing status auto-update    (payment)
--   5. Ambulance auto-dispatch       (ambulance_request)
--   6. Sensitive account audit trail (user_account)
--   7. Date sanity rules             (patient, appointment, medical_record,
--                                    admission, lab_test, lab_result,
--                                    billing, payment, medicine)
--   8. In-app notifications          (appointment, ambulance_request,
--                                    lab_test, lab_result, billing,
--                                    payment, driver_assignment)
--
-- Notification rows target user_account.user_id; recipients without a
-- login (walk-in patients) are simply skipped.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Utility: create an in-app notification for one user (no-op if the
-- recipient doesn't exist or has no account).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_notify(_user_id INTEGER, _title TEXT, _message TEXT, _type TEXT DEFAULT 'general', _link TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF _user_id IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO notification (recipient_user_id, title, message, type, link)
    VALUES (_user_id, _title, _message, _type, _link);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prescription_item_stock ON prescription_item;
DROP FUNCTION IF EXISTS fn_adjust_medicine_stock();

DROP TRIGGER IF EXISTS trg_admission_before ON admission;
DROP TRIGGER IF EXISTS trg_admission_after ON admission;
DROP FUNCTION IF EXISTS fn_admission_before();
DROP FUNCTION IF EXISTS fn_admission_after();

DROP TRIGGER IF EXISTS trg_appointment_conflict ON appointment;
DROP FUNCTION IF EXISTS fn_prevent_appointment_conflict();

DROP TRIGGER IF EXISTS trg_payment_billing_status ON payment;
DROP FUNCTION IF EXISTS fn_update_billing_status();

DROP TRIGGER IF EXISTS trg_payment_overpay ON payment;
DROP FUNCTION IF EXISTS fn_check_payment_overpay();

DROP TRIGGER IF EXISTS trg_ambulance_request_check ON ambulance_request;
DROP TRIGGER IF EXISTS trg_ambulance_request_after ON ambulance_request;
DROP TRIGGER IF EXISTS trg_ambulance_request_release ON ambulance_request;
DROP FUNCTION IF EXISTS fn_check_ambulance_availability();
DROP FUNCTION IF EXISTS fn_dispatch_ambulance();
DROP FUNCTION IF EXISTS fn_release_ambulance_resources();

DROP TRIGGER IF EXISTS trg_user_account_audit ON user_account;
DROP FUNCTION IF EXISTS fn_audit_user_account();

DROP TRIGGER IF EXISTS trg_date_rules_patient ON patient;
DROP TRIGGER IF EXISTS trg_date_rules_appointment ON appointment;
DROP TRIGGER IF EXISTS trg_date_rules_medical_record ON medical_record;
DROP TRIGGER IF EXISTS trg_date_rules_admission ON admission;
DROP TRIGGER IF EXISTS trg_date_rules_lab_test ON lab_test;
DROP TRIGGER IF EXISTS trg_date_rules_lab_result ON lab_result;
DROP TRIGGER IF EXISTS trg_date_rules_billing ON billing;
DROP TRIGGER IF EXISTS trg_date_rules_payment ON payment;
DROP TRIGGER IF EXISTS trg_date_rules_medicine ON medicine;
DROP FUNCTION IF EXISTS fn_enforce_date_rules();

DROP TRIGGER IF EXISTS trg_notify_appointment ON appointment;
DROP TRIGGER IF EXISTS trg_notify_ambulance_request ON ambulance_request;
DROP TRIGGER IF EXISTS trg_notify_lab_test ON lab_test;
DROP TRIGGER IF EXISTS trg_notify_lab_result ON lab_result;
DROP TRIGGER IF EXISTS trg_notify_billing ON billing;
DROP TRIGGER IF EXISTS trg_notify_payment ON payment;
DROP TRIGGER IF EXISTS trg_notify_driver_assignment ON driver_assignment;
DROP TRIGGER IF EXISTS trg_notify_driver_assigned ON ambulance_request;
DROP FUNCTION IF EXISTS fn_notify_appointment();
DROP FUNCTION IF EXISTS fn_notify_ambulance_request();
DROP FUNCTION IF EXISTS fn_notify_lab_test();
DROP FUNCTION IF EXISTS fn_notify_lab_result();
DROP FUNCTION IF EXISTS fn_notify_billing();
DROP FUNCTION IF EXISTS fn_notify_payment();
DROP FUNCTION IF EXISTS fn_notify_driver_assignment();
DROP FUNCTION IF EXISTS fn_notify_driver_assigned();

-- =====================================================================
-- 1. MEDICINE STOCK CONTROL
--    Every prescription_item row insert/update/delete keeps
--    medicine.stock_quantity in sync automatically, and blocks
--    dispensing more units than are actually in stock.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_adjust_medicine_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_available INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT stock_quantity INTO v_available FROM medicine WHERE medicine_id = NEW.medicine_id FOR UPDATE;

        IF v_available IS NULL THEN
            RAISE EXCEPTION 'Medicine % does not exist', NEW.medicine_id;
        ELSIF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for medicine_id % (have %, requested %)',
                NEW.medicine_id, v_available, NEW.quantity;
        END IF;

        UPDATE medicine SET stock_quantity = stock_quantity - NEW.quantity WHERE medicine_id = NEW.medicine_id;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- restore what the old row had reserved, then check + re-reserve the new amount
        UPDATE medicine SET stock_quantity = stock_quantity + OLD.quantity WHERE medicine_id = OLD.medicine_id;

        SELECT stock_quantity INTO v_available FROM medicine WHERE medicine_id = NEW.medicine_id FOR UPDATE;
        IF v_available IS NULL THEN
            RAISE EXCEPTION 'Medicine % does not exist', NEW.medicine_id;
        ELSIF v_available < NEW.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for medicine_id % (have %, requested %)',
                NEW.medicine_id, v_available, NEW.quantity;
        END IF;

        UPDATE medicine SET stock_quantity = stock_quantity - NEW.quantity WHERE medicine_id = NEW.medicine_id;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        UPDATE medicine SET stock_quantity = stock_quantity + OLD.quantity WHERE medicine_id = OLD.medicine_id;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prescription_item_stock
AFTER INSERT OR UPDATE OF medicine_id, quantity OR DELETE ON prescription_item
FOR EACH ROW EXECUTE FUNCTION fn_adjust_medicine_stock();

-- =====================================================================
-- 2. ROOM AVAILABILITY + STATUS SYNCHRONISATION
--    BEFORE trigger refuses to admit a patient into a room that is not
--    'Available', and auto-fills discharge_date the moment a status
--    flips to 'Discharged'. AFTER trigger keeps room.status in lock
--    step with the admission lifecycle (occupied <-> available).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_admission_before()
RETURNS TRIGGER AS $$
DECLARE
    v_room_status VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.room_id IS DISTINCT FROM OLD.room_id) THEN
        SELECT status INTO v_room_status FROM room WHERE room_id = NEW.room_id FOR UPDATE;

        IF v_room_status IS NULL THEN
            RAISE EXCEPTION 'Room % does not exist', NEW.room_id;
        ELSIF v_room_status <> 'Available' THEN
            RAISE EXCEPTION 'Room % is currently % and cannot be assigned', NEW.room_id, v_room_status;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IN ('Discharged','Transferred')
       AND OLD.status NOT IN ('Discharged','Transferred') AND NEW.discharge_date IS NULL THEN
        NEW.discharge_date := CURRENT_DATE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admission_before
BEFORE INSERT OR UPDATE ON admission
FOR EACH ROW EXECUTE FUNCTION fn_admission_before();

CREATE OR REPLACE FUNCTION fn_admission_after()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE room SET status = 'Occupied' WHERE room_id = NEW.room_id;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE'
    IF NEW.room_id IS DISTINCT FROM OLD.room_id THEN
        UPDATE room SET status = 'Available' WHERE room_id = OLD.room_id;
        UPDATE room SET status = 'Occupied' WHERE room_id = NEW.room_id;
    ELSIF NEW.status IN ('Discharged','Transferred') AND OLD.status NOT IN ('Discharged','Transferred') THEN
        UPDATE room SET status = 'Available' WHERE room_id = NEW.room_id;
    ELSIF NEW.status = 'Admitted' AND OLD.status IN ('Discharged','Transferred') THEN
        UPDATE room SET status = 'Occupied' WHERE room_id = NEW.room_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admission_after
AFTER INSERT OR UPDATE ON admission
FOR EACH ROW EXECUTE FUNCTION fn_admission_after();

-- =====================================================================
-- 3. DOCTOR DOUBLE-BOOKING GUARD
--    Only *approved* appointments lock a slot on the doctor's calendar:
--    pending requests may overlap freely (the doctor hasn't accepted
--    yet), but once two patients are approved for the same slot the
--    second one is rejected.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_prevent_appointment_conflict()
RETURNS TRIGGER AS $$
DECLARE
    v_conflicts INTEGER;
BEGIN
    IF NEW.status <> 'Approved' THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_conflicts
      FROM appointment
     WHERE doctor_id = NEW.doctor_id
       AND appt_date = NEW.appt_date
       AND appt_time = NEW.appt_time
       AND status = 'Approved'
       AND appointment_id <> COALESCE(NEW.appointment_id, -1);

    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'Doctor % already has an approved appointment on % at %',
            NEW.doctor_id, NEW.appt_date, NEW.appt_time;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_conflict
BEFORE INSERT OR UPDATE ON appointment
FOR EACH ROW EXECUTE FUNCTION fn_prevent_appointment_conflict();

-- =====================================================================
-- 4. BILLING STATUS AUTO-UPDATE
--    billing.status is a derived field: it is recomputed from the sum
--    of payment.amount every time a payment is added, edited or
--    removed, so the API/frontend never has to (and cannot incorrectly)
--    set it directly.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_update_billing_status()
RETURNS TRIGGER AS $$
DECLARE
    v_bill_id INTEGER := COALESCE(NEW.bill_id, OLD.bill_id);
    v_total   NUMERIC(10,2);
    v_paid    NUMERIC(10,2);
BEGIN
    SELECT total_amt INTO v_total FROM billing WHERE bill_id = v_bill_id FOR UPDATE;
    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payment
      WHERE bill_id = v_bill_id AND status = 'Confirmed';

    UPDATE billing
       SET status = CASE
                       WHEN v_paid <= 0 THEN 'Unpaid'
                       WHEN v_paid >= v_total THEN 'Paid'
                       ELSE 'Partial'
                     END
     WHERE bill_id = v_bill_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_billing_status
AFTER INSERT OR UPDATE OF amount, bill_id, status OR DELETE ON payment
FOR EACH ROW EXECUTE FUNCTION fn_update_billing_status();

-- =====================================================================
-- 5. AMBULANCE AUTO-DISPATCH
--    Assigning an ambulance to a request (at insert time or later, via
--    update) is rejected unless that ambulance is 'Available', and
--    automatically flips it to 'On Trip'. Re-assigning a request frees
--    the previous ambulance.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_check_ambulance_availability()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    IF NEW.ambulance_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.ambulance_id IS DISTINCT FROM OLD.ambulance_id) THEN
        SELECT status INTO v_status FROM ambulance WHERE ambulance_id = NEW.ambulance_id FOR UPDATE;

        IF v_status IS NULL THEN
            RAISE EXCEPTION 'Ambulance % does not exist', NEW.ambulance_id;
        ELSIF v_status <> 'Available' THEN
            RAISE EXCEPTION 'Ambulance % is not available (status: %)', NEW.ambulance_id, v_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ambulance_request_check
BEFORE INSERT OR UPDATE OF ambulance_id ON ambulance_request
FOR EACH ROW EXECUTE FUNCTION fn_check_ambulance_availability();

CREATE OR REPLACE FUNCTION fn_dispatch_ambulance()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.ambulance_id IS NOT NULL
       AND OLD.ambulance_id IS DISTINCT FROM NEW.ambulance_id THEN
        UPDATE ambulance SET status = 'Available' WHERE ambulance_id = OLD.ambulance_id;
    END IF;

    IF NEW.ambulance_id IS NOT NULL THEN
        UPDATE ambulance SET status = 'On Trip' WHERE ambulance_id = NEW.ambulance_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ambulance_request_after
AFTER INSERT OR UPDATE OF ambulance_id ON ambulance_request
FOR EACH ROW EXECUTE FUNCTION fn_dispatch_ambulance();

-- Completion/cancellation releases the trip's resources: the ambulance
-- returns to 'Available' and the driver's vehicle pairing is removed, so
-- both are vacant and can be re-dispatched immediately. A driver therefore
-- only ever holds the single vehicle of their active trip (or a manually
-- assigned home vehicle) - releasing it here is what makes a driver
-- "unassigned" again after a task ends.
CREATE OR REPLACE FUNCTION fn_release_ambulance_resources()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'Approved' AND NEW.status IN ('Completed', 'Cancelled') THEN
        IF OLD.ambulance_id IS NOT NULL THEN
            UPDATE ambulance SET status = 'Available' WHERE ambulance_id = OLD.ambulance_id;
        END IF;
        IF OLD.assigned_driver_id IS NOT NULL THEN
            DELETE FROM driver_assignment
             WHERE staff_id = OLD.assigned_driver_id
               AND ambulance_id = OLD.ambulance_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ambulance_request_release
AFTER UPDATE OF status ON ambulance_request
FOR EACH ROW
WHEN (OLD.status = 'Approved' AND NEW.status IN ('Completed', 'Cancelled'))
EXECUTE FUNCTION fn_release_ambulance_resources();

-- =====================================================================
-- 6. SENSITIVE ACCOUNT AUDIT TRAIL
--    Any change to username, role or password_hash on user_account is
--    recorded (never the password hash value itself). changed_by is
--    read from a per-transaction GUC the backend sets when an admin
--    edits someone else's account; it is NULL for self-service changes
--    where the backend does not set it.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_audit_user_account()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN

        INSERT INTO audit_log (table_name, operation, record_id, changed_by, details)
        VALUES (
            'user_account',
            'UPDATE',
            NEW.user_id::text,
            NULLIF(current_setting('app.current_user_id', true), '')::integer,
            jsonb_build_object(
                'username_changed', OLD.username IS DISTINCT FROM NEW.username,
                'role_changed', OLD.role IS DISTINCT FROM NEW.role,
                'password_changed', OLD.password_hash IS DISTINCT FROM NEW.password_hash,
                'old_username', OLD.username,
                'new_username', NEW.username,
                'old_role', OLD.role,
                'new_role', NEW.role
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_account_audit
AFTER UPDATE ON user_account
FOR EACH ROW EXECUTE FUNCTION fn_audit_user_account();

-- =====================================================================
-- 7. DATE SANITY RULES
--    Enforced BEFORE insert/update so the UI and the API cannot create
--    impossible dates (a future birthday, a past appointment slot, a
--    visit/bill/result dated tomorrow, an expired medicine entry...).
--    On UPDATE, only the column actually changing is re-validated, so
--    marking a past appointment 'Completed' stays legal.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_enforce_date_rules()
RETURNS TRIGGER AS $$
DECLARE
    v_legacy_date DATE;
BEGIN
    -- PATIENT: date of birth must not be in the future
    IF TG_TABLE_NAME = 'patient' THEN
        IF TG_OP = 'INSERT' AND NEW.dob IS NOT NULL AND NEW.dob > CURRENT_DATE THEN
            RAISE EXCEPTION 'Date of birth cannot be in the future';
        ELSIF TG_OP = 'UPDATE' AND NEW.dob IS DISTINCT FROM OLD.dob
              AND NEW.dob IS NOT NULL AND NEW.dob > CURRENT_DATE THEN
            RAISE EXCEPTION 'Date of birth cannot be in the future';
        END IF;
        RETURN NEW;
    END IF;

    -- APPOINTMENT: new bookings must be today or later; an existing
    -- appointment can only be pushed to another future day, never into
    -- the past.
    IF TG_TABLE_NAME = 'appointment' THEN
        IF TG_OP = 'INSERT' AND NEW.appt_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Appointment date must be today or a future date';
        ELSIF TG_OP = 'UPDATE' AND NEW.appt_date IS DISTINCT FROM OLD.appt_date
              AND NEW.appt_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Appointment date must be today or a future date';
        END IF;
        RETURN NEW;
    END IF;

    -- MEDICAL_RECORD: a visit is recorded on the day it happens
    IF TG_TABLE_NAME = 'medical_record' THEN
        IF TG_OP = 'INSERT' AND NEW.visit_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Visit date cannot be in the future';
        ELSIF TG_OP = 'UPDATE' AND NEW.visit_date IS DISTINCT FROM OLD.visit_date
              AND NEW.visit_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Visit date cannot be in the future';
        END IF;
        RETURN NEW;
    END IF;

    -- ADMISSION: a patient is admitted on the day they arrive - admit
    -- date can be neither in the past nor in the future (i.e. it must be
    -- today), and discharge dates cannot be in the future.
    IF TG_TABLE_NAME = 'admission' THEN
        IF TG_OP = 'INSERT' AND NEW.admit_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Admission date cannot be in the past';
        END IF;
        IF TG_OP = 'INSERT' AND NEW.admit_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Admission date cannot be in the future';
        END IF;
        IF TG_OP = 'UPDATE' AND NEW.admit_date IS DISTINCT FROM OLD.admit_date
           AND NEW.admit_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Admission date cannot be in the past';
        END IF;
        IF TG_OP = 'UPDATE' AND NEW.admit_date IS DISTINCT FROM OLD.admit_date
           AND NEW.admit_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Admission date cannot be in the future';
        END IF;
        IF NEW.discharge_date IS NOT NULL
           AND ((TG_OP = 'INSERT') OR
                (TG_OP = 'UPDATE' AND NEW.discharge_date IS DISTINCT FROM OLD.discharge_date))
           AND NEW.discharge_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Discharge date cannot be in the future';
        END IF;
        RETURN NEW;
    END IF;

    -- LAB_TEST: a test is scheduled, like an appointment - it can be run
    -- today or on a later date, but never back-dated into the past.
    IF TG_TABLE_NAME = 'lab_test' THEN
        IF TG_OP = 'INSERT' AND NEW.test_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Lab test date must be today or a future date';
        ELSIF TG_OP = 'UPDATE' AND NEW.test_date IS DISTINCT FROM OLD.test_date
              AND NEW.test_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Lab test date must be today or a future date';
        END IF;
        RETURN NEW;
    END IF;

    -- LAB_RESULT: result date cannot be in the future
    IF TG_TABLE_NAME = 'lab_result' THEN
        IF TG_OP = 'INSERT' AND NEW.result_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Result date cannot be in the future';
        ELSIF TG_OP = 'UPDATE' AND NEW.result_date IS DISTINCT FROM OLD.result_date
              AND NEW.result_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Result date cannot be in the future';
        END IF;
        RETURN NEW;
    END IF;

    -- BILLING: a bill is dated the day it is raised
    IF TG_TABLE_NAME = 'billing' THEN
        IF TG_OP = 'INSERT' AND NEW.bill_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Bill date cannot be in the future';
        ELSIF TG_OP = 'UPDATE' AND NEW.bill_date IS DISTINCT FROM OLD.bill_date
              AND NEW.bill_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Bill date cannot be in the future';
        END IF;
        RETURN NEW;
    END IF;

    -- PAYMENT: payments are recorded on the day they happen
    IF TG_TABLE_NAME = 'payment' THEN
        IF TG_OP = 'INSERT' AND NEW.payment_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Payment date cannot be in the future';
        ELSIF TG_OP = 'UPDATE' AND NEW.payment_date IS DISTINCT FROM OLD.payment_date
              AND NEW.payment_date > CURRENT_DATE THEN
            RAISE EXCEPTION 'Payment date cannot be in the future';
        END IF;
        RETURN NEW;
    END IF;

    -- MEDICINE: an expiry date in the past makes the medicine unusable
    IF TG_TABLE_NAME = 'medicine' THEN
        IF NEW.exp_date IS NOT NULL
           AND ((TG_OP = 'INSERT') OR
                (TG_OP = 'UPDATE' AND NEW.exp_date IS DISTINCT FROM OLD.exp_date))
           AND NEW.exp_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Medicine expiry date cannot be in the past';
        END IF;
        RETURN NEW;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_date_rules_patient
BEFORE INSERT OR UPDATE ON patient
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_appointment
BEFORE INSERT OR UPDATE ON appointment
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_medical_record
BEFORE INSERT OR UPDATE ON medical_record
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_admission
BEFORE INSERT OR UPDATE ON admission
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_lab_test
BEFORE INSERT OR UPDATE ON lab_test
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_lab_result
BEFORE INSERT OR UPDATE ON lab_result
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_billing
BEFORE INSERT OR UPDATE ON billing
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_payment
BEFORE INSERT OR UPDATE ON payment
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

CREATE TRIGGER trg_date_rules_medicine
BEFORE INSERT OR UPDATE ON medicine
FOR EACH ROW EXECUTE FUNCTION fn_enforce_date_rules();

-- ---------------------------------------------------------------------
-- 7b. Payment over-payment guard: nobody (patient or staff) may record a
-- payment that would push what a person already committed (Pending +
-- Confirmed payments) beyond the bill's total. "At most the amount due"
-- is enforced here in the database so no client can bypass it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_payment_overpay()
RETURNS TRIGGER AS $$
DECLARE
    v_total NUMERIC(10,2);
    v_committed NUMERIC(10,2);
    v_outstanding NUMERIC(10,2);
BEGIN
    SELECT total_amt INTO v_total FROM billing WHERE bill_id = NEW.bill_id;
    IF v_total IS NULL THEN
        RAISE EXCEPTION 'Bill does not exist';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO v_committed
      FROM payment
     WHERE bill_id = NEW.bill_id
       AND status IN ('Pending', 'Confirmed')
       AND payment_id IS DISTINCT FROM NEW.payment_id;
    v_outstanding := v_total - v_committed;
    IF NEW.amount > v_outstanding THEN
        RAISE EXCEPTION 'Payment amount exceeds the outstanding amount of the bill (outstanding: %s)', v_outstanding;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_overpay
BEFORE INSERT OR UPDATE OF amount, bill_id ON payment
FOR EACH ROW EXECUTE FUNCTION fn_check_payment_overpay();

-- =====================================================================
-- 8. IN-APP NOTIFICATIONS (AFTER triggers, created by fn_notify())
-- =====================================================================

-- 8a. Appointment:
--   - a new 'Pending' request notifies the target doctor
--   - a status change notifies the patient (approval/rejection/completion)
CREATE OR REPLACE FUNCTION fn_notify_appointment()
RETURNS TRIGGER AS $$
DECLARE
    v_doctor_user INTEGER;
    v_patient_user INTEGER;
    v_patient_name VARCHAR(100);
    v_doctor_name VARCHAR(100);
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'Pending' THEN
        SELECT ua.user_id, d.name INTO v_doctor_user, v_doctor_name
          FROM doctor d JOIN user_account ua ON ua.user_id = d.user_id
         WHERE d.doctor_id = NEW.doctor_id;
        SELECT name INTO v_patient_name FROM patient WHERE patient_id = NEW.patient_id;
        PERFORM fn_notify(
            v_doctor_user,
            'New appointment request',
            format('%s requested an appointment on %s at %s (%s)',
                   v_patient_name, NEW.appt_date, NEW.appt_time::text, NEW.name),
            'appointment', '/appointments');
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        SELECT ua.user_id INTO v_patient_user
          FROM patient p JOIN user_account ua ON ua.user_id = p.user_id
         WHERE p.patient_id = NEW.patient_id;
        SELECT ua.user_id, d.name INTO v_doctor_user, v_doctor_name
          FROM doctor d JOIN user_account ua ON ua.user_id = d.user_id
         WHERE d.doctor_id = NEW.doctor_id;
        IF NEW.status = 'Approved' THEN
            PERFORM fn_notify(v_patient_user, 'Appointment approved',
                format('Your appointment with %s on %s at %s has been approved.',
                       v_doctor_name, NEW.appt_date, NEW.appt_time::text),
                'appointment', '/appointments');
        ELSIF NEW.status = 'Rejected' THEN
            PERFORM fn_notify(v_patient_user, 'Appointment rejected',
                format('Your appointment with %s on %s at %s was rejected. Please book another slot.',
                       v_doctor_name, NEW.appt_date, NEW.appt_time::text),
                'appointment', '/appointments');
        ELSIF NEW.status = 'Completed' THEN
            PERFORM fn_notify(v_patient_user, 'Appointment completed',
                format('Your appointment with %s on %s has been marked complete.', v_doctor_name, NEW.appt_date),
                'appointment', '/appointments');
        ELSIF NEW.status = 'No-show' THEN
            PERFORM fn_notify(v_patient_user, 'Appointment no-show',
                format('Your appointment with %s on %s was marked as no-show.', v_doctor_name, NEW.appt_date),
                'appointment', '/appointments');
        ELSIF NEW.status = 'Cancelled' THEN
            PERFORM fn_notify(v_doctor_user, 'Appointment cancelled',
                format('An appointment on %s at %s was cancelled.', NEW.appt_date, NEW.appt_time::text),
                'appointment', '/appointments');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_appointment
AFTER INSERT OR UPDATE OF status ON appointment
FOR EACH ROW EXECUTE FUNCTION fn_notify_appointment();

-- 8b. Ambulance request:
--   - new request notifies every doctor with a login in that department
--   - approval/rejection/dispatch/completion notifies the patient
CREATE OR REPLACE FUNCTION fn_notify_ambulance_request()
RETURNS TRIGGER AS $$
DECLARE
    v_doctor_user INTEGER;
    v_patient_user INTEGER;
    v_patient_name VARCHAR(100);
    v_vehicle VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT name INTO v_patient_name FROM patient WHERE patient_id = NEW.patient_id;
        FOR v_doctor_user IN
            SELECT ua.user_id
              FROM doctor d
              JOIN user_account ua ON ua.user_id = d.user_id
             WHERE d.department_id = NEW.department_id
        LOOP
            PERFORM fn_notify(
                v_doctor_user,
                'New ambulance request',
                format('%s requests an ambulance from %s to %s.', v_patient_name, NEW.pickup_location, NEW.drop_location),
                'ambulance', '/ambulance-requests');
        END LOOP;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT ua.user_id INTO v_patient_user
          FROM patient p JOIN user_account ua ON ua.user_id = p.user_id
         WHERE p.patient_id = NEW.patient_id;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NEW.status = 'Approved' THEN
                PERFORM fn_notify(v_patient_user, 'Ambulance request approved',
                    format('Your ambulance request (from %s to %s) has been approved.',
                           NEW.pickup_location, NEW.drop_location),
                    'ambulance', '/ambulance-requests');
            ELSIF NEW.status = 'Rejected' THEN
                PERFORM fn_notify(v_patient_user, 'Ambulance request rejected',
                    format('Your ambulance request (from %s to %s) was rejected. Please contact the hospital.',
                           NEW.pickup_location, NEW.drop_location),
                    'ambulance', '/ambulance-requests');
            ELSIF NEW.status = 'Completed' THEN
                PERFORM fn_notify(v_patient_user, 'Ambulance trip completed',
                    'Your ambulance trip has been completed.', 'ambulance', '/ambulance-requests');
            ELSIF NEW.status = 'Cancelled' THEN
                PERFORM fn_notify(v_patient_user, 'Ambulance request cancelled',
                    'Your ambulance request was cancelled.', 'ambulance', '/ambulance-requests');
            END IF;
        END IF;

        IF NEW.ambulance_id IS DISTINCT FROM OLD.ambulance_id AND NEW.ambulance_id IS NOT NULL THEN
            SELECT vehicle_no INTO v_vehicle FROM ambulance WHERE ambulance_id = NEW.ambulance_id;
            PERFORM fn_notify(v_patient_user, 'Ambulance dispatched',
                format('Ambulance %s has been dispatched to you.', v_vehicle),
                'ambulance', '/ambulance-requests');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_ambulance_request
AFTER INSERT OR UPDATE OF status, ambulance_id ON ambulance_request
FOR EACH ROW EXECUTE FUNCTION fn_notify_ambulance_request();

-- 8c. Lab test: a new order notifies the lab queue (all LabTechnicians
-- with a login), or the individual technician it is assigned to.
CREATE OR REPLACE FUNCTION fn_notify_lab_test()
RETURNS TRIGGER AS $$
DECLARE
    v_patient_name VARCHAR(100);
    v_assigned_user INTEGER;
    v_any_user INTEGER;
BEGIN
    SELECT name INTO v_patient_name FROM patient WHERE patient_id = NEW.patient_id;

    IF NEW.staff_id IS NOT NULL THEN
        SELECT ua.user_id INTO v_assigned_user
          FROM staff s JOIN user_account ua ON ua.user_id = s.user_id
         WHERE s.staff_id = NEW.staff_id;
        PERFORM fn_notify(v_assigned_user, 'Lab test assigned',
            format('Lab test "%s" for %s was assigned to you.', NEW.test_type, v_patient_name),
            'lab_test', '/lab-tests');
    ELSE
        FOR v_any_user IN
            SELECT ua.user_id
              FROM staff s JOIN user_account ua ON ua.user_id = s.user_id
             WHERE s.role = 'LabTechnician'
        LOOP
            PERFORM fn_notify(v_any_user,
                'New lab test',
                format('A new lab test "%s" was ordered for %s.', NEW.test_type, v_patient_name),
                'lab_test', '/lab-tests');
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_lab_test
AFTER INSERT ON lab_test
FOR EACH ROW EXECUTE FUNCTION fn_notify_lab_test();

-- 8d. Lab result: publishing a result notifies the ordering doctor and
-- the patient (if they both have logins).
CREATE OR REPLACE FUNCTION fn_notify_lab_result()
RETURNS TRIGGER AS $$
DECLARE
    v_test_doctor_id INTEGER;
    v_test_patient_id INTEGER;
    v_doctor_user INTEGER;
    v_patient_user INTEGER;
    v_doctor_name VARCHAR(100);
    v_patient_name VARCHAR(100);
    v_test_type VARCHAR(150);
BEGIN
    SELECT lt.test_type, lt.patient_id, lt.doctor_id INTO v_test_type, v_test_patient_id, v_test_doctor_id
      FROM lab_test lt WHERE lt.test_id = NEW.test_id;

    SELECT ua.user_id, d.name INTO v_doctor_user, v_doctor_name
      FROM doctor d JOIN user_account ua ON ua.user_id = d.user_id
     WHERE d.doctor_id = v_test_doctor_id;

    SELECT ua.user_id, p.name INTO v_patient_user, v_patient_name
      FROM patient p JOIN user_account ua ON ua.user_id = p.user_id
     WHERE p.patient_id = v_test_patient_id;

    PERFORM fn_notify(v_doctor_user, 'Lab result ready',
        format('The result for "%s" (%s) is available.', v_test_type, v_patient_name),
        'lab_result', '/lab-results');
    PERFORM fn_notify(v_patient_user, 'Lab result ready',
        format('Your lab result for "%s" is available.', v_test_type),
        'lab_result', '/lab-results');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_lab_result
AFTER INSERT ON lab_result
FOR EACH ROW EXECUTE FUNCTION fn_notify_lab_result();

-- 8e. Billing: a new bill notifies the patient.
CREATE OR REPLACE FUNCTION fn_notify_billing()
RETURNS TRIGGER AS $$
DECLARE
    v_patient_user INTEGER;
BEGIN
    SELECT ua.user_id INTO v_patient_user
      FROM patient p JOIN user_account ua ON ua.user_id = p.user_id
     WHERE p.patient_id = NEW.patient_id;
    PERFORM fn_notify(v_patient_user, 'New bill',
        format('A bill of %s was issued for you (Bill #%s).', NEW.total_amt, NEW.bill_id),
        'billing', '/billing');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_billing
AFTER INSERT ON billing
FOR EACH ROW EXECUTE FUNCTION fn_notify_billing();

-- 8f. Payment: recording a payment notifies the patient it is Pending
-- confirmation by an accountant AND alerts every accountant that a
-- payment is waiting for their confirmation. Confirming or rejecting it
-- (status change) sends the follow-up notification.
CREATE OR REPLACE FUNCTION fn_notify_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_patient_user INTEGER;
    v_bill_no INTEGER;
    v_accountant_user INTEGER;
BEGIN
    SELECT b.bill_id, p.user_id INTO v_bill_no, v_patient_user
      FROM billing b JOIN patient p ON p.patient_id = b.patient_id
     WHERE b.bill_id = NEW.bill_id;
    PERFORM fn_notify(v_patient_user, 'Payment received',
        format('A payment of %s was recorded on Bill #%s. It will count towards the bill once the accountant confirms it.', NEW.amount, v_bill_no),
        'payment', '/billing');
    -- Every accountant with a login is told a payment is waiting for them.
    FOR v_accountant_user IN
        SELECT ua.user_id
          FROM staff s JOIN user_account ua ON ua.user_id = s.user_id
         WHERE s.role = 'Accountant'
    LOOP
        PERFORM fn_notify(v_accountant_user, 'New payment to confirm',
            format('A payment of %s was recorded on Bill #%s and awaits your confirmation.', NEW.amount, v_bill_no),
            'payment', '/billing');
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_payment
AFTER INSERT ON payment
FOR EACH ROW EXECUTE FUNCTION fn_notify_payment();

CREATE OR REPLACE FUNCTION fn_notify_payment_confirmed()
RETURNS TRIGGER AS $$
DECLARE
    v_patient_user INTEGER;
    v_bill_no INTEGER;
BEGIN
    SELECT b.bill_id, p.user_id INTO v_bill_no, v_patient_user
      FROM billing b JOIN patient p ON p.patient_id = b.patient_id
     WHERE b.bill_id = NEW.bill_id;
    PERFORM fn_notify(v_patient_user, 'Payment confirmed',
        format('The payment of %s on Bill #%s has been confirmed by the accountant.', NEW.amount, v_bill_no),
        'payment', '/billing');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_payment_confirmed
AFTER UPDATE OF status ON payment
FOR EACH ROW WHEN (NEW.status = 'Confirmed')
EXECUTE FUNCTION fn_notify_payment_confirmed();

CREATE OR REPLACE FUNCTION fn_notify_payment_rejected()
RETURNS TRIGGER AS $$
DECLARE
    v_patient_user INTEGER;
    v_bill_no INTEGER;
BEGIN
    SELECT b.bill_id, p.user_id INTO v_bill_no, v_patient_user
      FROM billing b JOIN patient p ON p.patient_id = b.patient_id
     WHERE b.bill_id = NEW.bill_id;
    PERFORM fn_notify(v_patient_user, 'Payment rejected',
        format('The payment of %s on Bill #%s was rejected. Please contact the billing office.', NEW.amount, v_bill_no),
        'payment', '/billing');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_payment_rejected
AFTER UPDATE OF status ON payment
FOR EACH ROW WHEN (NEW.status = 'Rejected')
EXECUTE FUNCTION fn_notify_payment_rejected();

-- 8g. Driver assigned to an ambulance request: when a dispatcher assigns
-- a driver to an accepted request, that driver is notified right away.
CREATE OR REPLACE FUNCTION fn_notify_driver_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_driver_user INTEGER;
BEGIN
    IF OLD.assigned_driver_id IS DISTINCT FROM NEW.assigned_driver_id AND NEW.assigned_driver_id IS NOT NULL THEN
        SELECT ua.user_id INTO v_driver_user
          FROM staff s JOIN user_account ua ON ua.user_id = s.user_id
         WHERE s.staff_id = NEW.assigned_driver_id;
        PERFORM fn_notify(v_driver_user, 'Ambulance request assigned to you',
            format('Ambulance request #%s (%s -> %s) has been assigned to you.', NEW.request_id, NEW.pickup_location, NEW.drop_location),
            'ambulance', '/ambulance-requests');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_driver_assigned
AFTER UPDATE OF assigned_driver_id ON ambulance_request
FOR EACH ROW EXECUTE FUNCTION fn_notify_driver_assigned();

-- 8h. Driver assignment: assigning an ambulance to a driver notifies them.
CREATE OR REPLACE FUNCTION fn_notify_driver_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_driver_user INTEGER;
    v_vehicle VARCHAR(20);
BEGIN
    SELECT ua.user_id INTO v_driver_user
      FROM staff s JOIN user_account ua ON ua.user_id = s.user_id
     WHERE s.staff_id = NEW.staff_id;
    SELECT vehicle_no INTO v_vehicle FROM ambulance WHERE ambulance_id = NEW.ambulance_id;
    PERFORM fn_notify(v_driver_user, 'Ambulance assigned',
        format('Ambulance %s has been assigned to you.', v_vehicle),
        'assignment', '/driver-assignments/mine');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_driver_assignment
AFTER INSERT ON driver_assignment
FOR EACH ROW EXECUTE FUNCTION fn_notify_driver_assignment();

COMMIT;