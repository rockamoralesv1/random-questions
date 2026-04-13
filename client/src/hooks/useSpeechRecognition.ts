import { useCallback, useEffect, useRef, useState } from 'react';
import { detectSTTTier, type STTTier } from '../lib/stt/detectSTTTier';
import { STT_LOCALE, type Lang } from '../i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

export type STTState = 'idle' | 'listening' | 'processing' | 'result' | 'error';

export interface UseSpeechRecognitionReturn {
  state: STTState;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  tier: STTTier;
  startListening: () => Promise<void>;
  stopListening: () => void;
  reset: () => void;
}

// Max number of automatic restarts before giving up and surfacing an error
const MAX_RESTARTS = 5;
// Delay before restarting after an unexpected end (ms)
const RESTART_DELAY_MS = 300;

export function useSpeechRecognition(lang: Lang = 'en'): UseSpeechRecognitionReturn {
  const [state, setState] = useState<STTState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tier = detectSTTTier();

  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const hasFinalRef = useRef(false);

  // shouldListenRef: true while the user wants to be recording.
  // When false, onend resolves the promise instead of restarting.
  const shouldListenRef = useRef(false);
  const restartCountRef = useRef(0);

  useEffect(() => {
    return () => { cleanup(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startBrowser = useCallback(
    (): Promise<void> =>
      new Promise((resolve, reject) => {
        shouldListenRef.current = true;
        restartCountRef.current = 0;
        hasFinalRef.current = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;

        const startSession = (isRestart = false) => {
          const recognition: AnySpeechRecognition = new SR();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = STT_LOCALE[lang];
          recognition.maxAlternatives = 1;
          recognitionRef.current = recognition;

          recognition.onstart = () => {
            setState('listening');
            setError(null);
            // Only clear transcripts on the very first start, not on auto-restarts
            if (!isRestart) {
              setInterimTranscript('');
              setFinalTranscript('');
            }
          };

          recognition.onresult = (event: AnySpeechRecognition) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const r = event.results[i];
              if (r.isFinal) final += r[0].transcript;
              else interim += r[0].transcript;
            }
            setInterimTranscript(interim);
            if (final) {
              hasFinalRef.current = true;
              setFinalTranscript((prev) => prev + final);
            }
          };

          recognition.onend = () => {
            recognitionRef.current = null;
            setInterimTranscript('');

            if (!shouldListenRef.current) {
              // User clicked Stop — finish normally
              if (!hasFinalRef.current) setFinalTranscript('');
              setState('result');
              resolve();
              return;
            }

            // Unexpected end (macOS Chrome silently drops the session).
            // Auto-restart up to MAX_RESTARTS times.
            if (restartCountRef.current < MAX_RESTARTS) {
              restartCountRef.current += 1;
              console.warn(
                `[stt] Session ended unexpectedly, restarting (${restartCountRef.current}/${MAX_RESTARTS})`,
              );
              setTimeout(() => {
                if (shouldListenRef.current) startSession(true);
              }, RESTART_DELAY_MS);
            } else {
              // Exhausted retries — surface an error
              shouldListenRef.current = false;
              setState('error');
              setError('Microphone session dropped. Please try again.');
              resolve();
            }
          };

          recognition.onerror = (event: AnySpeechRecognition) => {
            recognitionRef.current = null;

            switch (event.error) {
              case 'not-allowed':
              case 'service-not-allowed':
                shouldListenRef.current = false;
                setState('error');
                setError('Microphone permission denied');
                reject(new Error('Microphone permission denied'));
                break;

              case 'aborted':
                // Triggered by our own stop() call — onend will handle it
                break;

              case 'no-speech':
                // Silence timeout — restart if user still wants to record
                if (shouldListenRef.current && restartCountRef.current < MAX_RESTARTS) {
                  restartCountRef.current += 1;
                  setTimeout(() => {
                    if (shouldListenRef.current) startSession(true);
                  }, RESTART_DELAY_MS);
                } else {
                  setFinalTranscript('');
                  setState('result');
                  resolve();
                }
                break;

              case 'network':
                // Network blip — restart if possible
                if (shouldListenRef.current && restartCountRef.current < MAX_RESTARTS) {
                  restartCountRef.current += 1;
                  setTimeout(() => {
                    if (shouldListenRef.current) startSession(true);
                  }, 1000); // longer delay for network issues
                } else {
                  shouldListenRef.current = false;
                  setState('error');
                  setError('Network error — speech recognition unavailable');
                  resolve();
                }
                break;

              default:
                shouldListenRef.current = false;
                setState('error');
                setError(`Speech recognition error: ${event.error}`);
                reject(new Error(event.error));
            }
          };

          recognition.start();
        };

        startSession(false);
      }),
    [lang],
  );

  const startServer = useCallback((): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        const msg =
          (err as DOMException).name === 'NotAllowedError'
            ? 'Microphone permission denied'
            : `Microphone error: ${(err as Error).message}`;
        setState('error');
        setError(msg);
        reject(new Error(msg));
        return;
      }

      streamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstart = () => {
        setState('listening');
        setInterimTranscript('');
        setFinalTranscript('');
        setError(null);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];

        if (!chunks.length || chunks.every((c) => c.size === 0)) {
          setState('result');
          setFinalTranscript('');
          resolve();
          return;
        }

        setState('processing');

        const blob = new Blob(chunks, { type: recorder.mimeType });
        const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const formData = new FormData();
        formData.append('audio', blob, `recording.${ext}`);

        try {
          const response = await fetch('/api/stt', { method: 'POST', body: formData });
          if (!response.ok) throw new Error(`STT server error: ${response.status}`);
          const data = (await response.json()) as { transcript: string };
          setFinalTranscript(data.transcript);
          setState('result');
          resolve();
        } catch (err) {
          const msg = (err as Error).message;
          setState('error');
          setError(msg);
          reject(new Error(msg));
        }
      };

      recorder.start(250);
    });
  }, []);

  const startListening = useCallback(async () => {
    if (state === 'listening' || state === 'processing') return;
    cleanup();

    if (tier === 'browser') {
      try {
        await startBrowser();
      } catch {
        await startServer();
      }
    } else {
      await startServer();
    }
  }, [state, tier, cleanup, startBrowser, startServer]);

  const stopListening = useCallback(() => {
    if (tier === 'browser') {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
    } else if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, [tier]);

  const reset = useCallback(() => {
    cleanup();
    setState('idle');
    setInterimTranscript('');
    setFinalTranscript('');
    setError(null);
    hasFinalRef.current = false;
    restartCountRef.current = 0;
  }, [cleanup]);

  return { state, interimTranscript, finalTranscript, error, tier, startListening, stopListening, reset };
}
