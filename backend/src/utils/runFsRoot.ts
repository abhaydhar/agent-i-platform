import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { env } from '../config/env';

const CODE_FILE_RE = /\.(cs|py|sql|pls|ts|tsx|js|jsx)$/i;

function isInsideDir(rootDir: string, candidate: string): boolean {
  const root = resolve(rootDir);
  const abs = resolve(candidate);
  if (root === abs) return true;
  const rel = relative(root, abs);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

function assertAllowed(target: string): void {
  const allowed = env.fsAllowedRoot;
  if (!allowed) return;
  if (!isInsideDir(allowed, target)) {
    throw new Error(
      `Resolved path "${target}" is outside FS_ALLOWED_ROOT (${resolve(allowed)})`
    );
  }
}

function trimStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function inferFromFilePaths(fp: unknown): string | null {
  if (!Array.isArray(fp)) return null;
  for (const entry of fp) {
    const line = trimStr(entry);
    if (!line) continue;
    const beforeGlob = line.split('*')[0]?.trim() ?? line;
    const stripped = beforeGlob.replace(/[/\\]+$/, '');
    if (!stripped) continue;
    if (!isAbsolute(stripped)) continue;
    let candidate = resolve(stripped);
    if (CODE_FILE_RE.test(candidate)) {
      candidate = dirname(candidate);
    }
    return resolve(candidate);
  }
  return null;
}

/**
 * Effective filesystem sandbox for this agent run (list_files, read_file, optional code-parser tools).
 */
export function computeRunFsRoot(inputs: Record<string, unknown>): string {
  const defaultRoot = resolve(env.fsSandboxRoot);

  for (const key of ['repo_root', 'repo_path'] as const) {
    const s = trimStr(inputs[key]);
    if (!s) continue;
    const abs = isAbsolute(s) ? resolve(s) : resolve(defaultRoot, s);
    assertAllowed(abs);
    return abs;
  }

  const inferred = inferFromFilePaths(inputs.file_paths);
  if (inferred) {
    assertAllowed(inferred);
    return inferred;
  }

  return defaultRoot;
}
