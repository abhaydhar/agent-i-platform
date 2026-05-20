import { v4 as uuid } from 'uuid';
import { AgentModel } from '../models/Agent';
import { SessionModel } from '../models/Session';
import { OutputModel } from '../models/Output';
import type { ChatMessage } from '../models/types';
import { AgentExecutor, type RunResult } from './AgentExecutor';
import { HttpError } from '../utils/http';

export interface SessionDetails {
  id: string;
  agentId: number | null;
  agentName: string | null;
  inputs: Record<string, unknown> | null;
  history: ChatMessage[];
  lastOutput: {
    markdown: string;
    mermaid: string | null;
    metadata: Record<string, unknown>;
  } | null;
}

export const ConversationManager = {
  async load(sessionId: string): Promise<SessionDetails> {
    const session = await SessionModel.findById(sessionId);
    if (!session) throw new HttpError(404, 'Session not found');

    const lastOutput = await OutputModel.latestForSession(sessionId);
    let agentName: string | null = null;
    if (session.agent_id) {
      const a = await AgentModel.findById(session.agent_id);
      agentName = a?.name ?? null;
    }
    return {
      id: session.id,
      agentId: session.agent_id,
      agentName,
      inputs: session.inputs,
      history: session.conversation_history,
      lastOutput: lastOutput
        ? {
            markdown: lastOutput.markdown_content,
            mermaid: lastOutput.mermaid_content,
            metadata: lastOutput.metadata,
          }
        : null,
    };
  },

  async switchAgent(
    sessionId: string,
    agentId: number
  ): Promise<SessionDetails> {
    const agent = await AgentModel.findById(agentId);
    if (!agent) throw new HttpError(404, 'Agent not found');
    await SessionModel.setAgent(sessionId, agentId);
    return ConversationManager.load(sessionId);
  },

  async sendMessage(opts: {
    sessionId: string;
    content: string;
  }): Promise<{ session: SessionDetails; assistant: ChatMessage; run: RunResult }> {
    const session = await SessionModel.findById(opts.sessionId);
    if (!session) throw new HttpError(404, 'Session not found');
    if (!session.agent_id) {
      throw new HttpError(
        400,
        'Session has no agent selected. Choose an agent before sending messages.'
      );
    }

    const agent = await AgentModel.findById(session.agent_id);
    if (!agent) throw new HttpError(404, 'Linked agent not found');

    const userMessage: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: opts.content,
      createdAt: new Date().toISOString(),
    };

    const lastOutput = await OutputModel.latestForSession(opts.sessionId);

    const run = await AgentExecutor.run({
      agent,
      sessionId: opts.sessionId,
      inputs: session.inputs ?? {},
      priorMarkdown: lastOutput?.markdown_content,
      userMessage: opts.content,
    });

    const assistantMessage: ChatMessage = {
      id: uuid(),
      role: 'assistant',
      content: run.markdown,
      createdAt: new Date().toISOString(),
    };

    await SessionModel.appendMessages(opts.sessionId, [
      userMessage,
      assistantMessage,
    ]);

    // Save the Q&A chat output to track tokens
    await OutputModel.create({
      session_id: opts.sessionId,
      markdown_content: run.markdown,
      mermaid_content: run.mermaid,
      metadata: run.metadata as unknown as Record<string, unknown>,
    });

    const session2 = await ConversationManager.load(opts.sessionId);
    return { session: session2, assistant: assistantMessage, run };
  },
};
