import { useCallback, useEffect, useState } from 'react';
import {
  inviteUser,
  listInvitations,
  listUsers,
  revokeInvitation,
  type AdminUser,
  type Invitation,
} from '../api/authApi';
import { useQuizStore } from '../store/quizStore';
import { formatRelativeTime } from '../lib/storage';
import { UsagePanel } from './UsagePanel';

/** Admins: invite people by email and see who has an account. */
export function AdminView() {
  const { language, setView } = useQuizStore();
  const es = language === 'es';
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<'users' | 'usage'>('users');

  const refresh = useCallback(async () => {
    try {
      const [u, i] = await Promise.all([listUsers(), listInvitations()]);
      setUsers(u);
      setInvitations(i);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await inviteUser(email, asAdmin ? 'admin' : 'user');
      setMsg({
        ok: true,
        text: es
          ? `Invitación enviada a ${email}. El enlace vence en 1 hora.`
          : `Invitation sent to ${email}. The link expires in 1 hour.`,
      });
      setEmail('');
      setAsAdmin(false);
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await revokeInvitation(id).catch(() => {});
    await refresh();
  };

  const statusLabel = (s: Invitation['status']) =>
    es ? { pending: 'pendiente', used: 'aceptada', expired: 'vencida' }[s] : s;

  return (
    <div className="flex-1 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">{es ? 'Administración' : 'Admin'}</h2>
          <button onClick={() => setView('upload')} className="text-sm text-gray-500 hover:text-blue-600">
            ← {es ? 'Volver' : 'Back'}
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {(['users', 'usage'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'users' ? (es ? 'Usuarios' : 'Users') : es ? 'Uso' : 'Usage'}
            </button>
          ))}
        </div>

        {tab === 'usage' ? (
          <UsagePanel language={language} />
        ) : (
        <>

        <form onSubmit={invite} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">{es ? 'Invitar por correo' : 'Invite by email'}</p>
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={es ? 'correo@ejemplo.com' : 'email@example.com'}
              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
            >
              {busy ? '…' : es ? 'Enviar' : 'Send'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} className="accent-blue-600" />
            {es ? 'Administrador (puede invitar a otros)' : 'Admin (can invite others)'}
          </label>
          <p className="text-xs text-gray-400">
            {es
              ? 'Se envía un enlace de un solo uso que vence en 1 hora. Solo funciona escribiendo este mismo correo.'
              : 'A single-use link that expires in 1 hour is emailed. It only works together with this email.'}
          </p>
          {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
        </form>

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {es ? 'Invitaciones' : 'Invitations'}
          </h3>
          {invitations.length === 0 ? (
            <p className="text-sm text-gray-400">{es ? 'Ninguna todavía.' : 'None yet.'}</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {invitations.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-gray-800">{i.email}</span>
                  {i.role === 'admin' && <span className="text-xs text-indigo-600">admin</span>}
                  <span
                    className={`text-xs ${
                      i.status === 'pending' ? 'text-amber-600' : i.status === 'used' ? 'text-green-600' : 'text-gray-400'
                    }`}
                  >
                    {statusLabel(i.status)}
                  </span>
                  <span className="text-xs text-gray-400 w-20 text-right">{formatRelativeTime(i.createdAt, language)}</span>
                  {i.status === 'pending' ? (
                    <button onClick={() => void revoke(i.id)} className="text-xs text-red-500 hover:underline">
                      {es ? 'Revocar' : 'Revoke'}
                    </button>
                  ) : (
                    <span className="w-12" />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {es ? 'Cuentas' : 'Accounts'} ({users.length})
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate text-gray-800">{u.email}</span>
                {u.role === 'admin' && <span className="text-xs text-indigo-600">admin</span>}
                <span className="text-xs text-gray-400">{formatRelativeTime(u.createdAt, language)}</span>
              </div>
            ))}
          </div>
        </section>
        </>
        )}
      </div>
    </div>
  );
}
