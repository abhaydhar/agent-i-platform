import { Link } from 'react-router-dom';
import type { Agent } from '@/types';
import { AgentIcon } from './AgentIcon';

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const disabled = !agent.active;
  return (
    <div
      className={`card flex h-full flex-col p-5 transition ${
        disabled ? 'opacity-60' : 'hover:-translate-y-0.5 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <AgentIcon kind={agent.icon} />
        </div>
        {disabled ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            inactive
          </span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-100">
            active
          </span>
        )}
      </div>

      <h3 className="mt-4 text-base font-semibold text-slate-900">
        {agent.name}
      </h3>
      {agent.capability ? (
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-indigo-600">
          {agent.capability}
        </p>
      ) : null}
      <p className="mt-2 line-clamp-3 text-sm text-slate-600">
        {agent.description}
      </p>

      {agent.skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.skills.map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex-1" />

      <div className="flex items-center justify-end">
        {disabled ? (
          <button
            type="button"
            disabled
            className="btn-secondary cursor-not-allowed"
            title="This agent is currently disabled"
          >
            Unavailable
          </button>
        ) : (
          <Link to={`/agent/${agent.id}/run`} className="btn-primary">
            Run agent
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
