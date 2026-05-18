/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Milliseconds; agent run and chat follow-up POST timeouts (default 900000). */
  readonly VITE_AGENT_RUN_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
