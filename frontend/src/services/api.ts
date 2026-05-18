import axios, { AxiosError } from 'axios';
import type {
  Agent,
  AgentRunRequest,
  AgentRunResponse,
  ChatMessage,
  Neo4jSettings,
  SendMessageResponse,
  SessionDetails,
} from '@/types';
import { MOCK_AGENTS, buildMockRunResponse } from './mockData';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '';

/** Default for typical API calls. Agent run / chat follow-up can take several minutes. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Long-running Claude + tools; override with VITE_AGENT_RUN_TIMEOUT_MS (milliseconds). */
const AGENT_RUN_TIMEOUT_MS =
  Number(import.meta.env.VITE_AGENT_RUN_TIMEOUT_MS) > 0
    ? Number(import.meta.env.VITE_AGENT_RUN_TIMEOUT_MS)
    : 900_000;

const http = axios.create({
  baseURL: API_URL ? `${API_URL}/api` : '/api',
  timeout: DEFAULT_TIMEOUT_MS,
});

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  if (err.code === 'ECONNABORTED') return true;
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('timeout');
}

function isNetworkOr404(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  if (isTimeoutError(err)) return false;
  if (!err.response) return true;
  return err.response.status === 404 || err.response.status >= 500;
}

async function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const mockSessions = new Map<string, SessionDetails>();

function getOrCreateMockSession(
  sessionId: string,
  agentId?: Agent['id']
): SessionDetails {
  const existing = mockSessions.get(sessionId);
  if (existing) return existing;
  const agent =
    MOCK_AGENTS.find((a) => String(a.id) === String(agentId)) ?? MOCK_AGENTS[0];
  const created: SessionDetails = {
    id: sessionId,
    agentId: agent.id,
    agentName: agent.name,
    inputs: null,
    history: [],
    lastOutput: null,
  };
  mockSessions.set(sessionId, created);
  return created;
}

export const api = {
  async listAgents(): Promise<Agent[]> {
    try {
      const { data } = await http.get<Agent[]>('/agents');
      if (Array.isArray(data) && data.length > 0) return data;
      return MOCK_AGENTS;
    } catch (err) {
      if (isNetworkOr404(err)) {
        console.warn('[api] backend unavailable, returning mock agents');
        return MOCK_AGENTS;
      }
      throw err;
    }
  },

  async getAgent(id: Agent['id']): Promise<Agent> {
    try {
      const { data } = await http.get<Agent>(`/agents/${id}/config`);
      return data;
    } catch (err) {
      if (isNetworkOr404(err)) {
        const found = MOCK_AGENTS.find((a) => String(a.id) === String(id));
        if (found) return found;
      }
      throw err;
    }
  },

  async createAgent(input: Partial<Agent>): Promise<Agent> {
    const { data } = await http.post<Agent>('/agents', input);
    return data;
  },

  async updateAgent(
    id: Agent['id'],
    patch: Partial<Agent>
  ): Promise<Agent> {
    const { data } = await http.put<Agent>(`/agents/${id}`, patch);
    return data;
  },

  async deleteAgent(id: Agent['id']): Promise<void> {
    await http.delete(`/agents/${id}`);
  },

  async runAgent(req: AgentRunRequest): Promise<AgentRunResponse> {
    try {
      const { data } = await http.post<AgentRunResponse>(
        `/agents/${req.agentId}/run`,
        { inputs: req.inputs },
        { timeout: AGENT_RUN_TIMEOUT_MS }
      );
      return data;
    } catch (err) {
      if (isTimeoutError(err)) {
        console.error('[api] agent run timed out waiting for the backend');
        throw new Error(
          `Agent run timed out after ${Math.round(AGENT_RUN_TIMEOUT_MS / 1000)}s. The server may still be finishing — check backend logs, or set VITE_AGENT_RUN_TIMEOUT_MS in frontend/.env (milliseconds).`
        );
      }
      if (isNetworkOr404(err)) {
        console.warn('[api] backend unavailable, returning mock run result');
        const agent =
          MOCK_AGENTS.find((a) => String(a.id) === String(req.agentId)) ??
          MOCK_AGENTS[0];
        await delay(900);
        const result = buildMockRunResponse(agent, req.inputs);
        const session = getOrCreateMockSession(result.sessionId, agent.id);
        session.inputs = req.inputs;
        session.lastOutput = {
          markdown: result.markdown,
          mermaid: result.mermaid ?? null,
          metadata: result.metadata as unknown as Record<string, unknown>,
        };
        return result;
      }
      throw err;
    }
  },

  async getSession(sessionId: string): Promise<SessionDetails> {
    try {
      const { data } = await http.get<SessionDetails>(
        `/conversations/${sessionId}`
      );
      return data;
    } catch (err) {
      if (isNetworkOr404(err)) {
        const session = mockSessions.get(sessionId);
        if (session) return session;
        return getOrCreateMockSession(sessionId);
      }
      throw err;
    }
  },

  async sendMessage(
    sessionId: string,
    content: string
  ): Promise<SendMessageResponse> {
    try {
      const { data } = await http.post<SendMessageResponse>(
        `/conversations/${sessionId}/message`,
        { content },
        { timeout: AGENT_RUN_TIMEOUT_MS }
      );
      return data;
    } catch (err) {
      if (isTimeoutError(err)) {
        console.error('[api] chat message timed out waiting for the backend');
        throw new Error(
          `Chat request timed out after ${Math.round(AGENT_RUN_TIMEOUT_MS / 1000)}s. Set VITE_AGENT_RUN_TIMEOUT_MS if runs regularly take longer.`
        );
      }
      if (isNetworkOr404(err)) {
        await delay(600);
        const session = getOrCreateMockSession(sessionId);
        const userMsg: ChatMessage = {
          id: `m-${Date.now()}-u`,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        };
        const assistantMsg: ChatMessage = {
          id: `m-${Date.now()}-a`,
          role: 'assistant',
          content: `**Mock follow-up reply:** I received your question — _"${content}"_.\n\nConfigure the backend (Phase 1 already shipped) and \`ANTHROPIC_API_KEY\` to get real Claude responses with the prior output as context.`,
          createdAt: new Date().toISOString(),
        };
        session.history = [...session.history, userMsg, assistantMsg];
        return {
          session,
          assistant: assistantMsg,
          run: {
            sessionId,
            markdown: assistantMsg.content,
            metadata: {
              executionMs: 600,
              tokensUsed: 0,
              filesAnalyzed: 0,
              model: 'mock',
            },
          },
        };
      }
      throw err;
    }
  },

  async switchSessionAgent(
    sessionId: string,
    agentId: Agent['id']
  ): Promise<SessionDetails> {
    try {
      const { data } = await http.post<SessionDetails>(
        `/conversations/${sessionId}/switch-agent`,
        { agentId }
      );
      return data;
    } catch (err) {
      if (isNetworkOr404(err)) {
        const session = getOrCreateMockSession(sessionId);
        const agent = MOCK_AGENTS.find(
          (a) => String(a.id) === String(agentId)
        );
        session.agentId = agent?.id ?? agentId;
        session.agentName = agent?.name ?? null;
        return session;
      }
      throw err;
    }
  },

  async listSkills(): Promise<
    Array<{
      id: number;
      name: string;
      description: string | null;
      mcp_integrations: string[];
      version: string;
      active: boolean;
    }>
  > {
    try {
      const { data } = await http.get('/skills');
      return data;
    } catch (err) {
      if (isNetworkOr404(err)) {
        return [
          {
            id: 1,
            name: 'data-lineage',
            description:
              'Trace field/column lineage across mixed-stack codebases.',
            mcp_integrations: ['filesystem', 'neo4j'],
            version: '1.1.0',
            active: true,
          },
          {
            id: 2,
            name: 'code-analysis',
            description: 'General static analysis.',
            mcp_integrations: ['filesystem'],
            version: '1.0.0',
            active: true,
          },
          {
            id: 3,
            name: 'neo4j',
            description: 'Read-only Cypher querying.',
            mcp_integrations: ['neo4j'],
            version: '1.0.0',
            active: true,
          },
        ];
      }
      throw err;
    }
  },

  async updateSkill(
    id: number,
    patch: { description?: string; version?: string; active?: boolean }
  ) {
    const { data } = await http.put(`/skills/${id}`, patch);
    return data;
  },

  async getNeo4jSettings(): Promise<Neo4jSettings> {
    try {
      const { data } = await http.get<Neo4jSettings>('/settings/neo4j');
      return data;
    } catch (err) {
      if (isNetworkOr404(err)) {
        return { configured: false };
      }
      throw err;
    }
  },

  async saveNeo4jSettings(input: {
    uri: string;
    user: string;
    password: string;
  }): Promise<void> {
    await http.put('/settings/neo4j', input);
  },

  async testNeo4j(): Promise<{ ok: boolean; message: string }> {
    try {
      const { data } = await http.post<{ ok: boolean; message: string }>(
        '/settings/neo4j/test'
      );
      return data;
    } catch (err) {
      if (isNetworkOr404(err)) {
        return { ok: false, message: 'Backend unreachable' };
      }
      throw err;
    }
  },
};
