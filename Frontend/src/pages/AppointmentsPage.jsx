import { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { appointmentsApi } from '../api/appointments';
import { patientsApi } from '../api/patients';
import { doctorsApi } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { formatDate, formatTime, todayISO } from '../utils/format';
import { apiErrorMessage } from '../api/client';

// Every new booking starts Pending; only the attending doctor approves or
// rejects it. Admin may reschedule and mark outcome, patients may only
// cancel their own. Receptionists/nurses/drivers don't manage bookings.
const ADMIN_STATUSES = ['Pending', 'Completed', 'No-show', 'Cancelled'];

export default function AppointmentsPage() {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const isDoctor = user?.role === 'doctor';
  const isAdmin = user?.role === 'admin';
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    // Patients are forced to book for themselves server-side, so they only
    // need the doctor directory. Doctors book against their own calendar.
    if (isPatient || isAdmin) doctorsApi.list().then(setDoctors).catch(() => {});
    if (isDoctor || isAdmin) patientsApi.list().then(setPatients).catch(() => {});
  }, [isPatient, isDoctor, isAdmin]);

  const canBook = isPatient || isDoctor || isAdmin;
  // Doctors decide via Approve/Reject buttons (no slot editing); patients
  // only cancel their own - the generic edit modal is admin work.
  const canEdit = isAdmin;
  const canDelete = isAdmin;

  const patientOptions = patients.map((p) => ({ value: p.patient_id, label: p.name }));
  const doctorOptions = doctors.map((d) => ({ value: d.doctor_id, label: `Dr. ${d.name}` }));

  const createFields = [
    ...(isPatient || isAdmin
      ? [{ name: 'doctor_id', label: 'Doctor', type: 'select', required: true, options: doctorOptions }]
      : []),
    ...(isDoctor || isAdmin
      ? [{ name: 'patient_id', label: 'Patient', type: 'select', required: true, options: patientOptions }]
      : []),
    { name: 'appt_date', label: 'Date', type: 'date', required: true, min: todayISO() },
    { name: 'appt_time', label: 'Time', type: 'time', required: true },
    { name: 'name', label: 'Reason', required: true, placeholder: 'e.g. Follow-up checkup' },
  ];

  const editFields = [
    { name: 'appt_date', label: 'Date', type: 'date', min: todayISO() },
    { name: 'appt_time', label: 'Time', type: 'time' },
    { name: 'name', label: 'Reason' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: ADMIN_STATUSES.map((s) => ({ value: s, label: s })),
      hint: 'Approving or rejecting is the doctor\u2019s decision, not admin\u2019s.',
    },
  ];

  async function run(action, row, reload, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await action(row.appointment_id);
      await reload();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  const handleApprove = (row, reload) => run(appointmentsApi.approve, row, reload, 'Approve this appointment request?');
  const handleReject = (row, reload) => run(appointmentsApi.reject, row, reload, 'Reject this appointment request?');
  const handleComplete = (row, reload) =>
    run((id) => appointmentsApi.update(id, { status: 'Completed' }), row, reload);
  const handleNoShow = (row, reload) => run((id) => appointmentsApi.update(id, { status: 'No-show' }), row, reload);
  const handleCancel = (row, reload) =>
    run((id) => appointmentsApi.update(id, { status: 'Cancelled' }), row, reload, 'Cancel this appointment?');

  const extraActions = isDoctor
    ? (row, reload) => (
        <>
          {row.status === 'Pending' && (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => handleApprove(row, reload)}>Approve</button>
              <button className="btn btn-sm btn-danger" onClick={() => handleReject(row, reload)}>Reject</button>
            </>
          )}
          {row.status === 'Approved' && (
            <>
              <button className="btn btn-sm" onClick={() => handleComplete(row, reload)}>Mark completed</button>
              <button className="btn btn-sm" onClick={() => handleNoShow(row, reload)}>Mark no-show</button>
            </>
          )}
        </>
      )
    : isPatient
      ? (row, reload) =>
          ['Pending', 'Approved'].includes(row.status) && (
            <button className="btn btn-sm btn-danger" onClick={() => handleCancel(row, reload)}>Cancel</button>
          )
      : undefined;

  return (
    <ResourcePage
      title="Appointments"
      api={appointmentsApi}
      idKey="appointment_id"
      canCreate={canBook}
      canEdit={canEdit}
      canDelete={canDelete}
      description={
        isDoctor
          ? 'Approve or reject patient booking requests; mark outcomes for approved slots. You only see your own calendar.'
          : isPatient
            ? 'Book an appointment with one of our doctors, or cancel an upcoming one.'
            : undefined
      }
      filters={[
        ...(isPatient
          ? []
          : [{ name: 'patient_id', label: 'All patients', type: 'select', options: patientOptions }]),
        ...(isPatient || isDoctor
          ? []
          : [{ name: 'doctor_id', label: 'All doctors', type: 'select', options: doctorOptions }]),
        { name: 'date', label: 'All dates', type: 'date' },
        {
          name: 'status',
          label: 'All statuses',
          type: 'select',
          options: ADMIN_STATUSES.concat(['Approved', 'Rejected']).map((s) => ({ value: s, label: s })),
        },
      ]}
      renderExtraActions={extraActions}
      columns={[
        { key: 'appt_date', label: 'Date', render: (r) => formatDate(r.appt_date) },
        { key: 'appt_time', label: 'Time', render: (r) => formatTime(r.appt_time) },
        ...(isPatient ? [] : [{ key: 'patient_name', label: 'Patient' }]),
        { key: 'doctor_name', label: 'Doctor' },
        { key: 'name', label: 'Reason' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
      ]}
      createFields={createFields}
      editFields={editFields}
      emptyMessage={isPatient ? "You don't have any appointments yet." : 'No appointments yet.'}
    />
  );
}