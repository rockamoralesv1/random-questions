import type { RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { performance } from 'perf_hooks';
import { httpDuration, httpRequests, renderMetrics } from '../lib/metrics';
import { getMetricsSnapshot } from '../services/usageService';
import { extractionCounts } from '../services/extractionService';

/**
 * Counts every response by method, route and status. The route is the Express
 * route pattern (e.g. /api/documents/:hash), never the raw URL, so bots
 * probing random paths can't create unlimited label values.
 */
export const trackRequests: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const routePath = req.route?.path;
    const route = routePath
      ? `${req.baseUrl}${Array.isArray(routePath) ? routePath[0] : routePath}`.replace(/(.)\/$/, '$1')
      : req.originalUrl.startsWith('/assets/')
        ? '/assets'
        : 'unmatched';
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
    httpDuration.observe({ method: req.method, route }, seconds);
  });
  next();
};

// Share of time the event loop was busy since the previous scrape (0–1).
let lastElu = performance.eventLoopUtilization();

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Accepts `Authorization: Bearer <token>` or Basic auth with the token as password. */
function hasToken(header: string | undefined, token: string): boolean {
  if (!header) return false;
  let given = '';
  if (header.startsWith('Bearer ')) given = header.slice(7).trim();
  else if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString();
    given = decoded.slice(decoded.indexOf(':') + 1);
  }
  return given.length > 0 && timingSafeEqual(sha256(given), sha256(token));
}

/**
 * GET /metrics — Prometheus scrape endpoint. Exists only when METRICS_TOKEN is
 * set (otherwise 404, like any unknown path), and requires that token.
 */
export const metricsEndpoint: RequestHandler = async (req, res, next) => {
  const token = process.env.METRICS_TOKEN;
  if (!token) return next();
  if (!hasToken(req.header('Authorization'), token)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
    res.status(401).type('text').send('Unauthorized');
    return;
  }
  try {
    const mem = process.memoryUsage();
    const now = performance.eventLoopUtilization();
    const elu = Math.round(performance.eventLoopUtilization(now, lastElu).utilization * 1000) / 1000;
    lastElu = now;
    const ex = extractionCounts();
    const m = await getMetricsSnapshot();
    res.type('text/plain; version=0.0.4; charset=utf-8');
    res.send(
      renderMetrics([
        { name: 'rq_process_resident_memory_bytes', help: 'Resident memory.', samples: [{ value: mem.rss }] },
        { name: 'rq_process_heap_used_bytes', help: 'V8 heap in use.', samples: [{ value: mem.heapUsed }] },
        { name: 'rq_process_uptime_seconds', help: 'Seconds since this process started.', samples: [{ value: Math.round(process.uptime()) }] },
        { name: 'rq_event_loop_utilization', help: 'Share of time the event loop was busy since the previous scrape (0-1).', samples: [{ value: elu }] },
        {
          name: 'rq_extractions',
          help: 'PDF extractions in this process, by state.',
          samples: [
            { labels: { state: 'running' }, value: ex.running },
            { labels: { state: 'queued' }, value: ex.queued },
          ],
        },
        {
          name: 'rq_users',
          help: 'User accounts, by role.',
          samples: [
            { labels: { role: 'admin' }, value: m.users.admin },
            { labels: { role: 'user' }, value: m.users.user },
          ],
        },
        {
          name: 'rq_active_users',
          help: 'Users who started or answered a quiz in the rolling window.',
          samples: [
            { labels: { window: '24h' }, value: m.active['24h'] },
            { labels: { window: '7d' }, value: m.active['7d'] },
            { labels: { window: '30d' }, value: m.active['30d'] },
          ],
        },
        { name: 'rq_documents', help: 'Question banks (PDFs) stored.', samples: [{ value: m.documents }] },
        { name: 'rq_questions', help: 'Questions extracted across all banks.', samples: [{ value: m.questions }] },
        { name: 'rq_invitations_pending', help: 'Unused, unexpired invitations.', samples: [{ value: m.pendingInvitations }] },
      ]),
    );
  } catch (err) {
    next(err);
  }
};
