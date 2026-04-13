import { diffWords } from 'diff';
import type { EvaluateResponse } from '../types';
import type { UseTTSReturn } from '../hooks/useTTS';
import { translations } from '../i18n';
import type { Lang } from '../i18n';

interface AnswerFeedbackProps {
  evaluation: EvaluateResponse;
  userAnswer: string;
  tts: UseTTSReturn;
  onNext: () => void;
  isLast: boolean;
  lang: Lang;
}

export function AnswerFeedback({ evaluation, userAnswer, tts, onNext, isLast, lang }: AnswerFeedbackProps) {
  const { passed, correctAnswer, missingConcepts, feedback } = evaluation;
  const tr = translations[lang];
  const diffParts = diffWords(userAnswer, correctAnswer);

  return (
    <div className={`rounded-xl border p-5 ${passed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{passed ? '✓' : '✗'}</span>
        <span className={`font-semibold text-lg ${passed ? 'text-green-700' : 'text-red-700'}`}>
          {passed ? tr.correct : tr.incorrect}
        </span>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{tr.yourAnswer}</p>
        <p className="text-gray-700 text-sm">
          {userAnswer || <em className="text-gray-400">{tr.noAnswerRecorded}</em>}
        </p>
      </div>

      {!passed && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{tr.correctAnswer}</p>
            <button
              onClick={() => tts.speak(correctAnswer)}
              disabled={tts.status === 'speaking' || tts.status === 'loading'}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
            >
              {tr.hearIt}
            </button>
          </div>
          <p className="text-gray-800 text-sm leading-relaxed">
            {diffParts.map((part, i) => {
              if (part.added) {
                return (
                  <mark key={i} className="bg-red-200 text-red-800 rounded px-0.5">
                    {part.value}
                  </mark>
                );
              }
              if (part.removed) return null;
              return <span key={i}>{part.value}</span>;
            })}
          </p>
        </div>
      )}

      {!passed && missingConcepts.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{tr.missingConcepts}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {missingConcepts.map((concept, i) => (
              <li key={i} className="text-red-700 text-sm">{concept}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-gray-600 italic mb-4">{feedback}</p>

      <button
        onClick={onNext}
        className="w-full py-2.5 rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-900 transition-colors"
      >
        {isLast ? tr.seeResults : tr.next}
      </button>
    </div>
  );
}
