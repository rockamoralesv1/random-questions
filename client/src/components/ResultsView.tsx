import { useEffect, useState } from 'react';
import { useQuizStore } from '../store/quizStore';
import { fetchResults, startQuizSession } from '../api/quizApi';
import { recordResults } from '../lib/statsStorage';
import { clearDraftSession } from '../lib/draftSession';
import type { ResultsResponse } from '../types';
import { translations } from '../i18n';

export function ResultsView() {
  const { sessionId, pairs, reset, language, setSession, setCurrentQuestion, setView } = useQuizStore();
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const tr = translations[language];

  const handleRestartSame = async () => {
    if (pairs.length === 0) return;
    setRestarting(true);
    try {
      const session = await startQuizSession(pairs);
      setSession(session.sessionId, pairs, session.totalCount);
      setCurrentQuestion(session.currentIndex, session.question, session.totalCount);
      setView('quiz');
    } catch {
      setRestarting(false);
    }
  };

  const handleRetryWrong = async () => {
    if (!results) return;
    const failedPairs = results.details
      .filter((d) => !d.passed)
      .map((d) => ({ question: d.question, answer: d.correctAnswer }));
    if (failedPairs.length === 0) return;
    setRetrying(true);
    try {
      const session = await startQuizSession(failedPairs);
      setSession(session.sessionId, failedPairs, session.totalCount);
      setCurrentQuestion(session.currentIndex, session.question, session.totalCount);
      setView('quiz');
    } catch {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    fetchResults(sessionId)
      .then((r) => { recordResults(r.details); clearDraftSession(); setResults(r); })
      .catch((err: Error) => setError(err.message));
  }, [sessionId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={reset} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            {tr.startNew}
          </button>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const passPct = results.answered > 0 ? Math.round((results.passed / results.answered) * 100) : 0;
  const skipped = results.totalQuestions - results.answered;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-6 shadow-sm">
          <div className="text-6xl font-bold text-blue-600 mb-1">{passPct}%</div>
          <p className="text-gray-500 text-sm mb-4">{tr.scoreLabel(results.passed, results.answered)}</p>
          <div className="flex justify-center gap-6 text-sm">
            <span className="text-green-600 font-medium">{tr.correct_stat(results.passed)}</span>
            <span className="text-red-600 font-medium">{tr.incorrect_stat(results.failed)}</span>
            {skipped > 0 && (
              <span className="text-gray-400">{tr.skipped_stat(skipped)}</span>
            )}
          </div>
        </div>

        <h3 className="text-lg font-semibold text-gray-700 mb-3">{tr.breakdown}</h3>
        <div className="space-y-3 mb-8">
          {results.details.map((item, i) => (
            <div
              key={i}
              className={`bg-white rounded-lg border p-4 ${item.passed ? 'border-green-200' : 'border-red-200'}`}
            >
              <div className="flex items-start gap-2">
                <span className={item.passed ? 'text-green-500' : 'text-red-500'}>
                  {item.passed ? '✓' : '✗'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{item.question}</p>
                  {!item.passed && (
                    <p className="text-sm text-gray-500 mt-1">
                      <span className="font-medium">{tr.correctPrefix}</span>{item.correctAnswer}
                    </p>
                  )}
                  {!item.passed && item.missingConcepts.length > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      {tr.missingPrefix}{item.missingConcepts.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {results.failed > 0 && (
            <button
              onClick={handleRetryWrong}
              disabled={retrying}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {retrying ? '...' : tr.retryWrong(results.failed)}
            </button>
          )}
          <button
            onClick={handleRestartSame}
            disabled={restarting}
            className="w-full py-3 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {restarting ? '...' : tr.restartSame}
          </button>
          <button
            onClick={reset}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            {tr.startNew}
          </button>
        </div>
      </div>
    </div>
  );
}
