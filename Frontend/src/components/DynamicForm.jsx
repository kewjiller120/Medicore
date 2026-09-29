import { useState } from 'react';

/**
 * Renders a form from a field-config array instead of hand-writing a
 * <form> per resource. Each field: { name, label, type, required, options,
 * placeholder, step, hint }. type is one of text|number|date|time|select|
 * textarea|password (defaults to text).
 */
export default function DynamicForm({ fields, initialValues = {}, onSubmit, onCancel, submitLabel = 'Save', busy }) {
  const [values, setValues] = useState(() => {
    const base = {};
    fields.forEach((f) => {
      base[f.name] = initialValues[f.name] ?? (f.type === 'number' ? '' : '');
    });
    return base;
  });
  const [error, setError] = useState('');

  function setField(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    // Convert empty-string optional fields to null so we don't send "" for numbers/dates.
    const payload = {};
    for (const f of fields) {
      let v = values[f.name];
      if (v === '') v = f.required ? '' : null;
      if (f.type === 'number' && v !== null && v !== '') v = Number(v);
      payload[f.name] = v;
    }
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err?.displayMessage || err?.message || 'Something went wrong');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid">
        {fields.map((f) => (
          <div className="field" key={f.name} style={f.fullWidth ? { gridColumn: '1 / -1' } : undefined}>
            <label htmlFor={f.name}>
              {f.label}
              {f.required ? ' *' : ''}
            </label>
            {f.type === 'select' ? (
              <select
                id={f.name}
                value={values[f.name] ?? ''}
                required={f.required}
                onChange={(e) => setField(f.name, e.target.value)}
              >
                <option value="" disabled={f.required}>
                  {f.placeholder || 'Select...'}
                </option>
                {f.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                id={f.name}
                value={values[f.name] ?? ''}
                required={f.required}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : (
              <input
                id={f.name}
                type={f.type || 'text'}
                value={values[f.name] ?? ''}
                required={f.required}
                placeholder={f.placeholder}
                step={f.step}
                min={f.min}
                max={f.max}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            )}
            {f.hint && <span className="field-hint">{f.hint}</span>}
          </div>
        ))}
      </div>
      <div className="modal-footer">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
