import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { Spinner } from '@/components/Spinner';
import { api } from '@/services/api';

interface SkillRow {
  id: number;
  name: string;
  description: string | null;
  mcp_integrations: string[];
  version: string;
  active: boolean;
}

export function SkillsList() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<SkillRow[]>(
    ['skills'],
    () => api.listSkills()
  );

  const [editing, setEditing] = useState<SkillRow | null>(null);

  const saveMut = useMutation({
    mutationFn: (s: SkillRow) =>
      api.updateSkill(s.id, {
        description: s.description ?? '',
        version: s.version,
        active: s.active,
      }),
    onSuccess: () => {
      qc.invalidateQueries(['skills']);
      setEditing(null);
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Skills</h2>
        <p className="text-xs text-slate-500">
          Skills are reusable capabilities (with MCP wiring) that agents can
          declare.
        </p>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-10">
          <Spinner label="Loading skills..." />
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
                <th className="px-4 py-2 font-semibold">Description</th>
                <th className="px-4 py-2 font-semibold">MCPs</th>
                <th className="px-4 py-2 font-semibold">Version</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {s.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {s.description ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(s.mcp_integrations ?? []).map((m) => (
                        <span key={m} className="tag">
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.version}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      onClick={() => setEditing(s)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No skills found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="card w-full max-w-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              Edit skill: {editing.name}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="field-label">Description</label>
                <textarea
                  rows={3}
                  className="field-input"
                  value={editing.description ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Version</label>
                  <input
                    className="field-input"
                    value={editing.version}
                    onChange={(e) =>
                      setEditing({ ...editing, version: e.target.value })
                    }
                  />
                </div>
                <label className="mt-7 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) =>
                      setEditing({ ...editing, active: e.target.checked })
                    }
                  />
                  Active
                </label>
              </div>
            </div>
            {saveMut.isError ? (
              <p className="mt-3 text-xs text-red-600">
                {(saveMut.error as Error)?.message ?? 'Save failed'}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saveMut.isLoading}
                onClick={() => saveMut.mutate(editing)}
              >
                {saveMut.isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
