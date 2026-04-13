import type {
  EvaluateResponse,
  SessionResponse,
  ResultsResponse,
  QAPair,
} from '../types';

export async function uploadPDF(file: File): Promise<{ hash: string; pairs: QAPair[] }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Upload failed');
  }
  return res.json();
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
