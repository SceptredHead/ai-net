import type { Request, Response, NextFunction } from 'express';
import { apiRequestsTotal, apiResponseDurationMs } from '../../utils/metrics';

/**
 * Normalize a URL path to a route pattern to avoid high-cardinality labels.
 * e.g. /api/tasks/abc-123 -> /api/tasks/:id
 * e.g. /api/agents/my-agent/heartbeat -> /api/agents/:id/heartbeat
 */
export function normalizeRoute(path: string): string {
  return path
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    // Replace hex strings 24+ chars (MongoDB-style IDs)
    .replace(/[0-9a-f]{24,}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    // Replace common agent/task IDs (non-numeric segments after known prefixes)
    .replace(/(\/(?:agents|tasks|users|payments)\/)[^/]+/g, '$1:id')
    // Strip query string
    .replace(/\?.*$/, '');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const route = req.route?.path
      ? `${req.baseUrl ?? ''}${req.route.path}`
      : normalizeRoute(req.path);
    const method = req.method.toUpperCase();
    const statusCode = String(res.statusCode);

    apiRequestsTotal.inc({ method, route, status_code: statusCode });
    apiResponseDurationMs.observe({ route }, durationMs);
  });

  next();
}
