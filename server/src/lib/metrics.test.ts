import { describe, expect, it } from 'vitest';
import { Counter, Histogram, renderMetrics } from './metrics';

describe('metrics', () => {
  it('renders counters, histograms and gauges in Prometheus text format', () => {
    const c = new Counter('t_requests_total', 'Requests.');
    c.inc({ route: '/a', status: '200' });
    c.inc({ status: '200', route: '/a' }); // same series regardless of label order
    c.inc({ route: 'say "hi"\n' });
    const h = new Histogram('t_seconds', 'Time.', [0.1, 1]);
    h.observe({ route: '/a' }, 0.05);
    h.observe({ route: '/a' }, 0.5);
    const out = renderMetrics([{ name: 't_users', help: 'Users.', samples: [{ labels: { role: 'admin' }, value: 2 }] }]);
    expect(out).toContain('# TYPE t_requests_total counter');
    expect(out).toContain('t_requests_total{route="/a",status="200"} 2');
    expect(out).toContain('t_requests_total{route="say \\"hi\\"\\n"} 1');
    expect(out).toContain('t_seconds_bucket{le="0.1",route="/a"} 1');
    expect(out).toContain('t_seconds_bucket{le="1",route="/a"} 2');
    expect(out).toContain('t_seconds_bucket{le="+Inf",route="/a"} 2');
    expect(out).toContain('t_seconds_count{route="/a"} 2');
    expect(out).toContain('# TYPE t_users gauge\nt_users{role="admin"} 2');
  });
});
