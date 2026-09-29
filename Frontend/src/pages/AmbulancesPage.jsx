import ResourcePage from '../components/ResourcePage';
import { ambulancesApi } from '../api/ambulances';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['Available', 'On Trip', 'Maintenance'];

export default function AmbulancesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isDriver = user?.role === 'staff' && user.staffRole === 'Driver';

  const formFields = isAdmin
    ? [
        { name: 'vehicle_no', label: 'Vehicle number', required: true },
        { name: 'current_location', label: 'Current location' },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
      ]
    : [
        // Drivers may update location/status for their assigned ambulance, but never the vehicle number.
        { name: 'current_location', label: 'Current location' },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
      ];

  return (
    <ResourcePage
      title="Ambulances"
      description="Assigning an ambulance to a request automatically marks it On Trip; it can't be double-dispatched."
      api={ambulancesApi}
      idKey="ambulance_id"
      canCreate={isAdmin}
      canEdit={isAdmin || isDriver}
      canDelete={isAdmin}
      columns={[
        { key: 'ambulance_id', label: 'ID' },
        { key: 'vehicle_no', label: 'Vehicle No.' },
        { key: 'current_location', label: 'Current location' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
      ]}
      formFields={formFields}
      emptyMessage="No ambulances registered yet."
    />
  );
}
