import { useEffect, useState, useCallback } from 'react';
import Modal from './Modal';
import DynamicForm from './DynamicForm';
import FilterBar from './FilterBar';
import LoadingSpinner from './LoadingSpinner';
import { ErrorAlert } from './Alerts';
import { apiErrorMessage } from '../api/client';

/**
 * Drives the "list table + create/edit modal + delete" pattern shared by
 * most simple resources (departments, rooms, medicines, ambulances,
 * patients, appointments, admissions, lab tests, ambulance requests...).
 * Resources with nested child data (medical records + prescriptions,
 * billing + payments) use their own custom page instead - see the
 * comment above each page component.
 *
 * `filters` is an array of FilterBar field configs
 * ({ name, label, type: 'search'|'select', options }) which renders a
 * filter toolbar above the table; active values are merged into the
 * request querystring (`listParams` provides any static/role-based params).
 */
export default function ResourcePage({
  title,
  api,
  columns,
  formFields,
  createFields,
  editFields,
  idKey,
  canCreate = false,
  canEdit = false,
  canDelete = false,
  emptyMessage = 'Nothing here yet.',
  renderExtraActions,
  onRowClick,
  listParams,
  filters,
  description,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [editingRow, setEditingRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filterParams, setFilterParams] = useState(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { ...listParams, ...(filterParams || {}) };
      const data = await api.list(Object.keys(params).length ? params : undefined);
      setRows(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(listParams), JSON.stringify(filterParams)]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values) {
    setBusy(true);
    try {
      await api.create(values);
      setModalMode(null);
      await load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function handleUpdate(values) {
    setBusy(true);
    try {
      await api.update(editingRow[idKey], values);
      setModalMode(null);
      setEditingRow(null);
      await load();
    } catch (err) {
      const e = new Error(apiErrorMessage(err));
      e.displayMessage = apiErrorMessage(err);
      setBusy(false);
      throw e;
    }
    setBusy(false);
  }

  async function handleDelete(row) {
    if (!window.confirm('Are you sure you want to delete this record? This cannot be undone.')) return;
    try {
      await api.remove(row[idKey]);
      await load();
    } catch (err) {
      window.alert(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          {description && <p className="muted" style={{ margin: 0 }}>{description}</p>}
        </div>
        <div className="page-header-actions">
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setModalMode('create')}>
              + Add {title.replace(/s$/, '')}
            </button>
          )}
        </div>
      </div>

      {filters && filters.length > 0 && <FilterBar filters={filters} onChange={setFilterParams} />}

      <ErrorAlert message={error} />

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">{emptyMessage}</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {(canEdit || canDelete || renderExtraActions) && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row[idKey]}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(row) : row[c.key] ?? <span className="muted">-</span>}</td>
                  ))}
                  {(canEdit || canDelete || renderExtraActions) && (
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {renderExtraActions && renderExtraActions(row, load)}
                      {canEdit && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setEditingRow(row);
                            setModalMode('edit');
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(row)}>
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalMode === 'create' && (
        <Modal title={`Add ${title.replace(/s$/, '')}`} onClose={() => setModalMode(null)}>
          <DynamicForm fields={createFields || formFields} onSubmit={handleCreate} onCancel={() => setModalMode(null)} busy={busy} submitLabel="Create" />
        </Modal>
      )}

      {modalMode === 'edit' && editingRow && (
        <Modal title={`Edit ${title.replace(/s$/, '')}`} onClose={() => { setModalMode(null); setEditingRow(null); }}>
          <DynamicForm
            fields={editFields || formFields}
            initialValues={editingRow}
            onSubmit={handleUpdate}
            onCancel={() => { setModalMode(null); setEditingRow(null); }}
            busy={busy}
            submitLabel="Save changes"
          />
        </Modal>
      )}
    </div>
  );
}