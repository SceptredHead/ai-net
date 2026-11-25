import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { HeartbeatMonitor } from './heartbeatMonitor';
import type { AgentDb, AgentRecord } from '../db/agents';

const OFFLINE_MS = 15 * 60 * 1000;
const DEREGISTER_MS = 45 * 60 * 1000;

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-test',
    capabilities: ['coding'],
    pricingXLM: 1,
    endpoint: 'http://localhost:3001',
    stellarPublicKey: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZFA12NJLLU7DFKPBRX2V', // placeholder
    reputationScore: 2.5,
    lastSeenAt: new Date().toISOString(),
    status: 'online',
    bannedAt: null,
    ...overrides,
  };
}

function makeDb(agents: AgentRecord[]): jest.Mocked<AgentDb> {
  const db: jest.Mocked<AgentDb> = {
    list: jest.fn(() => agents),
    upsert: jest.fn(),
    findById: jest.fn((id: string) => agents.find(a => a.id === id)),
    updateReputation: jest.fn(),
    updateReputationWithStats: jest.fn(),
    countByStellarKey: jest.fn(() => 0),
    delete: jest.fn(),
    listCursor: jest.fn(() => ({ items: agents })),
    listReputationHistory: jest.fn(() => []),
    markAllOffline: jest.fn(),
    updateLastSeen: jest.fn(),
    listBannedAgentIds: jest.fn(() => []),
    markStaleAgents: jest.fn(() => 0),
    deleteOfflineAgents: jest.fn(() => 0),
  } as unknown as jest.Mocked<AgentDb>;
  return db;
}

describe('HeartbeatMonitor', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks an online agent offline after the offline threshold', async () => {
    const baseTime = Date.now();
    const agents = [
      makeAgent({
        id: 'agent-1',
        status: 'online',
        lastSeenAt: new Date(baseTime - OFFLINE_MS - 1000).toISOString(),
        bannedAt: null,
      }),
    ];
    const db = makeDb(agents);
    const revokeOnChain = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = new HeartbeatMonitor({
      offlineThresholdMs: OFFLINE_MS,
      deregisterThresholdMs: DEREGISTER_MS,
      checkIntervalMs: 60_000,
      now: () => baseTime,
      agentDb: db,
      revokeOnChain,
    });

    await monitor.check();

    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-1', status: 'offline' }),
    );
    expect(revokeOnChain).not.toHaveBeenCalled();
  });

  it('deregisters an offline agent after the deregister threshold', async () => {
    const baseTime = Date.now();
    const agents = [
      makeAgent({
        id: 'agent-2',
        status: 'offline',
        lastSeenAt: new Date(baseTime - DEREGISTER_MS - 1000).toISOString(),
        bannedAt: null,
      }),
    ];
    const db = makeDb(agents);
    const revokeOnChain = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = new HeartbeatMonitor({
      offlineThresholdMs: OFFLINE_MS,
      deregisterThresholdMs: DEREGISTER_MS,
      now: () => baseTime,
      agentDb: db,
      revokeOnChain,
    });

    await monitor.check();

    expect(revokeOnChain).toHaveBeenCalledWith('agent-2');
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-2', status: 'deregistered' }),
    );
  });

  it('calls revokeOnChain exactly once per deregistered agent', async () => {
    const baseTime = Date.now();
    const agents = [
      makeAgent({
        id: 'agent-3',
        status: 'offline',
        lastSeenAt: new Date(baseTime - DEREGISTER_MS - 1000).toISOString(),
        bannedAt: null,
      }),
    ];
    const db = makeDb(agents);
    const revokeOnChain = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = new HeartbeatMonitor({
      offlineThresholdMs: OFFLINE_MS,
      deregisterThresholdMs: DEREGISTER_MS,
      now: () => baseTime,
      agentDb: db,
      revokeOnChain,
    });

    await monitor.check();

    expect(revokeOnChain).toHaveBeenCalledTimes(1);
  });

  it('does not mark an online agent offline before the threshold', async () => {
    const baseTime = Date.now();
    const agents = [
      makeAgent({
        id: 'agent-fresh',
        status: 'online',
        // 1 second before the threshold — should not trigger
        lastSeenAt: new Date(baseTime - OFFLINE_MS + 1000).toISOString(),
        bannedAt: null,
      }),
    ];
    const db = makeDb(agents);
    const revokeOnChain = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = new HeartbeatMonitor({
      offlineThresholdMs: OFFLINE_MS,
      deregisterThresholdMs: DEREGISTER_MS,
      now: () => baseTime,
      agentDb: db,
      revokeOnChain,
    });

    await monitor.check();

    expect(db.upsert).not.toHaveBeenCalled();
    expect(revokeOnChain).not.toHaveBeenCalled();
  });

  it('stop() clears the interval and isRunning() returns false', () => {
    jest.useFakeTimers();
    const monitor = new HeartbeatMonitor({ checkIntervalMs: 60_000 });
    monitor.start();
    expect(monitor.isRunning()).toBe(true);
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  it('start() is idempotent — calling it twice does not create two intervals', () => {
    jest.useFakeTimers();
    const monitor = new HeartbeatMonitor({ checkIntervalMs: 60_000 });
    monitor.start();
    monitor.start(); // second call must be a no-op
    expect(monitor.isRunning()).toBe(true);
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  it('skips banned agents regardless of elapsed time', async () => {
    const baseTime = Date.now();
    const agents = [
      makeAgent({
        id: 'agent-banned',
        status: 'online',
        lastSeenAt: new Date(baseTime - OFFLINE_MS - 1000).toISOString(),
        bannedAt: new Date().toISOString(),
      }),
    ];
    const db = makeDb(agents);
    const revokeOnChain = jest.fn<() => Promise<void>>();

    const monitor = new HeartbeatMonitor({
      offlineThresholdMs: OFFLINE_MS,
      deregisterThresholdMs: DEREGISTER_MS,
      now: () => baseTime,
      agentDb: db,
      revokeOnChain,
    });

    await monitor.check();

    expect(db.upsert).not.toHaveBeenCalled();
    expect(revokeOnChain).not.toHaveBeenCalled();
  });

  it('continues revokeOnChain failure without crashing', async () => {
    const baseTime = Date.now();
    const agents = [
      makeAgent({
        id: 'agent-revoke-fail',
        status: 'offline',
        lastSeenAt: new Date(baseTime - DEREGISTER_MS - 1000).toISOString(),
        bannedAt: null,
      }),
    ];
    const db = makeDb(agents);
    const revokeOnChain = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('chain unavailable'));

    const monitor = new HeartbeatMonitor({
      offlineThresholdMs: OFFLINE_MS,
      deregisterThresholdMs: DEREGISTER_MS,
      now: () => baseTime,
      agentDb: db,
      revokeOnChain,
    });

    // Should not throw even though revokeOnChain rejects
    await expect(monitor.check()).resolves.toBeUndefined();
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-revoke-fail', status: 'deregistered' }),
    );
  });

  it('handles multiple agents in a single check pass', async () => {
    const baseTime = Date.now();
    const agents: AgentRecord[] = [
      makeAgent({
        id: 'agent-a',
        status: 'online',
        lastSeenAt: new Date(baseTime - OFFLINE_MS - 1000).toISOString(),
        bannedAt: null,
      }),
      makeAgent({
        id: 'agent-b',
        status: 'offline',
        lastSeenAt: new Date(baseTime - DEREGISTER_MS - 1000).toISOString(),
        bannedAt: null,
      }),
      makeAgent({
        id: 'agent-c',
        status: 'online',
        // Not yet stale — should not change
        lastSeenAt: new Date(baseTime - 1000).toISOString(),
        bannedAt: null,
      }),
    ];
    const db = makeDb(agents);
    const revokeOnChain = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = new HeartbeatMonitor({
      offlineThresholdMs: OFFLINE_MS,
      deregisterThresholdMs: DEREGISTER_MS,
      now: () => baseTime,
      agentDb: db,
      revokeOnChain,
    });

    await monitor.check();

    // agent-a goes offline
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-a', status: 'offline' }),
    );
    // agent-b gets deregistered + revocation
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-b', status: 'deregistered' }),
    );
    expect(revokeOnChain).toHaveBeenCalledWith('agent-b');
    expect(revokeOnChain).toHaveBeenCalledTimes(1);
    // agent-c is untouched
    expect(db.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-c' }),
    );
  });
});
