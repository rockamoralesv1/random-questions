export type STTTier = 'browser' | 'server';

export function detectSTTTier(): STTTier {
  if (typeof window === 'undefined') return 'server';
  // Firefox ships SpeechRecognition but it requires browser-controlled credentials
  if (navigator.userAgent.includes('Firefox')) return 'server';
  const SR =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return SR ? 'browser' : 'server';
}
