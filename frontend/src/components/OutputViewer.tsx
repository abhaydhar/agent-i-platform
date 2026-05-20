import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { AgentRunResponse, OutputViewMode } from '@/types';
import { MermaidDiagram } from './MermaidDiagram';

interface OutputViewerProps {
  result: AgentRunResponse;
  agentName: string;
}

const VIEW_OPTIONS: Array<{ id: OutputViewMode; label: string }> = [
  { id: 'split', label: 'Split' },
  { id: 'source', label: 'Source' },
  { id: 'preview', label: 'Preview' },
];

function renderHtmlDocument(title: string, html: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 32px auto; padding: 0 24px; color: #0f172a; line-height: 1.6; }
    h1, h2, h3 { color: #0f172a; }
    h1 { border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { background: #0f172a; color: #f1f5f9; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: transparent; color: inherit; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
    th { background: #f8fafc; }
    blockquote { border-left: 4px solid #cbd5e1; background: #f8fafc; padding: 8px 16px; color: #475569; }
    a { color: #4f46e5; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function markdownToHtmlString(markdown: string): string {
  const container = document.querySelector('[data-md-preview]');
  if (container instanceof HTMLElement) return container.innerHTML;
  return `<pre>${markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</pre>`;
}

export function OutputViewer({ result, agentName }: OutputViewerProps) {
  const [mode, setMode] = useState<OutputViewMode>('preview');
  const [copied, setCopied] = useState(false);

  const meta = result.metadata ?? { executionMs: 0 };
  const markdown = result.markdown ?? '';

  const baseFilename = useMemo(
    () => `${slugify(agentName) || 'agent'}-${result.sessionId}`,
    [agentName, result.sessionId]
  );

  function handleCopy() {
    navigator.clipboard
      .writeText(markdown)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        setCopied(false);
      });
  }

  function handleDownloadMd() {
    downloadFile(`${baseFilename}.md`, markdown, 'text/markdown');
  }

  function handleDownloadHtml() {
    const html = markdownToHtmlString(markdown);
    const doc = renderHtmlDocument(agentName, html);
    downloadFile(`${baseFilename}.html`, doc, 'text/html');
  }

  function handleDownloadMermaid() {
    if (!result.mermaid) return;
    downloadFile(`${baseFilename}.mmd`, result.mermaid, 'text/plain');
  }

  const showSource = mode === 'source' || mode === 'split';
  const showPreview = mode === 'preview' || mode === 'split';

  return (
    <div className="card flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Output
          </span>
          <div className="inline-flex overflow-hidden rounded-md ring-1 ring-inset ring-slate-300">
            {VIEW_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium transition ${
                  mode === opt.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn-secondary !py-1 !px-2.5 text-xs"
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy MD'}
          </button>
          <button
            type="button"
            className="btn-secondary !py-1 !px-2.5 text-xs"
            onClick={handleDownloadMd}
          >
            Download .md
          </button>
          <button
            type="button"
            className="btn-secondary !py-1 !px-2.5 text-xs"
            onClick={handleDownloadHtml}
          >
            Download .html
          </button>
          {result.mermaid ? (
            <button
              type="button"
              className="btn-secondary !py-1 !px-2.5 text-xs"
              onClick={handleDownloadMermaid}
            >
              Download .mmd
            </button>
          ) : null}
          <Link
            to={`/chat/${result.sessionId}`}
            className="btn-primary !py-1 !px-2.5 text-xs"
          >
            Ask follow-up →
          </Link>
        </div>
      </div>

      <div className={`grid flex-1 overflow-hidden ${mode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {showSource ? (
          <div
            className={`flex min-h-0 flex-col border-slate-200 ${
              showPreview ? 'border-b lg:border-b-0 lg:border-r' : ''
            }`}
          >
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Markdown source
            </div>
            <pre className="m-0 flex-1 overflow-auto bg-slate-900 px-4 py-3 text-xs leading-5 text-slate-100">
              <code>{markdown}</code>
            </pre>
          </div>
        ) : null}

        {showPreview ? (
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Rendered preview
            </div>
            <div
              data-md-preview
              className="markdown-body flex-1 overflow-auto px-5 py-4"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdown}
              </ReactMarkdown>
              {result.mermaid ? (
                <div className="mt-4">
                  <h2 className="!mt-6 text-lg font-semibold">
                    Visual diagram
                  </h2>
                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
                    <MermaidDiagram chart={result.mermaid} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-600">Session:</span>{' '}
          {result.sessionId}
        </span>
        <span>
          <span className="font-semibold text-slate-600">Took:</span>{' '}
          {meta.executionMs} ms
        </span>
        {meta.tokensUsed !== undefined ? (
          <span>
            <span className="font-semibold text-slate-600">Tokens:</span>{' '}
            {meta.tokensUsed}
          </span>
        ) : null}
        {meta.filesAnalyzed !== undefined ? (
          <span>
            <span className="font-semibold text-slate-600">Files:</span>{' '}
            {meta.filesAnalyzed}
          </span>
        ) : null}
        {meta.model ? (
          <span>
            <span className="font-semibold text-slate-600">Model:</span>{' '}
            {meta.model}
          </span>
        ) : null}
      </div>
    </div>
  );
}
