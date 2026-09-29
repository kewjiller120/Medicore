import { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { labResultsApi } from '../api/labResults';
import { labTestsApi } from '../api/labTests';
import { patientsApi } from '../api/patients';
import { doctorsApi } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { formatDate, todayISO } from '../utils/format';

export default function LabResultsPage() {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const [tests, setTests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    // Entering a result always targets an existing test - patients don't
    // enter results, so they don't need the test picker.
    if (!isPatient) labTestsApi.list().then(setTests).catch(() => {});
    // Patients only ever see their own results (server-scoped), so the
    // patient/doctor filters are only useful to admin/doctor/labtech.
    if (!isPatient) {
      patientsApi.list().then(setPatients).catch(() => {});
      doctorsApi.list().then(setDoctors).catch(() => {});
    }
  }, [isPatient]);

  const canCreate = !isPatient && (user?.role === 'admin' || (user?.role === 'staff' && user.staffRole === 'LabTechnician'));

  const patientOptions = patients.map((p) => ({ value: p.patient_id, label: p.name }));
  const doctorOptions = doctors.map((d) => ({ value: d.doctor_id, label: `Dr. ${d.name}` }));
  const testOptions = tests.map((t) => ({
    value: t.test_id,
    label: `#${t.test_id} - ${t.test_type} (${t.patient_name})`,
  }));

  const createFields = [
    {
      name: 'test_id',
      label: 'Lab test',
      type: 'select',
      required: true,
      options: testOptions,
      hint: 'Entering a result automatically marks the test Completed.',
    },
    { name: 'result_date', label: 'Result date', type: 'date', max: todayISO() },
    { name: 'details', label: 'Result details', type: 'textarea', required: true, fullWidth: true },
  ];

  const editFields = [
    { name: 'result_date', label: 'Result date', type: 'date', max: todayISO() },
    { name: 'details', label: 'Result details', type: 'textarea', fullWidth: true },
  ];

  return (
    <ResourcePage
      title="Lab Results"
      api={labResultsApi}
      idKey="result_id"
      canCreate={canCreate}
      canEdit={canCreate}
      canDelete={!isPatient && user?.role === 'admin'}
      description={isPatient ? 'Your lab results, once a lab technician has entered them.' : undefined}
      filters={
        !isPatient
          ? [
              { name: 'patient_id', label: 'All patients', type: 'select', options: patientOptions },
              // A doctor only ever sees results for tests they ordered
              // (server-scoped), so a doctor filter is pointless for them.
              ...(user?.role === 'doctor'
                ? []
                : [{ name: 'doctor_id', label: 'All doctors', type: 'select', options: doctorOptions }]),
            ]
          : undefined
      }
      columns={[
        { key: 'test_type', label: 'Test type' },
        ...(isPatient ? [] : [{ key: 'patient_name', label: 'Patient' }]),
        ...(isPatient ? [] : [{ key: 'doctor_name', label: 'Ordered by' }]),
        { key: 'result_date', label: 'Result date', render: (r) => formatDate(r.result_date) },
        { key: 'details', label: 'Details' },
        ...(isPatient ? [] : [{ key: 'staff_name', label: 'Entered by' }]),
      ]}
      createFields={createFields}
      editFields={editFields}
      emptyMessage={isPatient ? 'No lab results for you yet.' : 'No lab results entered yet.'}
    />
  );
}