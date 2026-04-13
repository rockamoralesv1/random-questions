import { useCallback, useState } from 'react';
import { submitAnswer } from '../api/quizApi';
import { useQuizStore } from '../store/quizStore';

export function useQuizSession() {
  const { sessionId, currentIndex, currentQuestion, setEvaluation, setView } =
    useQuizStore();
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const evaluate = useCallback(
    async (userAnswer: string) => {
      if (!sessionId || currentQuestion === null) return;
      setIsEvaluating(true);
      setEvalError(null);

      try {
        const result = await submitAnswer(sessionId, currentIndex, userAnswer);
        // Only store the grading result — do NOT advance currentQuestion here.
        // QuizView.handleNext is the single place that clears the evaluation
        // and moves to the next question so the feedback page is never
        // shown simultaneously with the next question's text.
        setEvaluation(result);
      } catch (err) {
        setEvalError((err as Error).message);
      } finally {
        setIsEvaluating(false);
      }
    },
    [sessionId, currentIndex, currentQuestion, setEvaluation],
  );

  const goToResults = useCallback(() => {
    setView('results');
  }, [setView]);

  return { evaluate, isEvaluating, evalError, goToResults };
}
