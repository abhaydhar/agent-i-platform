import { useMemo, useState } from 'react';
import { useQuery } from 'react-query';

import { AgentGrid } from '@/components/AgentGrid';
import { Spinner } from '@/components/Spinner';
import { api } from '@/services/api';

export function Home() {
  const [query, setQuery] = useState('');
  const { data, isLoading, isError, error, refetch } = useQuery(
    ['agents'],
    () => api.listAgents()
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.skills.some((s) => s.toLowerCase().includes(q))
    );
  }, [data, query]);

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Run a agent
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Pick an agent, give it inputs, and get a structured markdown report
          you can download or follow up on in chat.
        </p>
      </section>

      <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Available agents
          </h2>
          {data ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {data.length}
            </span>
          ) : null}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents..."
            className="field-input pl-9"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </div>
      </section>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12">
          <Spinner size="lg" label="Loading agents..." />
        </div>
      ) : isError ? (
        <div className="card border border-red-200 bg-red-50/50 p-6">
          <p className="text-sm font-semibold text-red-700">
            Failed to load agents
          </p>
          <p className="mt-1 text-sm text-red-600">
            {(error as Error)?.message ?? 'Unknown error'}
          </p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <AgentGrid agents={filtered} />
      )}
    </div>
  );
}
