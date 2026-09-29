export function ErrorAlert({ message }) {
  if (!message) return null;
  return <div className="alert alert-error">{message}</div>;
}

export function SuccessAlert({ message }) {
  if (!message) return null;
  return <div className="alert alert-success">{message}</div>;
}
