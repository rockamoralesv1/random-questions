import { getClientId } from '../lib/clientId';
import type {
  ActiveQuiz,
  QuestionStat,
  QuizMode,
  ClientDocument,
  DocumentState,
  EvaluateResponse,
  SessionResponse,
  ResultsResponse,
  QAPair,
} from '../types';

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? fallback), { status: res.status });
  }
  return res.json();
}

const withClientId = (init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers ?? {}), 'X-Client-Id': getClientId() },
});

/** Server feature flags (AI_ENABLED). Assumes enabled if the call fails. */
export async function getServerConfig(): Promise<{ aiEnabled: boolean }> {
  try {
    const res = await fetch('/api/config');
    if (res.ok) return res.json();
  } catch {
    // fall through
  }
  return { aiEnabled: true };
}

/** Uploads a PDF; extraction continues on the server — poll getDocument(). */
export async function uploadPDF(file: File): Promise<DocumentState> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', withClientId({ method: 'POST', body: form }));
  return jsonOrThrow(res, 'Upload failed');
}

export async function getDocument(hash: string): Promise<DocumentState> {
  return jsonOrThrow(await fetch(`/api/documents/${hash}`), 'Could not load question bank');
}

export async function retryDocument(hash: string): Promise<DocumentState> {
  const res = await fetch(`/api/documents/${hash}/retry`, withClientId({ method: 'POST' }));
  return jsonOrThrow(res, 'Retry failed');
}

export async function listDocuments(): Promise<ClientDocument[]> {
  return jsonOrThrow(await fetch('/api/documents', withClientId()), 'Could not list documents');
}

export async function removeDocument(hash: string): Promise<void> {
  const res = await fetch(`/api/documents/${hash}`, withClientId({ method: 'DELETE' }));
  if (!res.ok && res.status !== 404) throw new Error('Could not remove document');
}

/** Adds a shared question bank (by share code) to this browser's list. */
export async function importDocument(code: string): Promise<DocumentState> {
  const res = await fetch(
    '/api/documents/import',
    withClientId({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  );
  return jsonOrThrow(res, 'Import failed');
}

export async function startQuizSession(
  pairs: QAPair[],
  quizMode: QuizMode = 'voice',
): Promise<{ sessionId: string; currentIndex: number; question: string; totalCount: number }> {
  const res = await fetch(
    '/api/quiz/start',
    withClientId({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs, quizMode }),
    }),
  );
  if (!res.ok) throw new Error('Failed to start quiz session');
  return res.json();
}

/** This browser's unfinished quiz (saved on the server), or null. */
export async function getActiveQuiz(): Promise<ActiveQuiz | null> {
  const res = await fetch('/api/quiz/active', withClientId());
  if (res.status === 404) return null;
  return jsonOrThrow(res, 'Could not load quiz in progress');
}

export async function discardQuiz(sessionId: string): Promise<void> {
  await fetch(`/api/quiz/session/${sessionId}`, withClientId({ method: 'DELETE' }));
}

export async function reextractDocument(hash: string): Promise<DocumentState> {
  const res = await fetch(`/api/documents/${hash}/reextract`, withClientId({ method: 'POST' }));
  return jsonOrThrow(res, 'Could not re-process');
}

export async function fetchStats(): Promise<QuestionStat[]> {
  return jsonOrThrow(await fetch('/api/stats', withClientId()), 'Could not load stats');
}

export async function clearServerStats(): Promise<void> {
  const res = await fetch('/api/stats', withClientId({ method: 'DELETE' }));
  if (!res.ok) throw new Error('Could not clear stats');
}

export async function importStats(stats: QuestionStat[]): Promise<void> {
  const res = await fetch(
    '/api/stats/import',
    withClientId({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats }),
    }),
  );
  if (!res.ok) throw new Error('Could not import stats');
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
  selfAssess?: boolean,
): Promise<EvaluateResponse> {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, questionIndex, userAnswer, selfAssess }),
  });
  if (!res.ok) throw new Error('Evaluation failed');
  return res.json();
}

export async function getCorrectAnswer(
  sessionId: string,
): Promise<{ correctAnswer: string; source: string | null }> {
  const res = await fetch(`/api/quiz/answer/${sessionId}`);
  if (!res.ok) throw new Error('Failed to get answer');
  const data = await res.json();
  return { correctAnswer: data.correctAnswer as string, source: data.source ?? null };
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
