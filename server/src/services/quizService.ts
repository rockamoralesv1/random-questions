import { randomUUID } from 'crypto';
import type { QAPair, QuizSession } from '../types';

// In-memory session store — replace with Redis for production
const sessions = new Map<string, QuizSession>();
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createSession(pairs: QAPair[]): QuizSession {
  const session: QuizSession = {
    id: randomUUID(),
    pairs: shuffle(pairs),
    currentIndex: 0,
    answers: [],
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): QuizSession {
  const session = sessions.get(id);
  if (!session) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    throw Object.assign(new Error('Session expired'), { status: 410 });
  }
  return session;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function getCurrentQuestion(
  session: QuizSession,
): { index: number; total: number; question: string } | null {
  if (session.currentIndex >= session.pairs.length) return null;
  return {
    index: session.currentIndex,
    total: session.pairs.length,
    question: session.pairs[session.currentIndex].question,
  };
}

export function recordAnswer(
  session: QuizSession,
  userAnswer: string,
  passed: boolean,
  missingConcepts: string[],
  feedback: string,
): void {
  const pair = session.pairs[session.currentIndex];
  session.answers.push({
    question: pair.question,
    correctAnswer: pair.answer,
    userAnswer,
    passed,
    missingConcepts,
    feedback,
  });
  session.currentIndex += 1;
}
