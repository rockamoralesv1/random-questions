import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuizStore } from '../store/quizStore';
import { useTTS } from '../hooks/useTTS';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useQuizSession } from '../hooks/useQuizSession';
import { ProgressBar } from './ProgressBar';
import { MicButton } from './MicButton';
import { AnswerFeedback } from './AnswerFeedback';
import { translations } from '../i18n';
import { getCorrectAnswer } from '../api/quizApi';
import { detectSTTTier } from '../lib/stt/detectSTTTier';
import type { STTTier } from '../lib/stt/detectSTTTier';

export function QuizView() {
  const {
    currentIndex, totalCount, currentQuestion, lastEvaluation,
    setCurrentQuestion, setEvaluation, language, quizMode, sessionId,
  } = useQuizStore();

  const tts = useTTS(language);
  const [forcedSTTTier, setForcedSTTTier] = useState<STTTier | null>(null);
  const activeTier = forcedSTTTier ?? detectSTTTier();
  const stt = useSpeechRecognition(language);
  const { evaluate, isEvaluating, evalError, goToResults } = useQuizSession();
  const tr = translations[language];

  // Flashcard state
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const spokenQuestion = useRef<string | null>(null);

  // Speak question when it changes
  useEffect(() => {
    if (currentQuestion && currentQuestion !== spokenQuestion.current) {
      spokenQuestion.current = currentQuestion;
      tts.speak(currentQuestion);
    }
    // Reset flashcard reveal on new question
    setRevealedAnswer(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion]);

  // ── Voice mode handlers ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (stt.state !== 'result') return;
    tts.stop();
    await evaluate(stt.finalTranscript);
  };

  // ── Flashcard mode handlers ──────────────────────────────────────────────

  const handleRevealAnswer = useCallback(async () => {
    if (!sessionId || isRevealing) return;
    setIsRevealing(true);
    try {
      const answer = await getCorrectAnswer(sessionId);
      setRevealedAnswer(answer);
      tts.speak(answer);
    } catch {
      setRevealedAnswer('—');
    } finally {
      setIsRevealing(false);
    }
  }, [sessionId, isRevealing, tts]);

  const handleSelfAssess = useCallback(async (knew: boolean) => {
    await evaluate(revealedAnswer ?? '', knew);
  }, [evaluate, revealedAnswer]);

  // ── Shared next-question handler ─────────────────────────────────────────

  const handleNext = () => {
    const evaluation = lastEvaluation;
    if (!evaluation) return;

    setEvaluation(null);
    stt.reset();
    setRevealedAnswer(null);

    if (!evaluation.next) {
      goToResults();
      return;
    }
    setCurrentQuestion(evaluation.next.questionIndex, evaluation.next.question, totalCount);
  };

  const isLast = lastEvaluation?.next === null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6 pt-10">
      <div className="w-full max-w-xl">
        <ProgressBar current={currentIndex} total={totalCount} lang={language} />

        {/* Question card */}
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
            <>
              {/* ── Voice mode ── */}
              {quizMode === 'voice' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-3">
                    <MicButton
                      state={stt.state}
                      onStart={stt.startListening}
                      onStop={stt.stopListening}
                      lang={language}
                    />
                    {/* STT tier toggle — helps when browser STT silently fails */}
                    <button
                      onClick={() =>
                        setForcedSTTTier((prev) =>
                          prev === 'server' ? null : 'server',
                        )
                      }
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        activeTier === 'server'
                          ? 'border-blue-400 text-blue-600 bg-blue-50'
                          : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                      title={
                        activeTier === 'server'
                          ? tr.switchToBrowser
                          : tr.switchToWhisper
                      }
                    >
                      {activeTier === 'server' ? '☁ Whisper' : '🎙 Browser'}
                    </button>
                  </div>

                  <div className="min-h-[2.5rem] text-center px-2">
                    {stt.state === 'listening' && !stt.interimTranscript && (
                      <p className="text-gray-300 text-sm italic">
                        {language === 'es' ? 'Habla ahora…' : 'Speak now…'}
                      </p>
                    )}
                    {stt.state === 'listening' && stt.interimTranscript && (
                      <p className="text-gray-400 italic text-sm">{stt.interimTranscript}</p>
                    )}
                    {stt.state === 'result' && stt.finalTranscript && (
                      <p className="text-gray-700 text-sm">"{stt.finalTranscript}"</p>
                    )}
                    {stt.state === 'result' && !stt.finalTranscript && (
                      <p className="text-gray-400 text-sm italic">{tr.noSpeech}</p>
                    )}
                    {stt.error && <p className="text-red-500 text-sm">{stt.error}</p>}
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

              {/* ── Flashcard mode ── */}
              {quizMode === 'flashcard' && (
                <div className="flex flex-col items-center gap-4">
                  {!revealedAnswer ? (
                    <button
                      onClick={handleRevealAnswer}
                      disabled={isRevealing}
                      className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-lg"
                    >
                      {isRevealing
                        ? (language === 'es' ? 'Cargando…' : 'Loading…')
                        : tr.showAnswer}
                    </button>
                  ) : (
                    <div className="w-full space-y-4">
                      {/* Correct answer reveal */}
                      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          {tr.correctAnswer}
                        </p>
                        <p className="text-gray-800 leading-relaxed">{revealedAnswer}</p>
                      </div>

                      {/* Self-assess buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleSelfAssess(false)}
                          disabled={isEvaluating}
                          className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {tr.iDidntKnow}
                        </button>
                        <button
                          onClick={() => handleSelfAssess(true)}
                          disabled={isEvaluating}
                          className="flex-1 py-3 rounded-xl border-2 border-green-200 text-green-600 font-medium hover:bg-green-50 disabled:opacity-50 transition-colors"
                        >
                          {tr.iKnewIt}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Feedback (voice mode) / Result (flashcard mode) */}
        {lastEvaluation && (
          <div className="mt-4">
            {quizMode === 'flashcard' ? (
              /* Flashcard: simple pass/fail, no diff needed — user already saw the answer */
              <div className={`rounded-xl border p-5 ${lastEvaluation.passed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{lastEvaluation.passed ? '✓' : '✗'}</span>
                  <span className={`font-semibold text-lg ${lastEvaluation.passed ? 'text-green-700' : 'text-red-700'}`}>
                    {lastEvaluation.passed ? tr.correct : tr.incorrect}
                  </span>
                </div>
                <button
                  onClick={handleNext}
                  className="w-full py-2.5 rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-900 transition-colors"
                >
                  {isLast ? tr.seeResults : tr.next}
                </button>
              </div>
            ) : (
              <AnswerFeedback
                evaluation={lastEvaluation}
                userAnswer={stt.finalTranscript}
                tts={tts}
                onNext={handleNext}
                isLast={!!isLast}
                lang={language}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
