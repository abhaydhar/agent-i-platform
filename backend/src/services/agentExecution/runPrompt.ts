import { resolve } from 'node:path';
import { env } from '../../config/env';
import type { RunRequest } from './types';

function renderInputs(inputs: Record<string, unknown>): string {
  return Object.entries(inputs)
    .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
    .join('\n');
}

function authoritativeRunDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** User message for the first turn of an agent run (and shared by Agent SDK path). */
export function buildInitialUserMessage(req: RunRequest): string {
  const dateLine = `**Authoritative run date (UTC):** ${authoritativeRunDateUtc()}`;
  const lines: string[] = [];
  if (req.userMessage) {
    lines.push(req.userMessage);
    if (req.priorMarkdown) {
      lines.push('', 'Prior agent output (for context):', '');
      lines.push(req.priorMarkdown);
    }
    lines.push('', dateLine);
  } else {
    lines.push(`Please run the **${req.agent.name}** agent with these inputs:`);
    lines.push('');
    lines.push(renderInputs(req.inputs));
    const root = req.fsSandboxRoot
      ? resolve(req.fsSandboxRoot)
      : resolve(env.fsSandboxRoot);
    if (root !== resolve(env.fsSandboxRoot)) {
      lines.push('');
      lines.push(
        `**Filesystem root for tools:** \`${root}\` (all list_files / read_file paths are resolved under this directory).`
      );
    }
    lines.push('');
    lines.push(dateLine);
    lines.push('');
    lines.push(
      'Produce a complete, well-structured markdown report. If the agent supports a Mermaid diagram and the inputs request one, include it in a ```mermaid fenced block.'
    );
  }
  return lines.join('\n');
}
