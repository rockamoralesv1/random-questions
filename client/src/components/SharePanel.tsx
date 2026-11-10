import { useEffect, useState } from 'react';
import { listShares, shareWith, unshare } from '../api/quizApi';
import type { DocumentMember } from '../types';

/** Owner-only: share a question bank with existing users by email. */
export function SharePanel({ hash, es }: { hash: string; es: boolean }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<DocumentMember[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) void listShares(hash).then(setMembers).catch((e: Error) => setError(e.message));
  }, [open, hash]);

  const share = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMembers(await shareWith(hash, email.trim()));
      setEmail('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    try {
      setMembers(await unshare(hash, userId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-blue-600 hover:underline">
        {es ? 'Compartir' : 'Share'}
      </button>
    );
  }

  const shared = members.filter((m) => m.role === 'shared');
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 space-y-2 text-sm">
      <form onSubmit={share} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder={es ? 'Correo del usuario' : "User's email"}
          className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-1.5 outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
        >
          {busy ? '…' : es ? 'Compartir' : 'Share'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 px-1">
          ×
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">
        {es
          ? 'Solo se puede compartir con usuarios que ya tienen cuenta. Podrán ver y practicar este banco, pero no reprocesarlo ni compartirlo.'
          : 'You can only share with users who already have an account. They can view and practice this bank, but not re-process or share it.'}
      </p>
      {shared.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {shared.map((m) => (
            <li key={m.userId} className="flex items-center justify-between py-1.5">
              <span className="truncate text-gray-700">{m.email}</span>
              <button onClick={() => void remove(m.userId)} className="text-xs text-red-500 hover:underline shrink-0">
                {es ? 'Quitar acceso' : 'Remove access'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
