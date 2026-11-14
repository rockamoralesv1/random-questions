import { randomUUID } from 'crypto';
import { getRepository, type QuizMode, type QuizSessionRow } from '../db';
import type { QAPair, QuizAnswer } from '../types';
import * as usage from './usageService';

// Sessions live in the database, so they survive restarts and can be resumed
// from any browser with the same personal code. Old ones are purged on boot.
export const SESSION_RETENTION_DAYS = 90;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Starts a quiz. With a client ID, it replaces that client's other unfinished
 * quiz (there is one "continue where you left off" per browser).
 */
export async function createSession(
  pairs: QAPair[],
  clientId: string | null,
  quizMode: QuizMode,
): Promise<QuizSessionRow> {
  const now = Date.now();
  const session: QuizSessionRow = {
    id: randomUUID(),
    clientId,
    quizMode,
    pairs: shuffle(pairs),
    currentIndex: 0,
    answers: [],
    createdAt: now,
    updatedAt: now,
  };
  const repo = getRepository();
  await repo.createQuizSession(session);
  if (clientId) await repo.deleteUnfinishedQuizSessions(clientId, session.id);
  usage.recordQuizStarted(clientId);
  return session;
}

export async function getSession(id: string): Promise<QuizSessionRow> {
  const session = await getRepository().getQuizSession(id);
  if (!session) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }
  return session;
}

export function getCurrentQuestion(
  session: QuizSessionRow,
): { index: number; total: number; question: string } | null {
  if (session.currentIndex >= session.pairs.length) return null;
  return {
    index: session.currentIndex,
    total: session.pairs.length,
    question: session.pairs[session.currentIndex].question,
  };
}

/**
 * Records the answer to the current question and advances, and updates the
 * client's per-question stats. Returns false if the session already moved on
 * (e.g. a double submit) — nothing is recorded then.
 */
export async function recordAnswer(
  session: QuizSessionRow,
  result: Omit<QuizAnswer, 'question' | 'correctAnswer' | 'source'>,
): Promise<boolean> {
  const pair = session.pairs[session.currentIndex];
  const answer: QuizAnswer = {
    question: pair.question,
    correctAnswer: pair.answer,
    source: pair.source ?? null,
    ...result,
  };
  const repo = getRepository();
  const ok = await repo.recordQuizAnswer(session.id, session.currentIndex, answer);
  if (!ok) return false;

  session.answers.push(answer);
  session.currentIndex += 1;
  usage.recordAnswer(session.clientId, result.passed);
  if (session.clientId) {
    await repo.recordQuestionStat(session.clientId, {
      question: pair.question,
      correctAnswer: pair.answer,
      source: pair.source ?? null,
      passed: result.passed,
    });
  }
  return true;
}
