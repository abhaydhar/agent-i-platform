/**
 * Progress Emitter Service
 * Manages SSE connections and broadcasts agent execution progress
 */
import { EventEmitter } from 'events';
import type { Response } from 'express';
import { createLogger } from '../../utils/logger';
import type { ProgressEvent } from './progressTypes';

const log = createLogger('progress-emitter');

interface SSEClient {
  sessionId: string;
  res: Response;
  connectedAt: number;
}

class ProgressEmitterService {
  private emitters = new Map<string, EventEmitter>();
  private sseClients = new Map<string, SSEClient[]>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup stale connections every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  /**
   * Register an SSE client for a session
   */
  registerSSEClient(sessionId: string, res: Response): void {
    const client: SSEClient = {
      sessionId,
      res,
      connectedAt: Date.now(),
    };

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Store client
    const clients = this.sseClients.get(sessionId) || [];
    clients.push(client);
    this.sseClients.set(sessionId, clients);

    log.info(`SSE client connected for session ${sessionId} (total: ${clients.length})`);

    // Send initial keep-alive
    this.sendSSE(res, { type: 'connected', sessionId, timestamp: Date.now() });

    // Handle client disconnect
    res.on('close', () => {
      this.unregisterSSEClient(sessionId, res);
    });
  }

  /**
   * Unregister an SSE client
   */
  private unregisterSSEClient(sessionId: string, res: Response): void {
    const clients = this.sseClients.get(sessionId);
    if (!clients) return;

    const filtered = clients.filter((c) => c.res !== res);
    if (filtered.length === 0) {
      this.sseClients.delete(sessionId);
    } else {
      this.sseClients.set(sessionId, filtered);
    }

    log.info(`SSE client disconnected for session ${sessionId} (remaining: ${filtered.length})`);
  }

  /**
   * Get or create an emitter for a session
   */
  getEmitter(sessionId: string): EventEmitter {
    let emitter = this.emitters.get(sessionId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(50); // Increase if needed
      this.emitters.set(sessionId, emitter);
      log.info(`Created emitter for session ${sessionId}`);
    }
    return emitter;
  }

  /**
   * Emit a progress event for a session
   */
  emit(sessionId: string, event: ProgressEvent): void {
    // Emit to local emitter (for in-memory subscribers)
    const emitter = this.getEmitter(sessionId);
    emitter.emit('progress', event);

    // Broadcast to SSE clients
    const clients = this.sseClients.get(sessionId);
    if (clients && clients.length > 0) {
      clients.forEach((client) => {
        this.sendSSE(client.res, event);
      });
    }

    // Log important events
    if (event.type === 'started' || event.type === 'completed' || event.type === 'error') {
      log.info(`Session ${sessionId}: ${event.type}`, event);
    }
  }

  /**
   * Send an SSE message to a client
   */
  private sendSSE(res: Response, data: any): void {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      log.warn('Failed to write SSE message', err);
    }
  }

  /**
   * Mark a session as complete and cleanup
   */
  complete(sessionId: string): void {
    // Close all SSE connections for this session
    const clients = this.sseClients.get(sessionId);
    if (clients) {
      clients.forEach((client) => {
        try {
          client.res.end();
        } catch (err) {
          log.warn(`Failed to close SSE connection for session ${sessionId}`, err);
        }
      });
      this.sseClients.delete(sessionId);
    }

    // Remove emitter
    const emitter = this.emitters.get(sessionId);
    if (emitter) {
      emitter.removeAllListeners();
      this.emitters.delete(sessionId);
    }

    log.info(`Cleaned up session ${sessionId}`);
  }

  /**
   * Cleanup stale connections
   */
  private cleanup(): void {
    const now = Date.now();
    const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

    for (const [sessionId, clients] of this.sseClients.entries()) {
      const activeClients = clients.filter((client) => {
        const age = now - client.connectedAt;
        if (age > MAX_AGE_MS) {
          try {
            client.res.end();
          } catch (err) {
            // Ignore
          }
          return false;
        }
        return true;
      });

      if (activeClients.length === 0) {
        this.sseClients.delete(sessionId);
        this.emitters.delete(sessionId);
      } else if (activeClients.length !== clients.length) {
        this.sseClients.set(sessionId, activeClients);
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);

    // Close all connections
    for (const [sessionId] of this.sseClients.entries()) {
      this.complete(sessionId);
    }
  }
}

// Singleton instance
export const progressEmitter = new ProgressEmitterService();

// Cleanup on process exit
process.on('SIGTERM', () => progressEmitter.shutdown());
process.on('SIGINT', () => progressEmitter.shutdown());
