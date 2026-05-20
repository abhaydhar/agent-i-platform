import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';

import { ChatWindow } from '@/components/ChatWindow';
import { Spinner } from '@/components/Spinner';
import { TokenStatsDisplay } from '@/components/TokenStatsDisplay';
import { api } from '@/services/api';
import type { Agent, ChatMessage } from '@/types';

export function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();

  const sessionQuery = useQuery(
    ['session', sessionId],
    () => api.getSession(sessionId as string),
    { enabled: Boolean(sessionId) }
  );

  const agentsQuery = useQuery(['agents'], () => api.listAgents());

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.sendMessage(sessionId as string, content),
    onSuccess: (data) => {
      qc.setQueryData(['session', sessionId], data.session);
    },
  });

  const switchAgentMutation = useMutation({
    mutationFn: (agentId: Agent['id']) =>
      api.switchSessionAgent(sessionId as string, agentId),
    onSuccess: (data) => {
      qc.setQueryData(['session', sessionId], data);
    },
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="card flex items-center justify-center p-12">
        <Spinner size="lg" label="Loading conversation..." />
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <div className="card border border-red-200 bg-red-50/50 p-6">
        <p className="text-sm font-semibold text-red-700">
          Failed to load conversation
        </p>
        <p className="mt-1 text-sm text-red-600">
          {(sessionQuery.error as Error)?.message ?? 'Session not found'}
        </p>
        <Link to="/" className="btn-secondary mt-3">
          Back to agents
        </Link>
      </div>
    );
  }

  const session = sessionQuery.data;
  const allMessages: ChatMessage[] = (() => {
    const arr: ChatMessage[] = [];
    if (session.lastOutput) {
      const preview = session.lastOutput.markdown.slice(0, 240);
      arr.push({
        id: 'system-initial',
        role: 'system',
        content: `Initial ${session.agentName ?? 'agent'} output ready (${session.lastOutput.markdown.length} chars). Preview: "${preview.replace(/\s+/g, ' ')}${preview.length < session.lastOutput.markdown.length ? '…' : ''}"`,
        createdAt: new Date(0).toISOString(),
      });
    }
    return [...arr, ...session.history];
  })();

  return (
    <div className="space-y-6">
      <nav className="text-xs text-slate-500">
        <Link to="/" className="hover:text-slate-700">
          Agents
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">
          Chat: {session.agentName ?? 'no agent'}
        </span>
      </nav>

      <div className="grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <section className="card flex h-[min(85vh,58rem)] min-h-[20rem] flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                {session.agentName ?? 'No agent selected'}
              </h1>
              <p className="text-xs text-slate-500">
                Session{' '}
                <span className="font-mono">{session.id.slice(0, 12)}…</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">
                Switch agent:
              </label>
              <select
                className="field-input !py-1 !text-xs"
                value={String(session.agentId ?? '')}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) switchAgentMutation.mutate(id);
                }}
                disabled={switchAgentMutation.isLoading}
              >
                {agentsQuery.data
                  ?.filter((a) => a.active)
                  .map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <ChatWindow
              messages={allMessages}
              pending={sendMutation.isLoading}
              onSend={(c) => sendMutation.mutate(c)}
              disabled={!session.agentId}
              placeholder={
                session.agentId
                  ? 'Ask a follow-up about the prior output...'
                  : 'Select an agent first'
              }
            />
          </div>
        </section>

        <aside className="space-y-4">
          <TokenStatsDisplay sessionId={sessionId || null} />

          {session.lastOutput ? (
            <div className="card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Initial output
              </h2>
              <p className="mt-2 line-clamp-6 text-xs text-slate-600">
                {session.lastOutput.markdown}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {Object.entries(session.lastOutput.metadata).map(([k, v]) => (
                  <span key={k}>
                    <span className="font-semibold text-slate-600">{k}:</span>{' '}
                    {String(v)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {session.inputs ? (
            <div className="card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Inputs
              </h2>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                {JSON.stringify(session.inputs, null, 2)}
              </pre>
            </div>
          ) : null}

          {sendMutation.isError ? (
            <div className="card border border-red-200 bg-red-50/40 p-4">
              <p className="text-xs font-semibold text-red-700">
                Send failed
              </p>
              <p className="mt-1 text-xs text-red-600">
                {(sendMutation.error as Error)?.message ?? 'Unknown error'}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
