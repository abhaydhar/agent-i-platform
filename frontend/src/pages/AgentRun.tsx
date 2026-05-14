import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'react-query';

import { AgentForm } from '@/components/AgentForm';
import { AgentIcon } from '@/components/AgentIcon';
import { OutputViewer } from '@/components/OutputViewer';
import { Spinner } from '@/components/Spinner';
import { api } from '@/services/api';
import type { AgentRunResponse } from '@/types';

export function AgentRun() {
  const { id } = useParams<{ id: string }>();

  const agentQuery = useQuery(
    ['agent', id],
    () => api.getAgent(id as string),
    { enabled: Boolean(id) }
  );

  const runMutation = useMutation<
    AgentRunResponse,
    Error,
    Record<string, unknown>
  >({
    mutationFn: (inputs) =>
      api.runAgent({ agentId: id as string, inputs }),
  });

  if (agentQuery.isLoading) {
    return (
      <div className="card flex items-center justify-center p-12">
        <Spinner size="lg" label="Loading agent..." />
      </div>
    );
  }

  if (agentQuery.isError || !agentQuery.data) {
    return (
      <div className="card border border-red-200 bg-red-50/50 p-6">
        <p className="text-sm font-semibold text-red-700">
          Failed to load agent
        </p>
        <p className="mt-1 text-sm text-red-600">
          {(agentQuery.error as Error)?.message ?? 'Agent not found'}
        </p>
        <Link to="/" className="btn-secondary mt-3">
          Back to agents
        </Link>
      </div>
    );
  }

  const agent = agentQuery.data;

  return (
    <div className="space-y-6">
      <nav className="text-xs text-slate-500">
        <Link to="/" className="hover:text-slate-700">
          Agents
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{agent.name}</span>
      </nav>

      <header className="card flex items-start gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <AgentIcon kind={agent.icon} className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {agent.name}
            </h1>
            {agent.active ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-100">
                active
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {agent.description}
          </p>
          {agent.skills.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agent.skills.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="card h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Inputs
          </h2>
          <AgentForm
            agent={agent}
            submitting={runMutation.isLoading}
            onSubmit={(values) => runMutation.mutate(values)}
          />
        </aside>

        <section className="min-h-[500px]">
          {runMutation.isLoading ? (
            <div className="card flex h-full min-h-[500px] flex-col items-center justify-center p-10">
              <Spinner size="lg" />
              <p className="mt-4 text-sm font-medium text-slate-700">
                Running {agent.name}...
              </p>
              <p className="mt-1 text-xs text-slate-500">
                This may take up to 30 seconds for typical analyses.
              </p>
            </div>
          ) : runMutation.isError ? (
            <div className="card border border-red-200 bg-red-50/40 p-6">
              <p className="text-sm font-semibold text-red-700">
                Agent execution failed
              </p>
              <p className="mt-1 text-sm text-red-600">
                {runMutation.error?.message ?? 'Unknown error'}
              </p>
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={() => runMutation.reset()}
              >
                Dismiss
              </button>
            </div>
          ) : runMutation.data ? (
            <OutputViewer
              result={runMutation.data}
              agentName={agent.name}
            />
          ) : (
            <div className="card flex h-full min-h-[500px] flex-col items-center justify-center p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                <AgentIcon kind={agent.icon} className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-700">
                Ready to run
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Fill in the inputs on the left and click <b>Run agent</b>. The
                markdown report will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
