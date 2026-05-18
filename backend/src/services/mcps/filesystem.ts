import { readFile, stat, readdir } from 'node:fs/promises';
import { isAbsolute, resolve, relative, sep, extname } from 'node:path';
import { env } from '../../config/env';

const DEFAULT_EXTENSIONS = ['.cs', '.py', '.sql', '.pls', '.ts', '.js'];

function resolveSafe(p: string, sandboxRoot: string): string {
  const abs = isAbsolute(p) ? resolve(p) : resolve(sandboxRoot, p);
  const rel = relative(sandboxRoot, abs);
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
    throw new Error(
      `Path '${p}' escapes the sandbox root '${sandboxRoot}'`
    );
  }
  return abs;
}

export interface FileEntry {
  path: string;
  bytes: number;
  preview?: string;
  truncated?: boolean;
}

export interface ListFilesOpts {
  directory?: string;
  extensions?: string[];
  maxFiles?: number;
  recursive?: boolean;
  /** When set, restrictions and path resolution use this root instead of FS_SANDBOX_ROOT. */
  sandboxRoot?: string;
}

export const FilesystemMCP = {
  effectiveRoot(sandboxRoot?: string): string {
    return sandboxRoot ?? resolve(env.fsSandboxRoot);
  },

  rootPath(sandboxRoot?: string): string {
    return this.effectiveRoot(sandboxRoot);
  },

  async readFile(path: string, sandboxRoot?: string): Promise<FileEntry> {
    const root = this.effectiveRoot(sandboxRoot);
    const abs = resolveSafe(path, root);
    const info = await stat(abs);
    if (!info.isFile()) {
      throw new Error(`Not a file: ${path}`);
    }
    const isLarge = info.size > env.maxFileBytes;
    const buf = await readFile(abs, 'utf8');
    const content = isLarge ? buf.slice(0, env.maxFileBytes) : buf;
    return {
      path: relative(root, abs) || abs,
      bytes: info.size,
      preview: content,
      truncated: isLarge,
    };
  },

  async listFiles(opts: ListFilesOpts = {}): Promise<FileEntry[]> {
    const root = this.effectiveRoot(opts.sandboxRoot);
    const dir = opts.directory ? resolveSafe(opts.directory, root) : root;
    const exts = (opts.extensions ?? DEFAULT_EXTENSIONS).map((e) =>
      e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
    );
    const max = Math.min(opts.maxFiles ?? env.maxFilesPerRun, 500);
    const recursive = opts.recursive ?? true;
    const out: FileEntry[] = [];

    async function walk(current: string) {
      if (out.length >= max) return;
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (out.length >= max) return;
        const full = `${current}${sep}${e.name}`;
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
          if (recursive) await walk(full);
          continue;
        }
        if (!e.isFile()) continue;
        const ext = extname(e.name).toLowerCase();
        if (exts.length > 0 && !exts.includes(ext)) continue;
        try {
          const info = await stat(full);
          out.push({
            path: relative(root, full) || full,
            bytes: info.size,
          });
        } catch {
          /* ignore */
        }
      }
    }

    await walk(dir);
    return out;
  },
};

export type FilesystemTool = typeof FilesystemMCP;
