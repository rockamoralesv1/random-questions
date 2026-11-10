// Anonymous "personal code" that identifies this browser's list of question
// banks on the server. Showing it to the user lets them restore the list on
// another browser/device by pasting it. Treat it like a password.

const STORAGE_KEY = 'quiz_client_id';
// Crockford base32 — no I, L, O, U, so codes are easy to read and type.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PERSONAL_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

function generate(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-'); // 80 bits
}

let cached: string | null = null;

export function getClientId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return (cached = stored);
  } catch {
    // storage unavailable — fall through to an in-memory code for this tab
  }
  cached = generate();
  try {
    localStorage.setItem(STORAGE_KEY, cached);
  } catch {
    // ignore
  }
  return cached;
}

/** Normalizes user input ("abcd efgh…", lowercase, O→0) to a personal code, or null. */
export function normalizePersonalCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== 16) return null;
  const code = raw.match(/.{4}/g)!.join('-');
  return PERSONAL_CODE_RE.test(code) ? code : null;
}

export function setClientId(code: string): void {
  cached = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore
  }
}
