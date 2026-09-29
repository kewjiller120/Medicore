import { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { labTestsApi } from '../api/labTests';
import { patientsApi } from '../api/patients';
import { doctorsApi } from '../api/doctors';
import { staffApi } from '../api/staff';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { formatDate, todayISO } from '../utils/format';

const STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

export default function LabTestsPage() {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [labTechs, setLabTechs] = useState([]);

  useEffect(() => {
    if (isPatient) return; // a patient only ever sees their own tests (server-scoped)
    patientsApi.list().then(setPatients).catch(() => {});
    doctorsApi.list().then(setDoctors).catch(() => {});
    staffApi.list({ role: 'LabTechnician' }).then(setLabTechs).catch(() => {});
  }, [isPatient]);

  const canOrder = user?.role === 'admin' || user?.role === 'doctor';
  const isLabTech = user?.role === 'staff' && user.staffRole === 'LabTechnician';
  const canEdit = !isPatient && (user?.role === 'admin' || user?.role === 'doctor' || isLabTech);

  const patientOptions = patients.map((p) => ({ value: p.patient_id, label: p.name }));
  const doctorOptions = doctors.map((d) => ({ value: d.doctor_id, label: `Dr. ${d.name}` }));
  const labTechOptions = labTechs.map((s) => ({ value: s.staff_id, label: s.name }));

  const createFields = [
    { name: 'patient_id', label: 'Patient', type: 'select', required: true, options: patientOptions },
    ...(user?.role === 'doctor'
      ? []
      : [{ name: 'doctor_id', label: 'Ordering doctor', type: 'select', required: true, options: doctorOptions }]),
    { name: 'test_type', label: 'Test type', required: true, placeholder: 'e.g. Complete Blood Count' },
    { name: 'test_date', label: 'Test date', type: 'date', min: todayISO() },
    { name: 'staff_id', label: 'Assign lab technician', type: 'select', options: labTechOptions },
  ];

  // A doctor may only cancel their own order (backend-enforced); technicians progress status/assignment.
  const editFields =
    user?.role === 'doctor'
      ? [{ name: 'status', label: 'Status', type: 'select', options: [{ value: 'Cancelled', label: 'Cancelled' }] }]
      : [
          { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
          { name: 'staff_id', label: 'Lab technician', type: 'select', options: labTechOptions },
        ];

  return (
    <ResourcePage
      title="Lab Tests"
      api={labTestsApi}
      idKey="test_id"
      canCreate={!isPatient && canOrder}
      canEdit={canEdit}
      canDelete={!isPatient && user?.role === 'admin'}
      description={isPatient ? 'Lab tests ordered for you, with their current status.' : undefined}
      filters={
        !isPatient
          ? [
              { name: 'patient_id', label: 'All patients', type: 'select', options: patientOptions },
              // A doctor only ever sees their own orders (server-scoped), so a
              // doctor filter would be pointless for them.
              ...(user?.role === 'doctor'
                ? []
                : [{ name: 'doctor_id', label: 'All doctors', type: 'select', options: doctorOptions }]),
              { name: 'status', label: 'All statuses', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
            ]
          : undefined
      }
      columns={[
        { key: 'test_type', label: 'Test type' },
        ...(isPatient ? [] : [{ key: 'patient_name', label: 'Patient' }]),
        { key: 'doctor_name', label: 'Ordered by' },
        ...(isPatient ? [] : [{ key: 'staff_name', label: 'Technician' }]),
        { key: 'test_date', label: 'Date', render: (r) => formatDate(r.test_date) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
      ]}
      createFields={createFields}
      editFields={editFields}
      emptyMessage={isPatient ? 'No lab tests have been ordered for you yet.' : 'No lab tests ordered yet.'}
    />
  );
}