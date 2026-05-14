import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { Spinner } from '@/components/Spinner';
import { api } from '@/services/api';

interface FormState {
  uri: string;
  user: string;
  password: string;
}

export function Settings() {
  const qc = useQueryClient();
  const existing = useQuery(['neo4j-settings'], () =>
    api.getNeo4jSettings()
  );

  const [state, setState] = useState<FormState>({
    uri: '',
    user: '',
    password: '',
  });
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  useEffect(() => {
    if (existing.data) {
      setState((prev) => ({
        ...prev,
        uri: existing.data.uri ?? prev.uri,
        user: existing.data.user ?? prev.user,
      }));
    }
  }, [existing.data]);

  const saveMut = useMutation({
    mutationFn: () => api.saveNeo4jSettings(state),
    onSuccess: () => {
      qc.invalidateQueries(['neo4j-settings']);
    },
  });

  const testMut = useMutation({
    mutationFn: () => api.testNeo4j(),
    onSuccess: (r) => setTestResult(r),
  });

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((prev) => ({ ...prev, [k]: v }));
  }

  if (existing.isLoading) {
    return (
      <div className="card flex items-center justify-center p-10">
        <Spinner label="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Neo4j connection
        </h2>
        <p className="text-xs text-slate-500">
          Credentials persist to the <code>settings</code> table on the
          backend. Falls back to env vars if not set here.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="card space-y-4 p-5"
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-slate-500">
            Status:
          </span>
          {existing.data?.configured ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100">
              configured
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
              not configured
            </span>
          )}
        </div>

        <div>
          <label className="field-label">URI</label>
          <input
            required
            className="field-input"
            placeholder="neo4j://localhost:7687"
            value={state.uri}
            onChange={(e) => set('uri', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Username</label>
            <input
              required
              className="field-input"
              value={state.user}
              onChange={(e) => set('user', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input
              required
              type="password"
              className="field-input"
              value={state.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="(re-enter on save)"
            />
          </div>
        </div>

        {saveMut.isError ? (
          <p className="text-xs text-red-600">
            {(saveMut.error as Error)?.message ?? 'Save failed'}
          </p>
        ) : saveMut.isSuccess ? (
          <p className="text-xs text-emerald-700">Settings saved.</p>
        ) : null}

        {testResult ? (
          <p
            className={`text-xs ${
              testResult.ok ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            Test: {testResult.message}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => testMut.mutate()}
            disabled={testMut.isLoading}
          >
            {testMut.isLoading ? 'Testing...' : 'Test connection'}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saveMut.isLoading}
          >
            {saveMut.isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
