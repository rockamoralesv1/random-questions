import { useCallback, useEffect, useRef, useState } from 'react';
import { detectTTSTier, type TTSTier } from '../lib/tts/detectTTSTier';
import type { Lang } from '../i18n';

export type TTSStatus = 'idle' | 'loading' | 'speaking' | 'error';

export interface UseTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  status: TTSStatus;
  tier: TTSTier | null;
  error: string | null;
}

const CHROME_RESUME_INTERVAL_MS = 5000;

// BCP-47 prefix used to find a matching system voice
const VOICE_LANG_PREFIX: Record<Lang, string> = {
  en: 'en',
  es: 'es',
};

export function useTTS(lang: Lang = 'en'): UseTTSReturn {
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [tier, setTier] = useState<TTSTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    detectTTSTier().then(setTier);
    return () => { stopAll(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAll = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (resumeTimerRef.current !== null) {
      clearInterval(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const speakBrowser = useCallback(
    (text: string): Promise<void> =>
      new Promise((resolve, reject) => {
        stopAll();
        setStatus('speaking');
        setError(null);

        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text);

        const voices = synth.getVoices();
        const prefix = VOICE_LANG_PREFIX[lang];
        // Prefer a local (not network) voice for lower latency, fall back to any match
        const voice =
          voices.find((v) => v.lang.startsWith(prefix) && v.localService) ??
          voices.find((v) => v.lang.startsWith(prefix));
        if (voice) utterance.voice = voice;
        utterance.lang = lang === 'es' ? 'es-MX' : 'en-US';

        utterance.onend = () => {
          if (resumeTimerRef.current !== null) {
            clearInterval(resumeTimerRef.current);
            resumeTimerRef.current = null;
          }
          setStatus('idle');
          resolve();
        };

        utterance.onerror = (evt) => {
          if (resumeTimerRef.current !== null) {
            clearInterval(resumeTimerRef.current);
            resumeTimerRef.current = null;
          }
          if (evt.error === 'interrupted' || evt.error === 'canceled') {
            setStatus('idle');
            resolve();
            return;
          }
          const msg = `SpeechSynthesis error: ${evt.error}`;
          setStatus('error');
          setError(msg);
          reject(new Error(msg));
        };

        synth.speak(utterance);

        // Chrome tab-backgrounding workaround
        resumeTimerRef.current = setInterval(() => {
          if (synth.speaking) {
            synth.pause();
            synth.resume();
          } else {
            clearInterval(resumeTimerRef.current!);
            resumeTimerRef.current = null;
          }
        }, CHROME_RESUME_INTERVAL_MS);
      }),
    [stopAll],
  );

  const speakServer = useCallback(
    async (text: string): Promise<void> => {
      stopAll();
      setStatus('loading');
      setError(null);

      let response: Response;
      try {
        response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, language: lang }),
        });
      } catch (err) {
        const msg = `TTS network error: ${(err as Error).message}`;
        setStatus('error');
        setError(msg);
        throw new Error(msg);
      }

      if (!response.ok) {
        const msg = `TTS server error: ${response.status}`;
        setStatus('error');
        setError(msg);
        throw new Error(msg);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      return new Promise<void>((resolve, reject) => {
        const audio = new Audio(objectUrl);
        audioRef.current = audio;
        setStatus('speaking');

        audio.onended = () => {
          URL.revokeObjectURL(objectUrl);
          setStatus('idle');
          resolve();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          const msg = 'Audio playback error';
          setStatus('error');
          setError(msg);
          reject(new Error(msg));
        };

        audio.play().catch((err: Error) => {
          URL.revokeObjectURL(objectUrl);
          const msg = `Playback blocked: ${err.message}`;
          setStatus('error');
          setError(msg);
          reject(new Error(msg));
        });
      });
    },
    [stopAll],
  );

  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;
      const resolvedTier = tier ?? (await detectTTSTier());

      if (resolvedTier === 'browser') {
        try {
          await speakBrowser(text);
        } catch {
          // Browser tier failed — try server
          await speakServer(text);
        }
      } else {
        try {
          await speakServer(text);
        } catch (err) {
          // Server tier failed — fall back to browser so the user can still hear something
          console.warn('[tts] Server TTS failed, falling back to browser:', (err as Error).message);
          try {
            await speakBrowser(text);
          } catch {
            // Both tiers failed — leave the error state set by speakServer
          }
        }
      }
    },
    [tier, speakBrowser, speakServer],
  );

  const stop = useCallback(() => {
    stopAll();
    setStatus('idle');
    setError(null);
  }, [stopAll]);

  return { speak, stop, status, tier, error };
}
