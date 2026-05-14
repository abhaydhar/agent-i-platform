import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/agents', label: 'Agents' },
  { to: '/admin/skills', label: 'Skills' },
  { to: '/admin/settings', label: 'Settings' },
];

function tabClass({ isActive }: { isActive: boolean }) {
  return `border-b-2 px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'border-indigo-600 text-indigo-700'
      : 'border-transparent text-slate-500 hover:text-slate-700'
  }`;
}

export function AdminLayout() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">
          Admin dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage agents, skills, and connection settings.
        </p>
        <nav className="-mb-px mt-4 flex gap-2">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className={tabClass}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
