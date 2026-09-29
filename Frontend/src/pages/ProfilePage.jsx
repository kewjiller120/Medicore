import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { changePassword as changePasswordApi } from '../api/auth';
import { doctorsApi } from '../api/doctors';
import { staffApi } from '../api/staff';
import { patientsApi } from '../api/patients';
import DynamicForm from '../components/DynamicForm';
import { ErrorAlert, SuccessAlert } from '../components/Alerts';
import { apiErrorMessage } from '../api/client';
import { useNavigate } from 'react-router-dom';

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function ProfilePage() {
  const { user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [success, setSuccess] = useState('');
  const [pwError, setPwError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [fullProfile, setFullProfile] = useState(null);

  useEffect(() => {
    if (user?.role === 'doctor') doctorsApi.getOne(user.doctorId).then(setFullProfile).catch(() => {});
    else if (user?.role === 'staff') staffApi.getOne(user.staffId).then(setFullProfile).catch(() => {});
    else if (user?.role === 'patient') patientsApi.getOne(user.patientId).then(setFullProfile).catch(() => {});
  }, [user?.role, user?.doctorId, user?.staffId, user?.patientId]);

  async function handleChangePassword(values) {
    setPwError('');
    try {
      await changePasswordApi(values.currentPassword, values.newPassword);
      setSuccess('Password changed. Please log in again with your new password.');
      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      throw e;
    }
  }

  async function handleProfileUpdate(values) {
    try {
      let updated;
      if (user.role === 'doctor') {
        updated = await doctorsApi.update(user.doctorId, values);
      } else if (user.role === 'staff') {
        updated = await staffApi.update(user.staffId, values);
      } else if (user.role === 'patient') {
        updated = await patientsApi.update(user.patientId, values);
      }
      setFullProfile(updated);
      setProfileSuccess('Profile updated.');
      await refreshProfile();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      throw e;
    }
  }

  const doctorFields = [
    { name: 'specialization', label: 'Specialization', fullWidth: false },
    { name: 'qualification', label: 'Qualification' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email' },
    {
      name: 'status',
      label: 'Availability',
      type: 'select',
      options: [
        { value: 'Active', label: 'Active' },
        { value: 'On Leave', label: 'On Leave' },
        { value: 'Inactive', label: 'Inactive' },
      ],
    },
  ];

  const staffFields = [
    { name: 'phone', label: 'Phone' },
    { name: 'shift_timing', label: 'Shift timing' },
  ];

  const patientFields = [
    { name: 'name', label: 'Full name' },
    { name: 'dob', label: 'Date of birth', type: 'date' },
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
  ];

  const profileFieldsByRole = { doctor: doctorFields, staff: staffFields, patient: patientFields };

  return (
    <div>
      <div className="page-header">
        <h1>My Profile</h1>
      </div>

      <div className="card" style={{ marginBottom: 20, maxWidth: 560 }}>
        <div className="form-grid">
          <div><strong>Username:</strong> {user?.username}</div>
          <div><strong>Role:</strong> {user?.role === 'staff' ? `Staff · ${user.staffRole}` : user?.role}</div>
          {user?.name && <div><strong>Name:</strong> {user.name}</div>}
        </div>
        {(user?.role === 'doctor' || user?.role === 'staff') && (
          <p className="muted mt-2" style={{ marginBottom: 0 }}>
            Your name{user?.role === 'doctor' ? ', department' : ', department, and role'} can only be changed by an
            administrator.
          </p>
        )}
      </div>

      {profileFieldsByRole[user?.role] && fullProfile && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 560 }}>
          <h2>{user.role === 'patient' ? 'Your details' : 'Contact & work details'}</h2>
          <SuccessAlert message={profileSuccess} />
          <DynamicForm
            fields={profileFieldsByRole[user.role]}
            initialValues={fullProfile}
            onSubmit={handleProfileUpdate}
            submitLabel="Save changes"
          />
        </div>
      )}

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Change password</h2>
        <SuccessAlert message={success} />
        <ErrorAlert message={pwError} />
        <DynamicForm
          fields={[
            { name: 'currentPassword', label: 'Current password', type: 'password', required: true },
            { name: 'newPassword', label: 'New password', type: 'password', required: true, hint: 'At least 8 characters, with a letter and a number' },
          ]}
          onSubmit={handleChangePassword}
          submitLabel="Change password"
        />
      </div>
    </div>
  );
}
