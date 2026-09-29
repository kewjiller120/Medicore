-- =====================================================================
-- MEDICORE HOSPITAL MANAGEMENT SYSTEM
-- Core Schema (DDL)
--
-- This file implements EXACTLY the 19 entities defined in the approved
-- 40% milestone ERD / schema document (Medicore_Database_Schema.txt):
--   Medicine, Prescription_Item, Prescription, Medical_Record, Patient,
--   User_Account, Doctor, Staff, Department, Room, Admission, Appointment,
--   Lab_Test, Lab_Result, Billing, Payment, Ambulance, Ambulance_Request,
--   Driver_Assignment.
--
-- No columns from the approved schema were removed or renamed. Data
-- types, NOT NULL / UNIQUE / CHECK / DEFAULT constraints and ON DELETE /
-- ON UPDATE behaviour have been added where the plain-text schema left
-- them implicit, as required by the 60% guidelines (Section 2.1).
--
-- Two additional infrastructure tables (auth_session, audit_log) are
-- appended at the end. They do NOT belong to the hospital domain model
-- and do not alter any approved entity -- they exist purely to satisfy
-- the 60% authentication requirements (real, revocable server-side
-- sessions for logout, and an audit trail for sensitive account
-- changes). See README.md, section "Notes on the schema", for the
-- rationale.
--
-- Patient self-service accounts: user_account.role now also accepts
-- 'patient', and patient gained a nullable, unique user_id FK back to
-- user_account. Both are purely additive (no existing column touched)
-- and let a patient optionally hold their own login to book
-- appointments, request an ambulance, and pay bills online, while a
-- walk-in patient record created by front-desk staff with no account
-- (user_id IS NULL) keeps working exactly as before. ON DELETE SET NULL
-- (not CASCADE) is deliberate: removing a patient's login must never
-- cascade-delete their medical history.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Clean slate (safe to re-run during development)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS notification CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS auth_session CASCADE;
DROP TABLE IF EXISTS driver_assignment CASCADE;
DROP TABLE IF EXISTS ambulance_request CASCADE;
DROP TABLE IF EXISTS ambulance CASCADE;
DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS billing CASCADE;
DROP TABLE IF EXISTS lab_result CASCADE;
DROP TABLE IF EXISTS lab_test CASCADE;
DROP TABLE IF EXISTS appointment CASCADE;
DROP TABLE IF EXISTS admission CASCADE;
DROP TABLE IF EXISTS prescription_item CASCADE;
DROP TABLE IF EXISTS prescription CASCADE;
DROP TABLE IF EXISTS medical_record CASCADE;
DROP TABLE IF EXISTS medicine CASCADE;
DROP TABLE IF EXISTS patient CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS doctor CASCADE;
DROP TABLE IF EXISTS room CASCADE;
DROP TABLE IF EXISTS department CASCADE;
DROP TABLE IF EXISTS user_account CASCADE;

-- =====================================================================
-- 1. DEPARTMENT
-- =====================================================================
CREATE TABLE department (
    department_id   SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    location        VARCHAR(150)
);

-- =====================================================================
-- 2. ROOM
-- =====================================================================
CREATE TABLE room (
    room_id       SERIAL PRIMARY KEY,
    room_number   VARCHAR(20) NOT NULL UNIQUE,
    type          VARCHAR(30) NOT NULL
                  CHECK (type IN ('General','Private','ICU','Operation Theatre','Emergency')),
    status        VARCHAR(20) NOT NULL DEFAULT 'Available'
                  CHECK (status IN ('Available','Occupied','Maintenance'))
);

-- =====================================================================
-- 3. USER_ACCOUNT  (login credentials + top-level role)
-- =====================================================================
CREATE TABLE user_account (
    user_id         SERIAL PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL
                    CHECK (role IN ('admin','doctor','staff','patient')),
    last_login      TIMESTAMP
);

-- =====================================================================
-- 4. DOCTOR
-- =====================================================================
CREATE TABLE doctor (
    doctor_id       SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL UNIQUE
                    REFERENCES user_account(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    department_id   INTEGER
                    REFERENCES department(department_id) ON DELETE SET NULL ON UPDATE CASCADE,
    name            VARCHAR(100) NOT NULL,
    specialization  VARCHAR(100),
    qualification   VARCHAR(150),
    phone           VARCHAR(20),
    email           VARCHAR(100) UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'Active'
                    CHECK (status IN ('Active','Inactive','On Leave'))
);

CREATE INDEX idx_doctor_department ON doctor(department_id);

-- =====================================================================
-- 5. STAFF
--    staff.role is a domain sub-role (Receptionist, Nurse, Pharmacist,
--    LabTechnician, Driver, Accountant, Other) used for fine-grained
--    authorization within the "staff" top-level role. It is distinct
--    from user_account.role (the auth role).
-- =====================================================================
CREATE TABLE staff (
    staff_id        SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL UNIQUE
                    REFERENCES user_account(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    department_id   INTEGER
                    REFERENCES department(department_id) ON DELETE SET NULL ON UPDATE CASCADE,
    name            VARCHAR(100) NOT NULL,
    role            VARCHAR(30) NOT NULL
                    CHECK (role IN ('Receptionist','Nurse','Pharmacist','LabTechnician','Driver','Accountant','Other')),
    phone           VARCHAR(20),
    shift_timing    VARCHAR(50)
);

CREATE INDEX idx_staff_department ON staff(department_id);
CREATE INDEX idx_staff_role ON staff(role);

-- =====================================================================
-- 6. PATIENT
-- =====================================================================
CREATE TABLE patient (
    patient_id          SERIAL PRIMARY KEY,
    user_id             INTEGER UNIQUE
                        REFERENCES user_account(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
    name                VARCHAR(100) NOT NULL,
    dob                 DATE,
    gender              VARCHAR(10) CHECK (gender IN ('Male','Female','Other')),
    blood_group         VARCHAR(5) CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    address             VARCHAR(255),
    phone               VARCHAR(20),
    emergency_contact   VARCHAR(20)
);

CREATE INDEX idx_patient_user ON patient(user_id);

-- =====================================================================
-- 7. MEDICAL_RECORD
-- =====================================================================
CREATE TABLE medical_record (
    record_id     SERIAL PRIMARY KEY,
    patient_id    INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    doctor_id     INTEGER NOT NULL REFERENCES doctor(doctor_id) ON DELETE RESTRICT,
    diagnosis     TEXT NOT NULL,
    visit_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    notes         TEXT
);

CREATE INDEX idx_medical_record_patient ON medical_record(patient_id);
CREATE INDEX idx_medical_record_doctor ON medical_record(doctor_id);

-- =====================================================================
-- 8. PRESCRIPTION
-- =====================================================================
CREATE TABLE prescription (
    prescription_id   SERIAL PRIMARY KEY,
    record_id         INTEGER NOT NULL REFERENCES medical_record(record_id) ON DELETE CASCADE,
    date_issued       DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_prescription_record ON prescription(record_id);

-- =====================================================================
-- 9. MEDICINE
-- =====================================================================
CREATE TABLE medicine (
    medicine_id      SERIAL PRIMARY KEY,
    name             VARCHAR(150) NOT NULL,
    unit_price       NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    stock_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    manufacturer     VARCHAR(150),
    exp_date         DATE
);

-- =====================================================================
-- 10. PRESCRIPTION_ITEM
-- =====================================================================
CREATE TABLE prescription_item (
    item_id           SERIAL PRIMARY KEY,
    prescription_id   INTEGER NOT NULL REFERENCES prescription(prescription_id) ON DELETE CASCADE,
    medicine_id       INTEGER NOT NULL REFERENCES medicine(medicine_id) ON DELETE RESTRICT,
    dosage            VARCHAR(100) NOT NULL,
    duration          VARCHAR(50) NOT NULL,
    quantity          INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX idx_prescription_item_prescription ON prescription_item(prescription_id);
CREATE INDEX idx_prescription_item_medicine ON prescription_item(medicine_id);

-- =====================================================================
-- 11. ADMISSION
-- =====================================================================
CREATE TABLE admission (
    admission_id     SERIAL PRIMARY KEY,
    patient_id       INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    room_id          INTEGER NOT NULL REFERENCES room(room_id) ON DELETE RESTRICT,
    doctor_id        INTEGER NOT NULL REFERENCES doctor(doctor_id) ON DELETE RESTRICT,
    admit_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    discharge_date   DATE,
    status           VARCHAR(20) NOT NULL DEFAULT 'Admitted'
                     CHECK (status IN ('Admitted','Discharged','Transferred')),
    CONSTRAINT chk_admission_dates CHECK (discharge_date IS NULL OR discharge_date >= admit_date)
);

CREATE INDEX idx_admission_patient ON admission(patient_id);
CREATE INDEX idx_admission_room ON admission(room_id);
CREATE INDEX idx_admission_doctor ON admission(doctor_id);

-- =====================================================================
-- 12. APPOINTMENT
--    Workflow: a patient (or front desk) books with status 'Pending';
--    the doctor approves ('Approved') or rejects ('Rejected'); after the
--    visit the doctor/front desk marks it 'Completed' or 'No-show'; the
--    patient can cancel ('Cancelled'). The date validation trigger
--    (02_triggers.sql) rejects past dates for new bookings.
-- =====================================================================
CREATE TABLE appointment (
    appointment_id   SERIAL PRIMARY KEY,
    patient_id       INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    doctor_id        INTEGER NOT NULL REFERENCES doctor(doctor_id) ON DELETE CASCADE,
    appt_date        DATE NOT NULL,
    appt_time        TIME NOT NULL,
    name             VARCHAR(150) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'Pending'
                     CHECK (status IN ('Pending','Approved','Rejected','Completed','No-show','Cancelled'))
);

CREATE INDEX idx_appointment_patient ON appointment(patient_id);
CREATE INDEX idx_appointment_doctor_date ON appointment(doctor_id, appt_date, appt_time);

-- =====================================================================
-- 13. LAB_TEST
-- =====================================================================
CREATE TABLE lab_test (
    test_id      SERIAL PRIMARY KEY,
    test_type    VARCHAR(150) NOT NULL,
    test_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    status       VARCHAR(20) NOT NULL DEFAULT 'Pending'
                 CHECK (status IN ('Pending','In Progress','Completed','Cancelled')),
    patient_id   INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    doctor_id    INTEGER NOT NULL REFERENCES doctor(doctor_id) ON DELETE RESTRICT,
    staff_id     INTEGER REFERENCES staff(staff_id) ON DELETE SET NULL
);

CREATE INDEX idx_lab_test_patient ON lab_test(patient_id);
CREATE INDEX idx_lab_test_doctor ON lab_test(doctor_id);
CREATE INDEX idx_lab_test_staff ON lab_test(staff_id);

-- =====================================================================
-- 14. LAB_RESULT  (one result per test)
-- =====================================================================
CREATE TABLE lab_result (
    result_id     SERIAL PRIMARY KEY,
    test_id       INTEGER NOT NULL UNIQUE REFERENCES lab_test(test_id) ON DELETE CASCADE,
    result_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    details       TEXT NOT NULL,
    staff_id      INTEGER REFERENCES staff(staff_id) ON DELETE SET NULL
);

CREATE INDEX idx_lab_result_staff ON lab_result(staff_id);

-- =====================================================================
-- 15. BILLING
-- =====================================================================
CREATE TABLE billing (
    bill_id        SERIAL PRIMARY KEY,
    patient_id     INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    admission_id   INTEGER REFERENCES admission(admission_id) ON DELETE SET NULL,
    bill_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amt      NUMERIC(10,2) NOT NULL CHECK (total_amt >= 0),
    status         VARCHAR(20) NOT NULL DEFAULT 'Unpaid'
                   CHECK (status IN ('Unpaid','Partial','Paid'))
);

CREATE INDEX idx_billing_patient ON billing(patient_id);
CREATE INDEX idx_billing_admission ON billing(admission_id);

-- =====================================================================
-- 16. PAYMENT
-- =====================================================================
CREATE TABLE payment (
    payment_id       SERIAL PRIMARY KEY,
    bill_id          INTEGER NOT NULL REFERENCES billing(bill_id) ON DELETE CASCADE,
    amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method   VARCHAR(30) NOT NULL
                     CHECK (payment_method IN ('Cash','Card','Mobile Banking','Insurance','Bank Transfer')),
    payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    -- A recorded payment only becomes a *valid* payment (and only then
    -- counts towards billing.status / revenue) once an accountant
    -- confirms it via sp_confirm_payment(). Rejected payments are kept
    -- for the audit trail but never count.
    status           VARCHAR(20) NOT NULL DEFAULT 'Pending'
                     CHECK (status IN ('Pending','Confirmed','Rejected')),
    confirmed_by     INTEGER REFERENCES staff(staff_id) ON DELETE SET NULL,
    confirmed_at     TIMESTAMPTZ
);

CREATE INDEX idx_payment_bill ON payment(bill_id);

-- =====================================================================
-- 17. AMBULANCE
-- =====================================================================
CREATE TABLE ambulance (
    ambulance_id       SERIAL PRIMARY KEY,
    vehicle_no         VARCHAR(20) NOT NULL UNIQUE,
    current_location   VARCHAR(150),
    status             VARCHAR(20) NOT NULL DEFAULT 'Available'
                       CHECK (status IN ('Available','On Trip','Maintenance'))
);

-- =====================================================================
-- 18. AMBULANCE_REQUEST
--    A patient requests an ambulance for the department treating their
--    emergency. The request starts 'Pending' and is visible to that
--    department's doctors, who accept ('Approved' + doctor_id) or reject
--    ('Rejected') it. Once approved, a front-desk dispatcher/admin
--    assigns an ambulance (ambulance_id, verified available by triggers)
--    and the request finishes as 'Completed' when the trip is done.
-- =====================================================================
CREATE TABLE ambulance_request (
    request_id        SERIAL PRIMARY KEY,
    patient_id        INTEGER NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    department_id     INTEGER REFERENCES department(department_id) ON DELETE SET NULL,
    ambulance_id      INTEGER REFERENCES ambulance(ambulance_id) ON DELETE SET NULL,
    assigned_driver_id INTEGER REFERENCES staff(staff_id) ON DELETE SET NULL,
    doctor_id         INTEGER REFERENCES doctor(doctor_id) ON DELETE SET NULL,
    request_time      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pickup_location   VARCHAR(200) NOT NULL,
    drop_location     VARCHAR(200) NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending','Approved','Rejected','Completed','Cancelled'))
);

CREATE INDEX idx_ambulance_request_patient ON ambulance_request(patient_id);
CREATE INDEX idx_ambulance_request_department ON ambulance_request(department_id);
CREATE INDEX idx_ambulance_request_ambulance ON ambulance_request(ambulance_id);
CREATE INDEX idx_ambulance_request_driver ON ambulance_request(assigned_driver_id);

-- =====================================================================
-- 19. DRIVER_ASSIGNMENT (single vehicle per driver)
--    A driver can only ever hold ONE vehicle at a time (UNIQUE staff_id)
--    and a vehicle can only ever be held by ONE driver (UNIQUE
--    ambulance_id). The ambulance procedures keep this pairing in sync
--    with who is actually driving which trip; completing/cancelling a
--    trip releases the pairing again, so driver + vehicle become vacant.
-- =====================================================================
CREATE TABLE driver_assignment (
    staff_id       INTEGER NOT NULL UNIQUE REFERENCES staff(staff_id) ON DELETE CASCADE,
    ambulance_id   INTEGER NOT NULL UNIQUE REFERENCES ambulance(ambulance_id) ON DELETE CASCADE
);

-- =====================================================================
-- ADDITIVE INFRASTRUCTURE (not part of the approved domain ERD)
-- =====================================================================

-- ---------------------------------------------------------------------
-- AUTH_SESSION: backs real, revocable logout + refresh-token rotation.
-- Only a hash of the refresh token is stored, never the token itself.
-- ---------------------------------------------------------------------
CREATE TABLE auth_session (
    session_id           SERIAL PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES user_account(user_id) ON DELETE CASCADE,
    refresh_token_hash   VARCHAR(255) NOT NULL,
    user_agent           VARCHAR(255),
    ip_address           VARCHAR(64),
    issued_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at           TIMESTAMP NOT NULL,
    revoked_at           TIMESTAMP
);

CREATE INDEX idx_auth_session_user ON auth_session(user_id);
CREATE INDEX idx_auth_session_expiry ON auth_session(expires_at);

-- ---------------------------------------------------------------------
-- AUDIT_LOG: security trail for sensitive user_account changes
-- (role changes, username changes, password changes). Populated by
-- trigger (see 02_triggers.sql). changed_by is resolved from a
-- session-local GUC ('app.current_user_id') the backend sets inside
-- the same transaction when an admin edits another user's account.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    audit_id     SERIAL PRIMARY KEY,
    table_name   VARCHAR(50) NOT NULL,
    operation    VARCHAR(10) NOT NULL,
    record_id    VARCHAR(50) NOT NULL,
    changed_by   INTEGER REFERENCES user_account(user_id) ON DELETE SET NULL,
    changed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details      JSONB
);

CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);

-- ---------------------------------------------------------------------
-- NOTIFICATION: in-app notification feed used by the notification bell.
-- Every row targets one recipient user_account; created by triggers in
-- 02_triggers.sql whenever something relevant to a user happens in the
-- hospital (appointment request/approval, ambulance request/status,
-- lab test order, lab result published, bill created, payment made,
-- driver assignment...). is_read drives the unread badge.
-- ---------------------------------------------------------------------
CREATE TABLE notification (
    notification_id    SERIAL PRIMARY KEY,
    recipient_user_id  INTEGER NOT NULL REFERENCES user_account(user_id) ON DELETE CASCADE,
    title              VARCHAR(200) NOT NULL,
    message            TEXT NOT NULL,
    type               VARCHAR(30) NOT NULL DEFAULT 'general'
                       CHECK (type IN ('appointment','ambulance','lab_test','lab_result','billing','payment','assignment','account','general')),
    link               VARCHAR(255),
    is_read            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_recipient ON notification(recipient_user_id, is_read, created_at DESC);

COMMIT;
