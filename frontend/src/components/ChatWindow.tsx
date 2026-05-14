import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ChatMessage } from '@/types';
import { Spinner } from './Spinner';

interface ChatWindowProps {
  messages: ChatMessage[];
  pending?: boolean;
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function ChatWindow({
  messages,
  pending,
  onSend,
  disabled,
  placeholder = 'Ask a follow-up...',
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);

  function submit() {
    const v = draft.trim();
    if (!v || disabled || pending) return;
    onSend(v);
    setDraft('');
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
            No messages yet. Ask a follow-up question below.
          </div>
        ) : null}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {pending ? (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <Spinner size="sm" />
            <span>Thinking...</span>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            rows={2}
            placeholder={placeholder}
            disabled={disabled || pending}
            className="field-input flex-1 resize-none"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={disabled || pending || !draft.trim()}
            onClick={submit}
          >
            Send
          </button>
        </div>
        <p className="field-hint mt-1">
          Press <kbd className="rounded bg-slate-100 px-1">Enter</kbd> to send,
          <kbd className="ml-1 rounded bg-slate-100 px-1">Shift+Enter</kbd> for
          newline.
        </p>
      </div>
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="mx-auto max-w-prose rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-white ring-1 ring-slate-200'
        }`}
      >
        <div
          className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
            isUser ? 'text-indigo-100' : 'text-slate-400'
          }`}
        >
          {isUser ? 'You' : 'Assistant'} · {formatTime(message.createdAt)}
        </div>
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
