import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p>That page doesn't exist — it may have been removed, or the link may be out of date.</p>
      <Link className="button-link" to="/">
        Back to org charts
      </Link>
    </div>
  );
}
