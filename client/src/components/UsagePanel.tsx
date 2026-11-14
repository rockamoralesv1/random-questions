import { useEffect, useState } from 'react';
import { getUsage, type UsageReport } from '../api/authApi';
import { formatRelativeTime } from '../lib/storage';

const PERIODS = [7, 30, 90] as const;

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '—');

/** Admins: who uses the app and how much. */
export function UsagePanel({ language }: { language: 'es' | 'en' }) {
  const es = language === 'es';
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getUsage(days)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!report) return <p className="text-sm text-gray-400">{es ? 'Cargando…' : 'Loading…'}</p>;

  const t = report.totals;
  const maxAnswers = Math.max(1, ...report.daily.map((d) => d.answers));
  const shown = hover !== null ? report.daily[hover] : null;
  const fmtDay = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(es ? 'es' : 'en', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const tiles: { label: string; value: string | number; sub?: string }[] = [
    { label: es ? 'Activos hoy' : 'Active today', value: t.activeToday, sub: `${t.active7d} ${es ? 'en 7 días' : 'in 7 days'} · ${t.active30d} ${es ? 'en 30' : 'in 30'}` },
    { label: es ? 'Cuentas' : 'Accounts', value: t.users, sub: `${t.pendingInvitations} ${es ? 'invitaciones pendientes' : 'pending invitations'}` },
    { label: es ? 'Quizzes' : 'Quizzes', value: t.quizzes, sub: es ? `últimos ${days} días` : `last ${days} days` },
    { label: es ? 'Respuestas' : 'Answers', value: t.answers, sub: `${pct(t.passed, t.answers)} ${es ? 'correctas' : 'correct'}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          {es ? 'Hora local' : 'Local time'}: {report.timeZone}
        </p>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`px-2.5 py-1 rounded-md ${days === p ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {p} {es ? 'días' : 'days'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{tile.label}</p>
            <p className="text-2xl font-bold text-gray-800 tabular-nums">{tile.value}</p>
            {tile.sub && <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{tile.sub}</p>}
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-baseline justify-between mb-3 gap-2">
          <h3 className="text-sm font-semibold text-gray-700">{es ? 'Respuestas por día' : 'Answers per day'}</h3>
          <p className="text-xs text-gray-500 tabular-nums text-right">
            {shown
              ? `${fmtDay(shown.day)}: ${shown.answers} ${es ? 'resp.' : 'answers'} · ${shown.activeUsers} ${es ? 'personas' : 'people'} · ${shown.quizzes} quiz`
              : `${es ? 'Total' : 'Total'}: ${t.answers}`}
          </p>
        </div>
        <div className="flex items-end gap-[2px] h-28" onMouseLeave={() => setHover(null)}>
          {report.daily.map((d, i) => (
            <div
              key={d.day}
              className="flex-1 h-full flex flex-col justify-end cursor-default"
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
              title={`${fmtDay(d.day)}: ${d.answers}`}
            >
              <div
                className={`w-full rounded-t-sm ${hover === i ? 'bg-blue-600' : 'bg-blue-400'}`}
                style={{ height: d.answers ? `${Math.max(3, (d.answers / maxAnswers) * 100)}%` : '1px', opacity: d.answers ? 1 : 0.3 }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          <span>{fmtDay(report.daily[0].day)}</span>
          <span>{es ? 'hoy' : 'today'}</span>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {es ? 'Por persona' : 'By person'}
        </h3>
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 text-left">
                <th className="font-medium px-4 py-2">{es ? 'Correo' : 'Email'}</th>
                <th className="font-medium px-2 py-2 text-right">Quizzes</th>
                <th className="font-medium px-2 py-2 text-right">{es ? 'Resp.' : 'Answers'}</th>
                <th className="font-medium px-2 py-2 text-right">{es ? 'Correctas' : 'Correct'}</th>
                <th className="font-medium px-2 py-2 text-right">{es ? 'Bancos' : 'Banks'}</th>
                <th className="font-medium px-4 py-2 text-right whitespace-nowrap">{es ? 'Último acceso' : 'Last login'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.users.map((u) => (
                <tr key={u.id} className={u.answers === 0 && u.quizzes === 0 ? 'text-gray-400' : 'text-gray-800'}>
                  <td className="px-4 py-2 max-w-[14rem] truncate">
                    {u.email}
                    {u.role === 'admin' && <span className="ml-1.5 text-xs text-indigo-600">admin</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{u.quizzes}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{u.answers}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(u.passed, u.answers)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{u.banks}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400 whitespace-nowrap">
                    {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt, language) : es ? 'nunca' : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {es ? 'Preguntas más falladas' : 'Most failed questions'}
        </h3>
        {report.topFailed.length === 0 ? (
          <p className="text-sm text-gray-400">{es ? 'Ninguna todavía.' : 'None yet.'}</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {report.topFailed.map((q) => (
              <div key={q.question} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate text-gray-800" title={q.question}>{q.question}</span>
                <span className="text-xs text-red-500 tabular-nums whitespace-nowrap">
                  {q.fails}/{q.attempts} {es ? 'fallos' : 'fails'}
                </span>
                <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap w-20 text-right">
                  {q.users} {es ? (q.users === 1 ? 'persona' : 'personas') : q.users === 1 ? 'person' : 'people'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
