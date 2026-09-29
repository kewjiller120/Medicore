export const STAFF_ROLES = ['Receptionist', 'Nurse', 'Pharmacist', 'LabTechnician', 'Driver', 'Accountant', 'Other'];

/**
 * Returns true if `user` is allowed to see/use a feature gated to
 * `roles` (top-level: admin/doctor/staff/patient) and, when the user is
 * staff, optionally further restricted to one of `staffRoles`.
 * Passing an empty/undefined `roles` means "any authenticated user".
 */
export function isAllowed(user, roles, staffRoles) {
  if (!user) return false;
  if (!roles || roles.length === 0) return true;
  if (!roles.includes(user.role)) return false;
  if (user.role === 'staff' && staffRoles && staffRoles.length > 0) {
    return staffRoles.includes(user.staffRole);
  }
  return true;
}

/**
 * Central navigation config. Each entry's `roles`/`staffRoles` mirror the
 * backend's authorization rules for that resource, so what a person SEES
 * in the sidebar always matches what they're actually allowed to do -
 * this is the "distinct capability per role... visible, not theoretical"
 * requirement made concrete on the frontend.
 *
 * Highlights of the role split:
 *  - patients: appointments, their own medical records / lab tests / lab
 *    results, ambulance requests, billing, doctors (browse).
 *  - doctors: appointments (approve/reject), medical records they authored,
 *    lab tests they ordered, ambulance requests for their department,
 *    patients, admissions, rooms.
 *  - staff: only the screens their sub-role uses (Receptionist front-desk,
 *    Nurse wards, Pharmacist stock, LabTechnician tests/results,
 *    Accountant billing+reports, Driver ambulances).
 */
export const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard' },
  {
    // Nurses and drivers handle patients directly on the ward/road and do
    // not manage the booking calendar - everyone else keeps appointments.
    label: 'Appointments',
    path: '/appointments',
    roles: ['admin', 'doctor', 'staff', 'patient'],
    staffRoles: ['Receptionist', 'Pharmacist', 'LabTechnician', 'Accountant', 'Other'],
  },
  {
    // Records are for the treating team only (admin, doctors, the patient
    // herself) - nursing staff record outcomes but don't browse records.
    label: 'Medical Records',
    path: '/medical-records',
    roles: ['admin', 'doctor', 'patient'],
  },
  { label: 'Lab Tests', path: '/lab-tests', roles: ['admin', 'doctor', 'staff', 'patient'], staffRoles: ['LabTechnician'] },
  { label: 'Lab Results', path: '/lab-results', roles: ['admin', 'doctor', 'staff', 'patient'], staffRoles: ['LabTechnician'] },
  {
    // Only the people in the ambulance workflow see it: the requester, the
    // department doctor, the driver on the trip, and admin (who dispatches).
    label: 'Ambulance Requests',
    path: '/ambulance-requests',
    roles: ['admin', 'doctor', 'staff', 'patient'],
    staffRoles: ['Driver'],
  },
  { label: 'Patients', path: '/patients', roles: ['admin', 'doctor', 'staff'], staffRoles: ['Receptionist', 'Nurse'] },
  { label: 'Admissions', path: '/admissions', roles: ['admin', 'doctor', 'staff'], staffRoles: ['Receptionist', 'Nurse'] },
  { label: 'Rooms', path: '/rooms', roles: ['admin', 'doctor', 'staff'], staffRoles: ['Receptionist', 'Nurse'] },
  { label: 'Medicines', path: '/medicines', roles: ['admin', 'doctor', 'staff'], staffRoles: ['Pharmacist'] },
  { label: 'Ambulances', path: '/ambulances', roles: ['admin', 'doctor', 'staff'], staffRoles: ['Driver'] },
  { label: 'Billing', path: '/billing', roles: ['admin', 'staff', 'patient'], staffRoles: ['Receptionist', 'Accountant'] },
  { label: 'Reports', path: '/reports', roles: ['admin', 'staff'], staffRoles: ['Accountant'] },
  { label: 'Doctors', path: '/doctors' },
  { label: 'Departments', path: '/departments', roles: ['admin', 'doctor', 'staff'] },
  { label: 'Staff', path: '/staff', roles: ['admin', 'doctor', 'staff'] },
  { label: 'My Ambulance', path: '/driver-assignments/mine', roles: ['staff'], staffRoles: ['Driver'] },
  { label: 'Driver Assignments', path: '/driver-assignments', roles: ['admin'] },
  { label: 'User Accounts', path: '/admin/users', roles: ['admin'] },
];

export function visibleNavItems(user) {
  const seen = new Set();
  return NAV_ITEMS.filter((item) => {
    if (!isAllowed(user, item.roles, item.staffRoles)) return false;
    if (seen.has(item.path)) return false; // dedupe same-path entries across roles
    seen.add(item.path);
    return true;
  });
}