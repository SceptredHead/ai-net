/**
 * Prometheus metric definitions using prom-client.
 *
 * All metrics are registered on a shared Registry so the /metrics endpoint
 * can serve them alongside the existing in-memory metrics.
 */
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

export const promRegistry = new Registry();

// Enable default Node.js metrics (memory, event loop, GC)
collectDefaultMetrics({ register: promRegistry });

/** Counter: HTTP requests by method, route pattern, and status code. */
export const apiRequestsTotal = new Counter({
  name: 'api_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [promRegistry],
});

/** Histogram: HTTP response duration in ms by route pattern. */
export const apiResponseDurationMs = new Histogram({
  name: 'api_response_duration_ms',
  help: 'HTTP response duration in milliseconds',
  labelNames: ['route'] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [promRegistry],
});

/** Counter: task executions by status (completed | failed | timeout). */
export const taskExecutionsTotal = new Counter({
  name: 'task_executions_total',
  help: 'Total task executions by status',
  labelNames: ['status'] as const,
  registers: [promRegistry],
});

/** Histogram: DAG execution duration in ms. */
export const dagExecutionDurationMs = new Histogram({
  name: 'dag_execution_duration_ms',
  help: 'DAG execution duration in milliseconds',
  labelNames: [] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [promRegistry],
});

/** Counter: Venice AI calls by outcome (success | error | timeout | circuit_open). */
export const veniceCallsTotal = new Counter({
  name: 'venice_calls_total',
  help: 'Total Venice AI calls by outcome',
  labelNames: ['outcome'] as const,
  registers: [promRegistry],
});

/** Gauge: active WebSocket connections. */
export const activeWebsocketConnections = new Gauge({
  name: 'active_websocket_connections',
  help: 'Current number of active WebSocket connections',
  registers: [promRegistry],
});
