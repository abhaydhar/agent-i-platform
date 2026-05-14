import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        The page you were looking for doesn&apos;t exist.
      </p>
      <Link to="/" className="btn-primary mt-5">
        Back to agents
      </Link>
    </div>
  );
}
