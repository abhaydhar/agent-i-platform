import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { InputParamsEditor } from '@/components/InputParamsEditor';
import { Spinner } from '@/components/Spinner';
import { api } from '@/services/api';
import type { Agent, InputParam } from '@/types';

interface FormState {
  name: string;
  description: string;
  icon: string;
  capability: string;
  system_prompt: string;
  skills: string;
  active: boolean;
  input_params: InputParam[];
}

const EMPTY: FormState = {
  name: '',
  description: '',
  icon: '',
  capability: '',
  system_prompt: '',
  skills: '',
  active: true,
  input_params: [],
};

function fromAgent(a: Agent): FormState {
  return {
    name: a.name,
    description: a.description,
    icon: a.icon ?? '',
    capability: a.capability ?? '',
    system_prompt: a.system_prompt ?? '',
    skills: a.skills.join(', '),
    active: a.active,
    input_params: a.input_params ?? [],
  };
}

function toPayload(s: FormState) {
  return {
    name: s.name.trim(),
    description: s.description.trim(),
    icon: s.icon.trim() || null,
    capability: s.capability.trim() || null,
    system_prompt: s.system_prompt,
    skills: s.skills
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    active: s.active,
    input_params: s.input_params,
  };
}

export function AgentEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const existing = useQuery(
    ['agent', id],
    () => api.getAgent(id as string),
    { enabled: !isNew }
  );

  const [state, setState] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!isNew && existing.data) setState(fromAgent(existing.data));
  }, [isNew, existing.data]);

  const createMut = useMutation({
    mutationFn: () => api.createAgent(toPayload(state) as Partial<Agent>),
    onSuccess: () => {
      qc.invalidateQueries(['agents']);
      navigate('/admin/agents');
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      api.updateAgent(id as string, toPayload(state) as Partial<Agent>),
    onSuccess: () => {
      qc.invalidateQueries(['agents']);
      navigate('/admin/agents');
    },
  });

  const isSubmitting = createMut.isLoading || updateMut.isLoading;
  const error = (createMut.error ?? updateMut.error) as Error | null;

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isNew) createMut.mutate();
    else updateMut.mutate();
  }

  if (!isNew && existing.isLoading) {
    return (
      <div className="card flex items-center justify-center p-12">
        <Spinner size="lg" label="Loading agent..." />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <nav className="text-xs text-slate-500">
        <Link to="/admin/agents" className="hover:text-slate-700">
          Agents
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">
          {isNew ? 'New agent' : `Edit: ${state.name || '(unnamed)'}`}
        </span>
      </nav>

      <div className="card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label">Name</label>
            <input
              className="field-input"
              required
              value={state.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Description</label>
            <textarea
              rows={2}
              className="field-input"
              value={state.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Icon key</label>
            <input
              className="field-input"
              value={state.icon}
              placeholder="lineage, code, graph"
              onChange={(e) => set('icon', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Capability summary</label>
            <input
              className="field-input"
              value={state.capability}
              placeholder="One-line capability"
              onChange={(e) => set('capability', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">
              Skills (comma-separated, e.g. data-lineage, code-analysis)
            </label>
            <input
              className="field-input"
              value={state.skills}
              onChange={(e) => set('skills', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">System prompt</label>
            <textarea
              required
              rows={10}
              className="field-input font-mono text-xs"
              value={state.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
            />
            <p className="field-hint">
              Supports placeholders like <code>{'{filename}'}</code> and{' '}
              <code>{'{context}'}</code>, which the agent can interpret at
              runtime.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={state.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            Active
          </label>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Input parameters
        </h2>
        <InputParamsEditor
          value={state.input_params}
          onChange={(v) => set('input_params', v)}
        />
      </div>

      {error ? (
        <div className="card border border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-red-700">Save failed</p>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Link to="/admin/agents" className="btn-ghost">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving...'
            : isNew
              ? 'Create agent'
              : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
