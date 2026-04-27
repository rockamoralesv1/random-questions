import { useState } from 'react';
import { useQuizStore } from '../store/quizStore';
import { getStats, clearStats } from '../lib/statsStorage';
import { startQuizSession } from '../api/quizApi';
import { translations } from '../i18n';

export function StatsView() {
  const { language, setSession, setCurrentQuestion, setView, reset } = useQuizStore();
  const tr = translations[language];

  const [stats, setStats] = useState(() => getStats());
  const [retrying, setRetrying] = useState(false);

  const wrongStats = stats.filter((s) => s.fails > 0);

  const handleClear = () => {
    if (window.confirm(tr.statsClearConfirm)) {
      clearStats();
      setStats([]);
    }
  };

  const handleRetryWrong = async () => {
    if (wrongStats.length === 0) return;
    const pairs = wrongStats.map((s) => ({ question: s.question, answer: s.correctAnswer }));
    setRetrying(true);
    try {
      const session = await startQuizSession(pairs);
      setSession(session.sessionId, pairs, session.totalCount);
      setCurrentQuestion(session.currentIndex, session.question, session.totalCount);
      setView('quiz');
    } catch {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{tr.statsTitle}</h2>
          {stats.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {tr.statsTracked(stats.length, wrongStats.length)}
            </p>
          )}
        </div>

        {/* Empty state */}
        {stats.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-400">{tr.statsEmpty}</p>
          </div>
        )}

        {/* Rankings */}
        {wrongStats.length > 0 && (
          <div className="space-y-2 mb-6">
            {wrongStats.map((s, i) => {
              const failPct = Math.round((s.fails / s.attempts) * 100);
              const barColor =
                failPct >= 75
                  ? 'bg-red-500'
                  : failPct >= 50
                  ? 'bg-orange-400'
                  : 'bg-yellow-400';

              return (
                <div
                  key={s.question}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-bold text-gray-300 w-7 shrink-0 pt-0.5">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 leading-snug">
                        {s.question}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                        <span className="font-medium text-gray-500">{tr.correctPrefix}</span>
                        {s.correctAnswer}
                      </p>
                      {/* Fail-rate bar */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor} transition-all`}
                            style={{ width: `${failPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 shrink-0 tabular-nums">
                          {failPct}% {tr.statsFailLabel} · {tr.statsAttempts(s.attempts)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Perfect questions summary */}
        {stats.length > wrongStats.length && (
          <p className="text-xs text-gray-400 text-center mb-6">
            {stats.length - wrongStats.length} question
            {stats.length - wrongStats.length !== 1 ? 's' : ''} always answered correctly
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {wrongStats.length > 0 && (
            <button
              onClick={handleRetryWrong}
              disabled={retrying}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {retrying ? '...' : tr.statsRetryWrong(wrongStats.length)}
            </button>
          )}
          {stats.length > 0 && (
            <button
              onClick={handleClear}
              className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              {tr.statsClear}
            </button>
          )}
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
