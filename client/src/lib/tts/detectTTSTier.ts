export type TTSTier = 'browser' | 'server';

let cached: TTSTier | null = null;

export function detectTTSTier(): Promise<TTSTier> {
  if (cached) return Promise.resolve(cached);
  return resolveServerPreference().then((pref) => {
    cached = pref;
    return pref;
  });
}

async function resolveServerPreference(): Promise<TTSTier> {
  // Ask the server whether it has a premium TTS provider configured.
  // If preferServer is true (e.g. ElevenLabs is set), skip browser voices entirely.
  try {
    const res = await fetch('/api/tts/available');
    if (res.ok) {
      const data = (await res.json()) as { available: boolean; preferServer?: boolean };
      if (data.available && data.preferServer) return 'server';
    }
  } catch {
    // Server unreachable — fall through to browser detection
  }

  return detectBrowserTier();
}

function detectBrowserTier(): Promise<TTSTier> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve('server');
  }

  return new Promise<TTSTier>((resolve) => {
    const synth = window.speechSynthesis;

    const finish = (tier: TTSTier) => resolve(tier);

    if (synth.getVoices().length > 0) {
      finish('browser');
      return;
    }

    const timeout = setTimeout(() => finish('server'), 500);

    synth.addEventListener(
      'voiceschanged',
      () => {
        clearTimeout(timeout);
        finish(synth.getVoices().length > 0 ? 'browser' : 'server');
      },
      { once: true },
    );
  });
}
