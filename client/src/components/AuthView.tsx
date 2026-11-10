import { useEffect, useState } from 'react';
import { login, register } from '../api/authApi';
import { getServerConfig } from '../api/quizApi';
import { useAuthStore } from '../store/authStore';
import { useQuizStore } from '../store/quizStore';

/** Reads ?invite=<token> once, then removes it from the address bar. */
function takeInviteToken(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('invite');
  if (token) {
    url.searchParams.delete('invite');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return token;
}

export function AuthView() {
  const language = useQuizStore((s) => s.language);
  const setUser = useAuthStore((s) => s.setUser);
  const es = language === 'es';

  const [inviteToken] = useState(takeInviteToken);
  const [mode, setMode] = useState<'login' | 'register'>(inviteToken ? 'register' : 'login');
  const [signupsEnabled, setSignupsEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getServerConfig().then((c) => setSignupsEnabled(Boolean(c.signupsEnabled)));
  }, []);

  const canRegister = Boolean(inviteToken) || signupsEnabled;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password !== confirm) {
      setError(es ? 'Las contraseñas no coinciden.' : 'Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      setUser(
        mode === 'login'
          ? await login(email, password)
          : await register(email, password, inviteToken ?? undefined),
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const input =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400';

  return (
    <div className="flex-1 flex items-start justify-center p-6 pt-12">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">
          {mode === 'login'
            ? es ? 'Iniciar sesión' : 'Log in'
            : inviteToken
              ? es ? 'Acepta tu invitación' : 'Accept your invitation'
              : es ? 'Crear cuenta' : 'Create account'}
        </h2>

        {mode === 'register' && inviteToken && (
          <p className="text-xs text-gray-500">
            {es
              ? 'Escribe el correo al que te llegó la invitación y elige una contraseña. El enlace vence en 1 hora y solo funciona una vez.'
              : 'Enter the email the invitation was sent to and choose a password. The link expires in 1 hour and works once.'}
          </p>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">{es ? 'Correo' : 'Email'}</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">{es ? 'Contraseña' : 'Password'}</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>

        {mode === 'register' && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">{es ? 'Repite la contraseña' : 'Repeat password'}</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '…' : mode === 'login' ? (es ? 'Entrar' : 'Log in') : es ? 'Crear cuenta' : 'Create account'}
        </button>

        {canRegister && (
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            className="w-full text-xs text-blue-600 hover:underline"
          >
            {mode === 'login'
              ? es ? 'Crear una cuenta' : 'Create an account'
              : es ? 'Ya tengo cuenta' : 'I already have an account'}
          </button>
        )}
        {!canRegister && (
          <p className="text-xs text-gray-400 text-center">
            {es ? 'El acceso es solo por invitación.' : 'Access is by invitation only.'}
          </p>
        )}
      </form>
    </div>
  );
}
