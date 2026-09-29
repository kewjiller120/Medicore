import { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { admissionsApi } from '../api/admissions';
import { patientsApi } from '../api/patients';
import { doctorsApi } from '../api/doctors';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { formatDate, todayISO } from '../utils/format';

const STATUSES = ['Admitted', 'Discharged', 'Transferred'];

export default function AdmissionsPage() {
  const { user } = useAuth();
  const isDoctor = user?.role === 'doctor';
  // Only admin / the attending doctor can admit, transfer, or discharge.
  const isAdmissionStaff = user?.role === 'admin' || isDoctor;
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (isAdmissionStaff || user?.role === 'staff') {
      patientsApi.list().then(setPatients).catch(() => {});
      doctorsApi.list().then(setDoctors).catch(() => {});
      roomsApi.list().then(setRooms).catch(() => {});
    }
  }, [isAdmissionStaff, user?.role]);

  const canCreate = isAdmissionStaff;
  const canEdit = isAdmissionStaff;

  const patientOptions = patients.map((p) => ({ value: p.patient_id, label: p.name }));
  const doctorOptions = doctors.map((d) => ({ value: d.doctor_id, label: `Dr. ${d.name}` }));
  const availableRoomOptions = rooms
    .filter((r) => r.status === 'Available')
    .map((r) => ({ value: r.room_id, label: `${r.room_number} (${r.type})` }));

  const createFields = [
    { name: 'patient_id', label: 'Patient', type: 'select', required: true, options: patientOptions },
    ...(user?.role === 'doctor'
      ? []
      : [{ name: 'doctor_id', label: 'Doctor', type: 'select', required: true, options: doctorOptions }]),
    {
      name: 'room_id',
      label: 'Room',
      type: 'select',
      required: true,
      options: availableRoomOptions,
      hint: 'Only currently-available rooms are listed - the database also enforces this.',
    },
    {
      name: 'admit_date',
      label: 'Admit date',
      type: 'date',
      min: todayISO(),
      max: todayISO(),
      hint: 'A patient is admitted on the day they arrive - a past or future admit date is rejected.',
    },
  ];

  const editFields = [
    {
      name: 'room_id',
      label: 'Room (transfer)',
      type: 'select',
      options: rooms.map((r) => ({ value: r.room_id, label: `${r.room_number} (${r.status})` })),
    },
    { name: 'discharge_date', label: 'Discharge date', type: 'date', max: todayISO() },
    { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
  ];

  return (
    <ResourcePage
      title="Admissions"
      description="Admitting into an occupied room is rejected by the database; discharging automatically frees the room."
      api={admissionsApi}
      idKey="admission_id"
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={user?.role === 'admin'}
      filters={[
        { name: 'patient_id', label: 'All patients', type: 'select', options: patientOptions },
        ...(user?.role === 'doctor'
          ? [] // a doctor always sees only their own admissions
          : [{ name: 'doctor_id', label: 'All doctors', type: 'select', options: doctorOptions }]),
        { name: 'admit_date', label: 'All admit dates', type: 'date' },
        { name: 'status', label: 'All statuses', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
      ]}
      columns={[
        { key: 'patient_name', label: 'Patient' },
        { key: 'doctor_name', label: 'Doctor' },
        { key: 'room_number', label: 'Room' },
        { key: 'admit_date', label: 'Admit date', render: (r) => formatDate(r.admit_date) },
        { key: 'discharge_date', label: 'Discharge date', render: (r) => formatDate(r.discharge_date) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
      ]}
      createFields={createFields}
      editFields={editFields}
      emptyMessage="No admissions recorded yet."
    />
  );
}