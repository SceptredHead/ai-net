/**
 * Tests for the prom-client metric registry and metricsMiddleware route normalizer.
 */
import {
  promRegistry,
  apiRequestsTotal,
  apiResponseDurationMs,
  taskExecutionsTotal,
  veniceCallsTotal,
  activeWebsocketConnections,
} from './metrics';
import { normalizeRoute } from '../api/middleware/metricsMiddleware';

describe('Prometheus metrics registry', () => {
  it('registers api_requests_total counter', async () => {
    apiRequestsTotal.inc({ method: 'GET', route: '/api/agents', status_code: '200' });
    const output = await promRegistry.metrics();
    expect(output).toContain('api_requests_total');
  });

  it('registers api_response_duration_ms histogram', async () => {
    apiResponseDurationMs.observe({ route: '/api/tasks' }, 42);
    const output = await promRegistry.metrics();
    expect(output).toContain('api_response_duration_ms');
  });

  it('registers task_executions_total counter', async () => {
    taskExecutionsTotal.inc({ status: 'completed' });
    const output = await promRegistry.metrics();
    expect(output).toContain('task_executions_total');
  });

  it('registers venice_calls_total counter', async () => {
    veniceCallsTotal.inc({ outcome: 'success' });
    const output = await promRegistry.metrics();
    expect(output).toContain('venice_calls_total');
  });

  it('registers active_websocket_connections gauge', async () => {
    activeWebsocketConnections.set(5);
    const output = await promRegistry.metrics();
    expect(output).toContain('active_websocket_connections');
  });

  it('includes default Node.js metrics', async () => {
    const output = await promRegistry.metrics();
    expect(output).toContain('process_');
  });
});

describe('normalizeRoute', () => {
  it('replaces UUIDs', () => {
    // The UUID regex fires first (producing :uuid), then the tasks-prefix
    // pass normalises it to :id — both are cardinality-safe replacements.
    const result = normalizeRoute('/api/tasks/550e8400-e29b-41d4-a716-446655440000');
    expect(result).not.toBe('/api/tasks/550e8400-e29b-41d4-a716-446655440000');
    expect(result).toMatch(/:\w+/); // contains some normalised placeholder
  });

  it('replaces UUIDs outside known prefixes', () => {
    // On a path that does not hit the prefix pass, :uuid is preserved.
    expect(
      normalizeRoute('/api/logs/550e8400-e29b-41d4-a716-446655440000'),
    ).toContain(':uuid');
  });

  it('replaces numeric IDs', () => {
    expect(normalizeRoute('/api/agents/42/health')).toBe('/api/agents/:id/health');
  });

  it('replaces agent IDs', () => {
    expect(normalizeRoute('/api/agents/my-special-agent')).toBe('/api/agents/:id');
  });
});
