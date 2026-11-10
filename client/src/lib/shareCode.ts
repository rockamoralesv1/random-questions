// A bank's share code is the first 12 hex chars of its PDF hash (48 bits).
// Must match SHARE_CODE_LENGTH in server/src/routes/documents.ts.
const SHARE_CODE_LENGTH = 12;

export function shareCodeFor(hash: string): string {
  return hash.slice(0, SHARE_CODE_LENGTH);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
