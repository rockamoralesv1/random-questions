import { getProviderWithFallback, isAIEnabled } from '../ai';
import type { GradingResult } from '../types';

const FUZZY_THRESHOLD = 0.85;

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

export async function evaluateAnswer(
  question: string,
  correctAnswer: string,
  userAnswer: string,
): Promise<GradingResult> {
  // Layer 1: fast fuzzy check — skip AI call if answer is close enough
  const similarity = jaccardSimilarity(
    normalize(userAnswer),
    normalize(correctAnswer),
  );

  if (similarity >= FUZZY_THRESHOLD) {
    return {
      passed: true,
      missingConcepts: [],
      feedback: 'Great answer!',
    };
  }

  if (!isAIEnabled()) {
    // No AI: grade on word overlap alone and list the answer's key words that
    // were not said.
    const said = new Set(normalize(userAnswer));
    const missing = [...new Set(normalize(correctAnswer))].filter((w) => w.length > 3 && !said.has(w));
    return {
      passed: false,
      missingConcepts: missing.slice(0, 10),
      feedback: 'AI grading is disabled — graded by matching words with the correct answer.',
    };
  }

  // Layer 2: AI semantic grading
  const provider = getProviderWithFallback();
  return provider.grading.gradeAnswer(question, correctAnswer, userAnswer);
}
