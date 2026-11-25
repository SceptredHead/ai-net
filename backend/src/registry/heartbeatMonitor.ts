/**
 * HeartbeatMonitor
 *
 * Runs periodic checks to mark agents offline/deregistered when they stop
 * sending heartbeats. Emits events on the application EventBus.
 *
 * Thresholds (configurable via env):
 *   HEARTBEAT_OFFLINE_THRESHOLD_MS    — default 15 minutes (900_000 ms)
 *   HEARTBEAT_DEREGISTER_THRESHOLD_MS — default 45 minutes (2_700_000 ms)
 */
import { eventBus } from '../coordinator/eventBus';
import { createAgentDb, getAgentDb } from '../db/agents';
import type { AgentDb } from '../db/agents';
import { createLogger } from '../utils/logger';

const logger = createLogger({ component: 'heartbeatMonitor' });

const DEFAULT_OFFLINE_THRESHOLD_MS = 15 * 60 * 1000;    // 15 minutes
const DEFAULT_DEREGISTER_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes
const CHECK_INTERVAL_MS = 60 * 1000;                     // 60 seconds

export interface HeartbeatMonitorOptions {
  offlineThresholdMs?: number;
  deregisterThresholdMs?: number;
  checkIntervalMs?: number;
  /** Injectable clock for testing */
  now?: () => number;
  /** Injectable agent DB for testing */
  agentDb?: AgentDb;
  /** Injectable on-chain revocation function */
  revokeOnChain?: (agentId: string) => Promise<void>;
}

export class HeartbeatMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly offlineThresholdMs: number;
  private readonly deregisterThresholdMs: number;
  private readonly checkIntervalMs: number;
  private readonly now: () => number;
  private readonly getDb: () => AgentDb;
  private readonly revokeOnChain: (agentId: string) => Promise<void>;

  constructor(options: HeartbeatMonitorOptions = {}) {
    this.offlineThresholdMs =
      options.offlineThresholdMs ??
      Number(process.env['HEARTBEAT_OFFLINE_THRESHOLD_MS'] ?? DEFAULT_OFFLINE_THRESHOLD_MS);
    this.deregisterThresholdMs =
      options.deregisterThresholdMs ??
      Number(process.env['HEARTBEAT_DEREGISTER_THRESHOLD_MS'] ?? DEFAULT_DEREGISTER_THRESHOLD_MS);
    this.checkIntervalMs = options.checkIntervalMs ?? CHECK_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
    this.getDb = options.agentDb
      ? () => options.agentDb!
      : () => createAgentDb(getAgentDb());
    this.revokeOnChain = options.revokeOnChain ?? defaultRevokeOnChain;
  }

  start(): void {
    if (this.intervalId !== null) return;
    logger.info('HeartbeatMonitor started');
    this.intervalId = setInterval(() => {
      void this.check();
    }, this.checkIntervalMs);
    // Allow Node.js to exit even if the interval is pending
    if (typeof this.intervalId === 'object' && this.intervalId !== null && 'unref' in this.intervalId) {
      (this.intervalId as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    logger.info('HeartbeatMonitor stopped');
  }

  async check(): Promise<void> {
    try {
      const db = this.getDb();
      const now = this.now();
      const agents = db.list({});

      for (const agent of agents) {
        if (agent.bannedAt) continue;

        const lastSeen = new Date(agent.lastSeenAt).getTime();
        const elapsed = now - lastSeen;

        if (agent.status === 'online' && elapsed >= this.offlineThresholdMs) {
          logger.info({ agentId: agent.id, elapsed }, 'Marking agent offline');
          db.upsert({ ...agent, status: 'offline' });
          eventBus.emit('agent_lifecycle', {
            type: 'agent_offline' as 'AgentMarkedOffline',
            taskId: 'agent_lifecycle',
            nodeId: agent.id,
            timestamp: new Date(now).toISOString(),
            payload: { agentId: agent.id, reason: 'heartbeat_timeout' },
          });
        } else if (agent.status === 'offline' && elapsed >= this.deregisterThresholdMs) {
          logger.info({ agentId: agent.id, elapsed }, 'Deregistering agent');
          db.upsert({ ...agent, status: 'deregistered' as 'offline' });
          try {
            await this.revokeOnChain(agent.id);
          } catch (err) {
            logger.error({ err, agentId: agent.id }, 'On-chain revocation failed');
          }
          eventBus.emit('agent_lifecycle', {
            type: 'agent_deregistered' as 'AgentMarkedOffline',
            taskId: 'agent_lifecycle',
            nodeId: agent.id,
            timestamp: new Date(now).toISOString(),
            payload: { agentId: agent.id, reason: 'heartbeat_timeout' },
          });
        }
      }
    } catch (err) {
      logger.error({ err }, 'HeartbeatMonitor check failed');
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

/** Default no-op on-chain revocation (real implementation wires to Stellar contract). */
async function defaultRevokeOnChain(agentId: string): Promise<void> {
  logger.warn({ agentId }, 'On-chain revocation not configured — skipping');
}

export const heartbeatMonitor = new HeartbeatMonitor();
