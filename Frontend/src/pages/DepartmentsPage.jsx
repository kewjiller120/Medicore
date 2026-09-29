import ResourcePage from '../components/ResourcePage';
import { departmentsApi } from '../api/departments';
import { useAuth } from '../context/AuthContext';

export default function DepartmentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <ResourcePage
      title="Departments"
      api={departmentsApi}
      idKey="department_id"
      canCreate={isAdmin}
      canEdit={isAdmin}
      canDelete={isAdmin}
      columns={[
        { key: 'department_id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'location', label: 'Location' },
      ]}
      formFields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'location', label: 'Location' },
      ]}
      emptyMessage="No departments yet."
    />
  );
}
