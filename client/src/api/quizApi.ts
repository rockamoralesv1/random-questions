import type {
  EvaluateResponse,
  SessionResponse,
  ResultsResponse,
  QAPair,
} from '../types';

export async function uploadPDF(
  file: File,
): Promise<{ hash: string; pairs: QAPair[] } | { jobId: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Upload failed');
  }
  return res.json();
}

export async function pollUploadJob(
  jobId: string,
  onProgress?: (attempt: number) => void,
): Promise<{ hash: string; pairs: QAPair[] }> {
  const INTERVAL_MS = 2000;
  const MAX_ATTEMPTS = 120; // 4 minutes max

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    onProgress?.(attempt);

    const res = await fetch(`/api/upload/status/${jobId}`);
    if (!res.ok) throw new Error('Job status check failed');

    const data = (await res.json()) as
      | { status: 'processing' }
      | { status: 'done'; hash: string; pairs: QAPair[] }
      | { status: 'error'; message: string };

    if (data.status === 'done') return { hash: data.hash, pairs: data.pairs };
    if (data.status === 'error') throw new Error(data.message);
    // status === 'processing' → keep polling
  }

  throw new Error('Extraction timed out. Please try a smaller PDF.');
}

export async function startQuizSession(
  pairs: QAPair[],
): Promise<{ sessionId: string; currentIndex: number; question: string; totalCount: number }> {
  const res = await fetch('/api/quiz/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairs }),
  });
  if (!res.ok) throw new Error('Failed to start quiz session');
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionResponse> {
  const res = await fetch(`/api/quiz/session/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

export async function submitAnswer(
  sessionId: string,
  questionIndex: number,
  userAnswer: string,
): Promise<EvaluateResponse> {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, questionIndex, userAnswer }),
  });
  if (!res.ok) throw new Error('Evaluation failed');
  return res.json();
}

export async function fetchResults(sessionId: string): Promise<ResultsResponse> {
  const res = await fetch(`/api/results/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch results');
  return res.json();
}

export async function checkTTSAvailable(): Promise<boolean> {
  const res = await fetch('/api/tts/available');
  if (!res.ok) return false;
  const data = await res.json();
  return data.available === true;
}
