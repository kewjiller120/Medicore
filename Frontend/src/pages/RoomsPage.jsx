import ResourcePage from '../components/ResourcePage';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const ROOM_TYPES = ['General', 'Private', 'ICU', 'Operation Theatre', 'Emergency'];
const ROOM_STATUSES = ['Available', 'Occupied', 'Maintenance'];

export default function RoomsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin';

  return (
    <ResourcePage
      title="Rooms"
      api={roomsApi}
      idKey="room_id"
      canCreate={canManage}
      canEdit={canManage}
      canDelete={user?.role === 'admin'}
      filters={[
        { name: 'type', label: 'All room types', type: 'select', options: ROOM_TYPES.map((t) => ({ value: t, label: t })) },
        { name: 'status', label: 'All statuses', type: 'select', options: ROOM_STATUSES.map((s) => ({ value: s, label: s })) },
      ]}
      columns={[
        { key: 'room_id', label: 'ID' },
        { key: 'room_number', label: 'Room #' },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
      ]}
      formFields={[
        { name: 'room_number', label: 'Room number', required: true, placeholder: 'e.g. R-101' },
        { name: 'type', label: 'Type', type: 'select', required: true, options: ROOM_TYPES.map((t) => ({ value: t, label: t })) },
        { name: 'status', label: 'Status', type: 'select', options: ROOM_STATUSES.map((s) => ({ value: s, label: s })) },
      ]}
      emptyMessage="No rooms yet."
    />
  );
}