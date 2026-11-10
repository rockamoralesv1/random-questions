// Before accounts existed, each browser had an anonymous "personal code" that
// owned its question banks, quizzes and stats. On first login/sign-up it is
// sent once so the server can move that data to the account, then forgotten.

const STORAGE_KEY = 'quiz_client_id';

export function getLegacyClientId(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearLegacyClientId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
