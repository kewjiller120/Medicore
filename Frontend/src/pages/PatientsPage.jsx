import { useNavigate } from 'react-router-dom';
import ResourcePage from '../components/ResourcePage';
import { patientsApi } from '../api/patients';
import { useAuth } from '../context/AuthContext';
import { formatDate, todayISO } from '../utils/format';

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function PatientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = user?.role === 'admin' || user?.role === 'doctor';

  return (
    <ResourcePage
      title="Patients"
      api={patientsApi}
      idKey="patient_id"
      canCreate={canManage}
      canEdit={canManage}
      canDelete={user?.role === 'admin'}
      onRowClick={(row) => navigate(`/patients/${row.patient_id}`)}
      filters={[
        { name: 'search', label: 'Search name / phone', type: 'search' },
        { name: 'gender', label: 'All genders', type: 'select', options: GENDERS.map((g) => ({ value: g, label: g })) },
        { name: 'blood_group', label: 'All blood groups', type: 'select', options: BLOOD_GROUPS.map((b) => ({ value: b, label: b })) },
      ]}
      columns={[
        { key: 'patient_id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'dob', label: 'DOB', render: (r) => formatDate(r.dob) },
        { key: 'gender', label: 'Gender' },
        { key: 'blood_group', label: 'Blood group' },
        { key: 'phone', label: 'Phone' },
      ]}
      formFields={[
        { name: 'name', label: 'Full name', required: true },
        { name: 'dob', label: 'Date of birth', type: 'date', max: todayISO() },
        { name: 'gender', label: 'Gender', type: 'select', options: GENDERS.map((g) => ({ value: g, label: g })) },
        {
          name: 'blood_group',
          label: 'Blood group',
          type: 'select',
          options: BLOOD_GROUPS.map((b) => ({ value: b, label: b })),
        },
        { name: 'phone', label: 'Phone' },
        { name: 'emergency_contact', label: 'Emergency contact' },
        { name: 'address', label: 'Address', type: 'textarea', fullWidth: true },
      ]}
      emptyMessage="No patients registered yet."
    />
  );
}