/**
 * Minimal Prometheus metrics (text exposition format 0.0.4), kept in this
 * process. Counters reset when the dyno restarts; Prometheus' rate() and
 * increase() handle that.
 */

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

interface Metric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  render(): string[];
}

const registry: Metric[] = [];

export class Counter {
  private values = new Map<string, number>();
  constructor(readonly name: string, readonly help: string) {
    registry.push({ name, help, type: 'counter', render: () => this.lines() });
  }
  inc(labels: Labels = {}, by = 1): void {
    const k = labelKey(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  private lines(): string[] {
    return [...this.values].map(([k, v]) => `${this.name}${k} ${v}`);
  }
}

export class Histogram {
  private series = new Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>();
  constructor(readonly name: string, readonly help: string, readonly buckets: number[]) {
    registry.push({ name, help, type: 'histogram', render: () => this.lines() });
  }
  observe(labels: Labels, value: number): void {
    const k = labelKey(labels);
    const s = this.series.get(k) ?? { labels, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
    this.buckets.forEach((b, i) => {
      if (value <= b) s.counts[i] += 1;
    });
    s.sum += value;
    s.count += 1;
    this.series.set(k, s);
  }
  private lines(): string[] {
    const out: string[] = [];
    for (const s of this.series.values()) {
      this.buckets.forEach((b, i) => out.push(`${this.name}_bucket${labelKey({ ...s.labels, le: String(b) })} ${s.counts[i]}`));
      out.push(`${this.name}_bucket${labelKey({ ...s.labels, le: '+Inf' })} ${s.count}`);
      out.push(`${this.name}_sum${labelKey(s.labels)} ${s.sum}`);
      out.push(`${this.name}_count${labelKey(s.labels)} ${s.count}`);
    }
    return out;
  }
}

/** Gauges are read when scraped (sync or async). */
export type GaugeSample = { labels?: Labels; value: number };

export function renderMetrics(gauges: { name: string; help: string; samples: GaugeSample[] }[]): string {
  const out: string[] = [];
  for (const m of registry) {
    out.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`, ...m.render());
  }
  for (const g of gauges) {
    out.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`);
    for (const s of g.samples) out.push(`${g.name}${labelKey(s.labels ?? {})} ${s.value}`);
  }
  return out.join('\n') + '\n';
}

// ── Application metrics ─────────────────────────────────────────────────────

export const httpRequests = new Counter('rq_http_requests_total', 'HTTP requests by method, route and status.');
export const httpDuration = new Histogram(
  'rq_http_request_duration_seconds',
  'HTTP response time by method and route.',
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);
export const loginAttempts = new Counter('rq_login_attempts_total', 'Login attempts by result (success, failure).');
export const quizzesStarted = new Counter('rq_quizzes_started_total', 'Quizzes started.');
export const answersRecorded = new Counter('rq_answers_total', 'Answers graded, by result (passed, failed).');
