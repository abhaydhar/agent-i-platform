import 'dotenv/config';

function readString(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

function readInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const PLACEHOLDER_KEYS = new Set([
  'sk_your_key_here',
  'sk-your-key-here',
  'your-anthropic-api-key',
  'changeme',
]);

function readCredential(name: string): string | undefined {
  const v = readString(name);
  if (!v) return undefined;
  if (PLACEHOLDER_KEYS.has(v.trim().toLowerCase())) return undefined;
  return v;
}

export const env = {
  nodeEnv: readString('NODE_ENV', 'development') ?? 'development',
  port: readInt('PORT', 5000),
  databaseUrl: readString('DATABASE_URL'),
  anthropicApiKey: readCredential('ANTHROPIC_API_KEY'),
  anthropicAuthToken: readCredential('ANTHROPIC_AUTH_TOKEN'),
  anthropicBaseUrl: readString('ANTHROPIC_BASE_URL'),
  anthropicModel:
    readString('ANTHROPIC_MODEL', 'claude-3-5-sonnet-20240620') ??
    'claude-3-5-sonnet-20240620',
  neo4jUri: readString('NEO4J_URI'),
  neo4jUser: readString('NEO4J_USER'),
  neo4jPassword: readString('NEO4J_PASSWORD'),
  debug: readString('DEBUG'),
  fsSandboxRoot: readString('FS_SANDBOX_ROOT') ?? process.cwd(),
  /** If set, repo_root / repo_path / inferred paths must stay inside this directory. */
  fsAllowedRoot: readString('FS_ALLOWED_ROOT'),
  maxAgentIterations: readInt('MAX_AGENT_ITERATIONS', 40),
  maxAgentTokensPerCall: readInt('MAX_AGENT_TOKENS_PER_CALL', 8192),
  maxFileBytes: readInt('MAX_FILE_BYTES', 200_000),
  maxFilesPerRun: readInt('MAX_FILES_PER_RUN', 25),
};

export const claudeAuthMode: 'api-key' | 'auth-token' | 'none' =
  env.anthropicAuthToken
    ? 'auth-token'
    : env.anthropicApiKey
      ? 'api-key'
      : 'none';

export type Env = typeof env;
