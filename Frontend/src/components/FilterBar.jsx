import { useEffect, useState } from 'react';

/**
 * Generic filter toolbar for list pages. `filters` is an array of
 * { name, label, type: 'search'|'select', options?, placeholder? }.
 * Emits onChange({...activeFilters}) - or undefined when every filter is
 * empty/cleared - so list pages can pass the result straight to the API.
 */
export default function FilterBar({ filters = [], onChange }) {
  const [values, setValues] = useState(() => Object.fromEntries(filters.map((f) => [f.name, ''])));

  // If the caller swaps the filter set (e.g. after a role change), reset state.
  useEffect(() => {
    setValues(Object.fromEntries(filters.map((f) => [f.name, ''])));
  }, [JSON.stringify(filters.map((f) => f.name))]);

  function commit(next) {
    setValues(next);
    const active = {};
    for (const [k, v] of Object.entries(next)) {
      if (v !== '' && v !== null && v !== undefined) active[k] = v;
    }
    onChange(Object.keys(active).length ? active : undefined);
  }

  function clear() {
    commit(Object.fromEntries(filters.map((f) => [f.name, ''])));
  }

  if (filters.length === 0) return null;

  return (
    <div className="filter-bar">
      {filters.map((f) =>
        f.type === 'select' ? (
          <select
            key={f.name}
            aria-label={f.label}
            value={values[f.name] ?? ''}
            onChange={(e) => commit({ ...values, [f.name]: e.target.value })}
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : f.type === 'date' ? (
          <input
            key={f.name}
            type="date"
            aria-label={f.label}
            value={values[f.name] ?? ''}
            onChange={(e) => commit({ ...values, [f.name]: e.target.value })}
          />
        ) : (
          <input
            key={f.name}
            type="search"
            aria-label={f.label}
            placeholder={f.placeholder || f.label}
            value={values[f.name] ?? ''}
            onChange={(e) => commit({ ...values, [f.name]: e.target.value })}
          />
        )
      )}
      {filters.some((f) => (values[f.name] ?? '') !== '') && (
        <button type="button" className="btn btn-sm" onClick={clear}>
          Clear filters
        </button>
      )}
    </div>
  );
}