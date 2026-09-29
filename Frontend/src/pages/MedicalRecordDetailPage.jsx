import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { medicalRecordsApi } from '../api/medicalRecords';
import { prescriptionsApi } from '../api/prescriptions';
import { medicinesApi } from '../api/medicines';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/Alerts';
import Modal from '../components/Modal';
import DynamicForm from '../components/DynamicForm';
import { apiErrorMessage } from '../api/client';
import { formatDate, formatCurrency } from '../utils/format';

export default function MedicalRecordDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewRx, setShowNewRx] = useState(false);
  const [addItemFor, setAddItemFor] = useState(null); // prescription_id
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rec = await medicalRecordsApi.getOne(id);
      setRecord(rec);
      const rx = await prescriptionsApi.list({ record_id: id });
      const withItems = await Promise.all(rx.map((p) => prescriptionsApi.getOne(p.prescription_id)));
      setPrescriptions(withItems);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    // Only staff/doctors add medicines to prescriptions; patients don't need the formulary.
    if (user?.role !== 'patient') medicinesApi.list().then(setMedicines).catch(() => {});
  }, [load, user?.role]);

  const canWrite = user?.role === 'admin' || (user?.role === 'doctor' && record?.doctor_id === user.doctorId);

  async function handleCreateRx() {
    setBusy(true);
    try {
      await prescriptionsApi.create({ record_id: Number(id) });
      setShowNewRx(false);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddItem(values) {
    setBusy(true);
    try {
      await prescriptionsApi.addItem(addItemFor, values);
      setAddItemFor(null);
      await load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function handleRemoveItem(prescriptionId, itemId) {
    if (!window.confirm('Remove this medicine from the prescription? Stock will be restored.')) return;
    try {
      await prescriptionsApi.removeItem(prescriptionId, itemId);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  async function handleDeleteRx(prescriptionId) {
    if (!window.confirm('Delete this whole prescription? All its items will be restocked.')) return;
    try {
      await prescriptionsApi.remove(prescriptionId);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!record) return null;

  const itemFields = [
    {
      name: 'medicine_id',
      label: 'Medicine',
      type: 'select',
      required: true,
      options: medicines.map((m) => ({ value: m.medicine_id, label: `${m.name} (${m.stock_quantity} in stock)` })),
    },
    { name: 'dosage', label: 'Dosage', required: true, placeholder: 'e.g. 1 tablet twice daily' },
    { name: 'duration', label: 'Duration', required: true, placeholder: 'e.g. 5 days' },
    { name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1 },
  ];

  return (
    <div>
      <Link to="/medical-records" className="muted">&larr; Back to medical records</Link>
      <div className="page-header">
        <h1>Medical Record #{record.record_id}</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div><strong>Patient:</strong> {record.patient_name}</div>
          <div><strong>Doctor:</strong> {record.doctor_name}</div>
          <div><strong>Visit date:</strong> {formatDate(record.visit_date)}</div>
        </div>
        <div className="mt-2">
          <strong>Diagnosis:</strong>
          <p>{record.diagnosis}</p>
        </div>
        {record.notes && (
          <div>
            <strong>Notes:</strong>
            <p>{record.notes}</p>
          </div>
        )}
      </div>

      <div className="section-title">
        <h2>Prescriptions</h2>
        {canWrite && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewRx(true)}>
            + New prescription
          </button>
        )}
      </div>

      {prescriptions.length === 0 ? (
        <div className="table-wrap"><div className="empty-state">No prescriptions yet.</div></div>
      ) : (
        prescriptions.map((rx) => (
          <div className="card" key={rx.prescription_id} style={{ marginBottom: 14 }}>
            <div className="flex-row" style={{ justifyContent: 'space-between' }}>
              <h3>Prescription #{rx.prescription_id} - issued {formatDate(rx.date_issued)}</h3>
              {canWrite && (
                <div className="flex-row">
                  <button className="btn btn-sm" onClick={() => setAddItemFor(rx.prescription_id)}>
                    + Add medicine
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteRx(rx.prescription_id)}>
                    Delete
                  </button>
                </div>
              )}
            </div>
            {rx.items.length === 0 ? (
              <p className="muted">No medicines added yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Dosage</th>
                    <th>Duration</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    {canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {rx.items.map((item) => (
                    <tr key={item.item_id}>
                      <td>{item.medicine_name}</td>
                      <td>{item.dosage}</td>
                      <td>{item.duration}</td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(item.unit_price)}</td>
                      {canWrite && (
                        <td className="actions">
                          <button className="btn btn-sm btn-danger" onClick={() => handleRemoveItem(rx.prescription_id, item.item_id)}>
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}

      {showNewRx && (
        <Modal title="Create new prescription" onClose={() => setShowNewRx(false)}>
          <p>This creates a new (empty) prescription under this medical record, ready for you to add medicines to.</p>
          <div className="modal-footer">
            <button className="btn" onClick={() => setShowNewRx(false)} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateRx} disabled={busy}>
              {busy ? 'Creating...' : 'Create prescription'}
            </button>
          </div>
        </Modal>
      )}

      {addItemFor && (
        <Modal title="Add medicine to prescription" onClose={() => setAddItemFor(null)}>
          <DynamicForm fields={itemFields} onSubmit={handleAddItem} onCancel={() => setAddItemFor(null)} busy={busy} submitLabel="Add" />
        </Modal>
      )}
    </div>
  );
}
