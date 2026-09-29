import { useEffect, useState, useCallback, Fragment } from 'react';
import { billingApi } from '../api/billing';
import { paymentsApi } from '../api/payments';
import { patientsApi } from '../api/patients';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import DynamicForm from '../components/DynamicForm';
import LoadingSpinner from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/Alerts';
import StatusBadge from '../components/StatusBadge';
import { apiErrorMessage } from '../api/client';
import { formatDate, formatCurrency, todayISO } from '../utils/format';

const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Banking', 'Insurance', 'Bank Transfer'];

/**
 * Billing gets a custom page rather than the generic ResourcePage because
 * status isn't something a person sets - fn_update_billing_status()
 * derives it from payments automatically - and because recording a
 * payment needs its own nested modal, not a plain "edit" form.
 *
 * A patient sees the same page in a reduced form: only their own bills
 * (already scoped by the API), no bill creation, and a "Pay now" action
 * on anything still outstanding instead of full payment management.
 */
export default function BillingPage() {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const isAdmin = user?.role === 'admin';
  const isAccountsRole =
    isAdmin || (user?.role === 'staff' && ['Receptionist', 'Accountant'].includes(user.staffRole));
  // Only the accountant (or admin) may *create* a bill - the receptionist
  // can view bills and record the cash at the front desk, but never
  // author an invoice.
  const canCreateBill = isAdmin || (user?.role === 'staff' && user.staffRole === 'Accountant');
  // Only an accountant (or admin) can confirm/reject a payment - a payment
  // only becomes *valid* (counts towards the bill) once they approve it.
  const canConfirmPayments = isAdmin || (user?.role === 'staff' && user.staffRole === 'Accountant');
  const columnCount = isPatient ? 6 : 7;

  const [rows, setRows] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [payFor, setPayFor] = useState(null); // bill row
  const [expanded, setExpanded] = useState(null); // bill_id whose payment history is shown
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await billingApi.list();
      setRows(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Only billing staff create bills for other patients, so only they
    // need the full patient directory (which a patient can't access anyway).
    if (isAccountsRole) patientsApi.list().then(setPatients).catch(() => {});
  }, [load, isAccountsRole]);

  async function handleCreate(values) {
    setBusy(true);
    try {
      await billingApi.create(values);
      setShowCreate(false);
      await load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function handleRecordPayment(values) {
    setBusy(true);
    try {
      await paymentsApi.create({ ...values, bill_id: payFor.bill_id });
      setPayFor(null);
      await load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function toggleHistory(bill) {
    if (expanded?.bill_id === bill.bill_id) {
      setExpanded(null);
      return;
    }
    const full = await billingApi.getOne(bill.bill_id);
    setExpanded(full);
  }

  async function handleDeletePayment(paymentId) {
    if (!window.confirm('Delete this payment? The bill status will be recalculated.')) return;
    try {
      await paymentsApi.remove(paymentId);
      const full = await billingApi.getOne(expanded.bill_id);
      setExpanded(full);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  async function handleConfirmPayment(paymentId) {
    try {
      await paymentsApi.confirm(paymentId);
      const full = await billingApi.getOne(expanded.bill_id);
      setExpanded(full);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  async function handleRejectPayment(paymentId) {
    if (!window.confirm('Reject this payment? It will never count towards the bill.')) return;
    try {
      await paymentsApi.reject(paymentId);
      const full = await billingApi.getOne(expanded.bill_id);
      setExpanded(full);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  const createFields = [
    {
      name: 'patient_id',
      label: 'Patient',
      type: 'select',
      required: true,
      options: patients.map((p) => ({ value: p.patient_id, label: p.name })),
    },
    { name: 'admission_id', label: 'Admission ID (optional)', type: 'number' },
    { name: 'bill_date', label: 'Bill date', type: 'date', max: todayISO() },
    { name: 'total_amt', label: 'Total amount', type: 'number', step: '0.01', min: 0, required: true },
  ];

  const paymentFields = [
    { name: 'amount', label: 'Amount', type: 'number', step: '0.01', min: 0.01, required: true },
    {
      name: 'payment_method',
      label: 'Payment method',
      type: 'select',
      required: true,
      options: PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
    },
    ...(isPatient ? [] : [{ name: 'payment_date', label: 'Payment date', type: 'date', max: todayISO() }]),
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Billing</h1>
          <p className="muted" style={{ margin: 0 }}>
            {isPatient
              ? 'View your bills and pay any outstanding balance online.'
              : "Status updates automatically as accountant-confirmed payments are recorded - it can't be set directly."}
          </p>
        </div>
        {canCreateBill && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + New bill
            </button>
          </div>
        )}
      </div>

      <ErrorAlert message={error} />

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">No bills yet.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th>
                {!isPatient && <th>Patient</th>}
                <th>Date</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <Fragment key={b.bill_id}>
                  <tr>
                    <td>{b.bill_id}</td>
                    {!isPatient && <td>{b.patient_name}</td>}
                    <td>{formatDate(b.bill_date)}</td>
                    <td>{formatCurrency(b.total_amt)}</td>
                    <td>{formatCurrency(b.amount_paid)}</td>
                    <td><StatusBadge value={b.status} /></td>
                    <td className="actions">
                      <button className="btn btn-sm" onClick={() => toggleHistory(b)}>
                        {expanded?.bill_id === b.bill_id ? 'Hide' : 'Payments'}
                      </button>
                      {(isAccountsRole || isPatient) && b.status !== 'Paid' && (
                        <button className="btn btn-sm btn-primary" onClick={() => setPayFor(b)}>
                          {isAccountsRole ? 'Record payment' : 'Pay now'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded?.bill_id === b.bill_id && (
                    <tr>
                      <td colSpan={columnCount} style={{ background: 'var(--color-bg)' }}>
                        {expanded.payments.length === 0 ? (
                          <p className="muted" style={{ margin: 8 }}>No payments recorded yet.</p>
                        ) : (
                          <table className="data-table" style={{ margin: 8 }}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Method</th>
                                <th>Status</th>
                                {!isPatient && canConfirmPayments && <th></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {expanded.payments.map((p) => (
                                <tr key={p.payment_id}>
                                  <td>{formatDate(p.payment_date)}</td>
                                  <td>{formatCurrency(p.amount)}</td>
                                  <td>{p.payment_method}</td>
                                  <td><StatusBadge value={p.status} /></td>
                                  {!isPatient && canConfirmPayments && (
                                    <td className="actions">
                                      {p.status === 'Pending' && (
                                        <>
                                          <button className="btn btn-sm" onClick={() => handleConfirmPayment(p.payment_id)}>
                                            Confirm
                                          </button>
                                          <button className="btn btn-sm btn-danger" onClick={() => handleRejectPayment(p.payment_id)}>
                                            Reject
                                          </button>
                                        </>
                                      )}
                                      {isAdmin && (
                                        <button className="btn btn-sm btn-danger" onClick={() => handleDeletePayment(p.payment_id)}>
                                          Delete
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Modal title="Create new bill" onClose={() => setShowCreate(false)}>
          <DynamicForm fields={createFields} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} busy={busy} submitLabel="Create" />
        </Modal>
      )}

      {payFor && (
        <Modal title={`${isAccountsRole ? 'Record payment' : 'Pay bill'} - Bill #${payFor.bill_id}`} onClose={() => setPayFor(null)}>
          <p className="muted" style={{ margin: 0 }}>
            Total {formatCurrency(payFor.total_amt)} · Paid so far {formatCurrency(payFor.amount_paid)}
          </p>
          <p className="muted" style={{ marginTop: 6 }}>
            The payment is recorded as Pending and only counts towards the bill after the accountant confirms it.
          </p>
          <DynamicForm
            fields={paymentFields}
            onSubmit={handleRecordPayment}
            onCancel={() => setPayFor(null)}
            busy={busy}
            submitLabel={isAccountsRole ? 'Record payment' : 'Pay now'}
          />
        </Modal>
      )}
    </div>
  );
}
