import { Link, NavLink, Outlet } from 'react-router-dom';

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? 'bg-indigo-50 text-indigo-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              AI
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">
                Agentic Intelligence Platform
              </div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                Prototype
              </div>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Agents
            </NavLink>
            <NavLink to="/admin/agents" className={navClass}>
              Admin
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-3 text-xs text-slate-400">
          AIP MVP · local development build
        </div>
      </footer>
    </div>
  );
}
