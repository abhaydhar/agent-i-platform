import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { Spinner } from '@/components/Spinner';
import { api } from '@/services/api';
import type { Agent } from '@/types';

export function AgentsList() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery(['agents'], () =>
    api.listAgents()
  );

  const deleteMut = useMutation({
    mutationFn: (id: Agent['id']) => api.deleteAgent(id),
    onSuccess: () => qc.invalidateQueries(['agents']),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Agents</h2>
          <p className="text-xs text-slate-500">
            Define the agents that appear on the landing page.
          </p>
        </div>
        <Link to="/admin/agents/new" className="btn-primary">
          + New agent
        </Link>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-10">
          <Spinner label="Loading agents..." />
        </div>
      ) : isError ? (
        <div className="card border border-red-200 bg-red-50/40 p-4 text-sm text-red-700">
          {(error as Error)?.message ?? 'Failed to load'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Skills</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{a.name}</div>
                    {a.capability ? (
                      <div className="text-xs text-slate-500">
                        {a.capability}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {a.skills.map((s) => (
                        <span key={s} className="tag">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {a.active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100">
                        active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/admin/agents/${a.id}`}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="ml-3 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      disabled={!a.active || deleteMut.isLoading}
                      onClick={() => {
                        if (
                          confirm(
                            `Soft-delete agent "${a.name}"? It will be marked inactive.`
                          )
                        ) {
                          deleteMut.mutate(a.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No agents yet. Click <b>New agent</b> to create one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
