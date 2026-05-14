import type { Agent } from '@/types';
import { AgentCard } from './AgentCard';

interface AgentGridProps {
  agents: Agent[];
}

export function AgentGrid({ agents }: AgentGridProps) {
  if (agents.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center p-12 text-center">
        <p className="text-sm font-medium text-slate-700">No agents available</p>
        <p className="mt-1 text-xs text-slate-500">
          Seed the database or create one from the admin dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
