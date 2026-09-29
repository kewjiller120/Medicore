import { useEffect, useState } from 'react';
import ResourcePage from '../components/ResourcePage';
import { ambulanceRequestsApi } from '../api/ambulanceRequests';
import { patientsApi } from '../api/patients';
import { ambulancesApi } from '../api/ambulances';
import { departmentsApi } from '../api/departments';
import Modal from '../components/Modal';
import DynamicForm from '../components/DynamicForm';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { formatDateTime } from '../utils/format';
import { apiErrorMessage } from '../api/client';

/**
 * Ambulance workflow: a patient (or admin on their behalf) requests an
 * ambulance for a department -> the department doctor ACCEPTS AND DISPATCHES
 * in one action: he must pick an UNOCCUPIED ambulance (status Available) and
 * an UNOCCUPIED driver (not on another trip) and assign the task to that
 * driver. A driver only ever holds ONE vehicle at a time and can edit only
 * that vehicle. Completing/cancelling the trip frees both, so they can be
 * dispatched again.
 */
export default function AmbulanceRequestsPage() {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const isDoctor = user?.role === 'doctor';
  const isAdmin = user?.role === 'admin';
  const isDriver = user?.role === 'staff' && user?.staffRole === 'Driver';
  const canPickDriver = isAdmin || isDoctor;

  const [patients, setPatients] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [accepting, setAccepting] = useState(null); // { row, reload } awaiting ambulance + driver selection
  const [assign, setAssign] = useState(null); // { row, reload } awaiting ambulance selection (admin change)
  const [assignDriver, setAssignDriver] = useState(null); // { row, reload } awaiting driver selection
  const [busy, setBusy] = useState(false);

  // Only drivers who are NOT currently on another trip may be chosen.
  const refreshDrivers = () => {
    if (canPickDriver) {
      ambulanceRequestsApi.availableDrivers().then(setDrivers).catch(() => {});
    } else {
      setDrivers([]);
    }
  };

  useEffect(() => {
    // Admin coordinates the fleet; the doctor picks an available ambulance
    // when accepting a request, so both need the fleet list.
    if (isAdmin || isDoctor) {
      ambulancesApi.list().then(setAmbulances).catch(() => {});
    }
    if (isAdmin) {
      patientsApi.list().then(setPatients).catch(() => {});
    }
    refreshDrivers();
    departmentsApi.list().then(setDepartments).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isDoctor]);

  const canCreate = isPatient || isAdmin;
  const canEdit = isAdmin;

  const patientOptions = patients.map((p) => ({ value: p.patient_id, label: p.name }));
  const departmentOptions = departments.map((d) => ({ value: d.department_id, label: d.name }));
  const availableAmbulanceOptions = ambulances
    .filter((a) => a.status === 'Available')
    .map((a) => ({ value: a.ambulance_id, label: `${a.vehicle_no} (${a.status})` }));
  const driverOptions = drivers.map((d) => ({ value: d.staff_id, label: d.name }));

  const createFields = [
    ...(isAdmin
      ? [{ name: 'patient_id', label: 'Patient', type: 'select', required: true, options: patientOptions }]
      : []),
    { name: 'department_id', label: 'Department handling the emergency', type: 'select', required: true, options: departmentOptions },
    { name: 'pickup_location', label: 'Pickup location', required: true },
    { name: 'drop_location', label: 'Drop-off location', required: true },
  ];

  const editFields = [
    { name: 'pickup_location', label: 'Pickup location' },
    { name: 'drop_location', label: 'Drop-off location' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [{ value: 'Cancelled', label: 'Cancelled' }],
      hint: "Only cancellation is allowed here - accept/reject/dispatch is the doctor's call, and changes have their own buttons.",
    },
  ];

  async function run(action, row, reload, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await action(row.request_id);
      await reload();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  const handleReject = (row, reload) => run(ambulanceRequestsApi.reject, row, reload, 'Reject this ambulance request?');
  const handleComplete = (row, reload) => run(ambulanceRequestsApi.complete, row, reload, 'Mark this trip as complete?');
  const handleCancel = (row, reload) =>
    run((id) => ambulanceRequestsApi.update(id, { status: 'Cancelled' }), row, reload, 'Cancel this ambulance request?');

  // Refresh both availability lists every time the accept picker opens so a
  // driver/ambulance that just got taken is no longer offered.
  function openAccept(row, reload) {
    refreshDrivers();
    if (isDoctor) {
      ambulancesApi.list().then(setAmbulances).catch(() => {});
    }
    setAccepting({ row, reload });
  }

  async function handleAccept(values) {
    if (!accepting) return;
    setBusy(true);
    try {
      await ambulanceRequestsApi.accept(accepting.row.request_id, values.ambulance_id, values.staff_id);
      setAccepting(null);
      accepting.reload();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(values) {
    if (!assign) return;
    setBusy(true);
    try {
      await ambulanceRequestsApi.assign(assign.row.request_id, values.ambulance_id);
      setAssign(null);
      assign.reload();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignDriver(values) {
    if (!assignDriver) return;
    setBusy(true);
    try {
      await ambulanceRequestsApi.assignDriver(assignDriver.row.request_id, values.staff_id);
      setAssignDriver(null);
      assignDriver.reload();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Refresh the availability list every time the picker opens so a driver
  // that just got assigned elsewhere is no longer offered.
  function openAssignDriver(row, reload) {
    refreshDrivers();
    setAssignDriver({ row, reload });
  }

  // The driver assigned to a trip may complete it; admin always may.
  const canComplete = (row) =>
    isAdmin || (isDriver && row.assigned_driver_id === user?.staffId);

  const extraActions = (row, reload) => (
    <>
      {isDoctor && row.status === 'Pending' && (
        <>
          <button className="btn btn-sm btn-primary" onClick={() => openAccept(row, reload)}>Accept &amp; dispatch</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleReject(row, reload)}>Reject</button>
        </>
      )}
      {isAdmin && row.status === 'Pending' && (
        <button className="btn btn-sm btn-danger" onClick={() => handleCancel(row, reload)}>Cancel</button>
      )}
      {isAdmin && row.status === 'Approved' && !row.ambulance_id && (
        <button className="btn btn-sm btn-primary" onClick={() => setAssign({ row, reload })}>Assign ambulance</button>
      )}
      {isAdmin && row.status === 'Approved' && row.ambulance_id && (
        <button className="btn btn-sm" onClick={() => setAssign({ row, reload })}>Change ambulance</button>
      )}
      {canPickDriver && row.status === 'Approved' && row.ambulance_id && (
        <button className="btn btn-sm btn-primary" onClick={() => openAssignDriver(row, reload)}>
          {row.assigned_driver_id ? 'Change driver' : 'Assign driver'}
        </button>
      )}
      {canComplete(row) && row.status === 'Approved' && row.ambulance_id && (
        <button className="btn btn-sm btn-success" onClick={() => handleComplete(row, reload)}>Complete trip</button>
      )}
    </>
  );

  return (
    <div>
      <ResourcePage
        title="Ambulance Requests"
        api={ambulanceRequestsApi}
        idKey="request_id"
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={user?.role === 'admin'}
        description={
          isPatient
            ? 'Request an ambulance and track its dispatch status here.'
            : isDoctor
              ? 'You see requests for your own department only. Accepting a request dispatches it: pick an available ambulance and an available driver in the same step, or reject it.'
              : isDriver
                ? "You see the trips assigned to you. You can update only the ambulance handed to you, and complete your own trip when it's done."
                : undefined
        }
        filters={[
          ...(isPatient ? [] : [{ name: 'status', label: 'All statuses', type: 'select', options: ['Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled'].map((s) => ({ value: s, label: s })) }]),
          ...(isPatient || isDoctor || isDriver ? [] : [{ name: 'department_id', label: 'All departments', type: 'select', options: departmentOptions }]),
        ]}
        renderExtraActions={extraActions}
        columns={[
          { key: 'request_time', label: 'Requested at', render: (r) => formatDateTime(r.request_time) },
          ...(isPatient ? [] : [{ key: 'patient_name', label: 'Patient' }]),
          { key: 'department_name', label: 'Department' },
          { key: 'pickup_location', label: 'Pickup' },
          { key: 'drop_location', label: 'Drop-off' },
          { key: 'vehicle_no', label: 'Ambulance', render: (r) => r.vehicle_no || <span className="muted">Unassigned</span> },
          { key: 'driver_name', label: 'Driver', render: (r) => r.driver_name || <span className="muted">None</span> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        ]}
        createFields={createFields}
        editFields={editFields}
        emptyMessage={isPatient ? "You haven't requested an ambulance yet." : 'No ambulance requests yet.'}
      />

      {accepting && (
        <Modal title={`Accept &amp; dispatch - request #${accepting.row.request_id}`} onClose={() => setAccepting(null)}>
          <DynamicForm
            fields={[
              {
                name: 'ambulance_id',
                label: 'Ambulance',
                type: 'select',
                required: true,
                options: availableAmbulanceOptions,
                hint: availableAmbulanceOptions.length === 0
                  ? 'No ambulance is available right now - you cannot dispatch this request yet.'
                  : 'Only currently-available (unoccupied) ambulances are listed.',
              },
              {
                name: 'staff_id',
                label: 'Driver',
                type: 'select',
                required: true,
                options: driverOptions,
                hint: driverOptions.length === 0
                  ? 'No driver is available right now - everyone is on a trip.'
                  : 'Only drivers who are not already on a trip are listed.',
              },
            ]}
            onSubmit={handleAccept}
            onCancel={() => setAccepting(null)}
            busy={busy}
            submitLabel="Accept &amp; dispatch"
          />
        </Modal>
      )}

      {assign && (
        <Modal title={`Assign ambulance - request #${assign.row.request_id}`} onClose={() => setAssign(null)}>
          <DynamicForm
            fields={[
              {
                name: 'ambulance_id',
                label: 'Ambulance',
                type: 'select',
                required: true,
                options: availableAmbulanceOptions,
                hint: availableAmbulanceOptions.length === 0 ? 'No ambulance is currently available.' : 'Only currently-available ambulances are listed.',
              },
            ]}
            onSubmit={handleAssign}
            onCancel={() => setAssign(null)}
            busy={busy}
            submitLabel="Assign ambulance"
          />
        </Modal>
      )}

      {assignDriver && (
        <Modal title={`Assign driver - request #${assignDriver.row.request_id}`} onClose={() => setAssignDriver(null)}>
          <DynamicForm
            fields={[
              {
                name: 'staff_id',
                label: 'Driver',
                type: 'select',
                required: true,
                options: driverOptions,
                hint: driverOptions.length === 0
                  ? 'No driver is available right now - everyone is on a trip.'
                  : 'Only drivers who are not already on a trip are listed.',
              },
            ]}
            onSubmit={handleAssignDriver}
            onCancel={() => setAssignDriver(null)}
            busy={busy}
            submitLabel="Assign driver"
          />
        </Modal>
      )}
    </div>
  );
}