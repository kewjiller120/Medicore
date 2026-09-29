export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(value) {
  if (!value) return '-';
  // value looks like "10:00:00" from Postgres TIME
  return value.slice(0, 5);
}

export function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return '৳' + n.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Turns an ISO datetime/date string into the yyyy-mm-dd an <input type="date"> needs. */
export function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

/** Today's date as yyyy-mm-dd in the user's local timezone (for <input type="date"> min/max). */
export function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
