const COLOR_MAP = {
  // generic
  Active: 'green', Available: 'green', Paid: 'green', Completed: 'green', Approved: 'green', Admitted: 'blue', Confirmed: 'green',
  Scheduled: 'blue', 'In Progress': 'amber', Pending: 'amber', Partial: 'amber', Occupied: 'amber',
  'On Trip': 'amber', 'On Leave': 'amber', Transferred: 'amber',
  Inactive: 'gray', Discharged: 'gray', Rejected: 'red',
  Cancelled: 'red', Unpaid: 'red', 'No-show': 'red', Maintenance: 'red',
};

export default function StatusBadge({ value }) {
  if (!value) return null;
  const color = COLOR_MAP[value] || 'gray';
  return <span className={`badge badge-${color}`}>{value}</span>;
}