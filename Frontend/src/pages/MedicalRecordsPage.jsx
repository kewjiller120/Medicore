import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ResourcePage from '../components/ResourcePage';
import { medicalRecordsApi } from '../api/medicalRecords';
import { patientsApi } from '../api/patients';
import { doctorsApi } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { formatDate, todayISO } from '../utils/format';

export default function MedicalRecordsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPatient = user?.role === 'patient';
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    // A patient reads their own records only - no pickers needed.
    if (isPatient) return;
    patientsApi.list().then(setPatients).catch(() => {});
    if (user?.role === 'admin') doctorsApi.list().then(setDoctors).catch(() => {});
  }, [isPatient, user?.role]);

  const canWrite = !isPatient && (user?.role === 'admin' || user?.role === 'doctor');

  const patientOptions = patients.map((p) => ({ value: p.patient_id, label: p.name }));
  const doctorOptions = doctors.map((d) => ({ value: d.doctor_id, label: `Dr. ${d.name}` }));

  const createFields = [
    { name: 'patient_id', label: 'Patient', type: 'select', required: true, options: patientOptions },
    ...(user?.role === 'admin'
      ? [{ name: 'doctor_id', label: 'Doctor', type: 'select', required: true, options: doctorOptions }]
      : []),
    { name: 'visit_date', label: 'Visit date', type: 'date', max: todayISO() },
    { name: 'diagnosis', label: 'Diagnosis', type: 'textarea', required: true, fullWidth: true },
    { name: 'notes', label: 'Notes', type: 'textarea', fullWidth: true },
  ];

  const editFields = [
    { name: 'visit_date', label: 'Visit date', type: 'date', max: todayISO() },
    { name: 'diagnosis', label: 'Diagnosis', type: 'textarea', fullWidth: true },
    { name: 'notes', label: 'Notes', type: 'textarea', fullWidth: true },
  ];

  return (
    <ResourcePage
      title="Medical Records"
      description={
        isPatient
          ? 'Your medical records, as recorded by the doctors who treated you.'
          : user?.role === 'doctor'
            ? "You can only see and edit records you authored - this is enforced by the server, not just hidden in the UI."
            : undefined
      }
      api={medicalRecordsApi}
      idKey="record_id"
      canCreate={canWrite}
      canEdit={canWrite}
      canDelete={!isPatient && user?.role === 'admin'}
      onRowClick={(row) => navigate(`/medical-records/${row.record_id}`)}
      columns={[
        { key: 'visit_date', label: 'Visit date', render: (r) => formatDate(r.visit_date) },
        ...(isPatient ? [] : [{ key: 'patient_name', label: 'Patient' }]),
        { key: 'doctor_name', label: 'Doctor' },
        { key: 'diagnosis', label: 'Diagnosis' },
      ]}
      createFields={createFields}
      editFields={editFields}
      emptyMessage={isPatient ? "You don't have any medical records yet." : 'No medical records yet.'}
    />
  );
}