import { useEffect, useRef } from 'react';
import { useQuizStore } from '../store/quizStore';
import { useTTS } from '../hooks/useTTS';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useQuizSession } from '../hooks/useQuizSession';
import { ProgressBar } from './ProgressBar';
import { MicButton } from './MicButton';
import { AnswerFeedback } from './AnswerFeedback';
import { translations } from '../i18n';

export function QuizView() {
  const { currentIndex, totalCount, currentQuestion, lastEvaluation, setCurrentQuestion, setEvaluation, language } =
    useQuizStore();
  const tts = useTTS(language);
  const stt = useSpeechRecognition(language);
  const { evaluate, isEvaluating, evalError, goToResults } = useQuizSession();
  const tr = translations[language];

  const spokenQuestion = useRef<string | null>(null);

  useEffect(() => {
    if (currentQuestion && currentQuestion !== spokenQuestion.current) {
      spokenQuestion.current = currentQuestion;
      tts.speak(currentQuestion);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion]);

  const handleSubmit = async () => {
    if (stt.state !== 'result') return;
    tts.stop();
    await evaluate(stt.finalTranscript);
    // Do NOT reset STT here — finalTranscript must stay populated while
    // AnswerFeedback is visible. handleNext resets it when advancing.
  };

  const handleNext = () => {
    // Capture before clearing — React 18 batches the setters below
    const evaluation = lastEvaluation;
    if (!evaluation) return;

    // Clear feedback first so the grading page disappears before the new question renders
    setEvaluation(null);
    stt.reset();

    if (!evaluation.next) {
      goToResults();
      return;
    }

    setCurrentQuestion(
      evaluation.next.questionIndex,
      evaluation.next.question,
      totalCount,
    );
  };

  const isLast = lastEvaluation?.next === null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6 pt-10">
      <div className="w-full max-w-xl">
        <ProgressBar current={currentIndex} total={totalCount} lang={language} />

        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-6">
            <p className="text-gray-800 text-lg font-medium leading-relaxed">
              {currentQuestion}
            </p>
            <button
              onClick={() => currentQuestion && tts.speak(currentQuestion)}
              disabled={tts.status === 'speaking' || tts.status === 'loading'}
              className="shrink-0 text-gray-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
              title={tr.replayQuestion}
            >
              🔊
            </button>
          </div>

          {!lastEvaluation && (
            <div className="flex flex-col items-center gap-4">
              <MicButton
                state={stt.state}
                onStart={stt.startListening}
                onStop={stt.stopListening}
              />

              <div className="min-h-[2.5rem] text-center">
                {stt.state === 'listening' && stt.interimTranscript && (
                  <p className="text-gray-400 italic text-sm">{stt.interimTranscript}</p>
                )}
                {stt.state === 'result' && stt.finalTranscript && (
                  <p className="text-gray-700 text-sm">"{stt.finalTranscript}"</p>
                )}
                {stt.state === 'result' && !stt.finalTranscript && (
                  <p className="text-gray-400 text-sm italic">{tr.noSpeech}</p>
                )}
                {stt.error && (
                  <p className="text-red-500 text-sm">{stt.error}</p>
                )}
              </div>

              {stt.state === 'result' && (
                <button
                  onClick={handleSubmit}
                  disabled={isEvaluating || !stt.finalTranscript}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isEvaluating ? tr.evaluating : tr.submitAnswer}
                </button>
              )}

              {evalError && <p className="text-red-500 text-sm">{evalError}</p>}
            </div>
          )}
        </div>

        {lastEvaluation && (
          <div className="mt-4">
            <AnswerFeedback
              evaluation={lastEvaluation}
              userAnswer={stt.finalTranscript}
              tts={tts}
              onNext={handleNext}
              isLast={!!isLast}
              lang={language}
            />
          </div>
        )}
      </div>
    </div>
  );
}
