import ResourcePage from '../components/ResourcePage';
import { medicinesApi } from '../api/medicines';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, todayISO } from '../utils/format';

export default function MedicinesPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || (user?.role === 'staff' && user.staffRole === 'Pharmacist');

  return (
    <ResourcePage
      title="Medicines"
      description="Formulary and stock inventory. Stock is also adjusted automatically whenever a doctor prescribes a medicine."
      api={medicinesApi}
      idKey="medicine_id"
      canCreate={canManage}
      canEdit={canManage}
      canDelete={canManage}
      filters={[
        { name: 'search', label: 'Search name', type: 'search' },
        {
          name: 'lowStock',
          label: 'Stock level',
          type: 'select',
          options: [
            { value: 'true', label: 'Low stock only (below 20)' },
            { value: 'false', label: 'In stock (20 or more)' },
          ],
        },
      ]}
      columns={[
        { key: 'medicine_id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'unit_price', label: 'Unit price', render: (r) => formatCurrency(r.unit_price) },
        {
          key: 'stock_quantity',
          label: 'Stock',
          render: (r) => (
            <span className={r.stock_quantity < 20 ? 'badge badge-red' : undefined}>{r.stock_quantity}</span>
          ),
        },
        { key: 'manufacturer', label: 'Manufacturer' },
        { key: 'exp_date', label: 'Expiry', render: (r) => formatDate(r.exp_date) },
      ]}
      formFields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'unit_price', label: 'Unit price', type: 'number', step: '0.01', min: 0, required: true },
        { name: 'stock_quantity', label: 'Stock quantity', type: 'number', min: 0 },
        { name: 'manufacturer', label: 'Manufacturer' },
        { name: 'exp_date', label: 'Expiry date', type: 'date', min: todayISO() },
      ]}
      emptyMessage="No medicines in the formulary yet."
    />
  );
}