import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuizStore } from '../store/quizStore';
import { startQuizSession, retryDocument } from '../api/quizApi';
import { pollDocument, stopPolling } from '../lib/documentPoller';
import { shareCodeFor, copyToClipboard } from '../lib/shareCode';
import { translations } from '../i18n';
import type { QAPair } from '../types';
import type { QuizMode } from '../types';

const PAGE_SIZE = 10;

// ─── Search Dialog ────────────────────────────────────────────────────────────

interface SearchDialogProps {
  pairs: { pair: QAPair; originalIndex: number }[];
  selected: Set<number>;
  onToggle: (originalIndex: number) => void;
  onClose: () => void;
  lang: 'en' | 'es';
}

function SearchDialog({ pairs, selected, onToggle, onClose, lang }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tr = translations[lang];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const lower = query.toLowerCase();
  const filtered = query
    ? pairs.filter(
        ({ pair }) =>
          pair.question.toLowerCase().includes(lower) ||
          pair.answer.toLowerCase().includes(lower),
      )
    : pairs;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="text-gray-400 text-lg">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === 'es' ? 'Buscar preguntas…' : 'Search questions…'}
            className="flex-1 text-sm outline-none text-gray-800 placeholder-gray-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          )}
        </div>

        {/* Results count */}
        <div className="px-5 py-2 text-xs text-gray-400 border-b border-gray-100">
          {filtered.length} {lang === 'es' ? 'resultado(s)' : 'result(s)'}
          {' · '}
          {selected.size} {lang === 'es' ? 'seleccionada(s)' : 'selected'}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              {lang === 'es' ? 'Sin resultados' : 'No results'}
            </p>
          ) : (
            filtered.map(({ pair, originalIndex }) => (
              <label
                key={originalIndex}
                className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(originalIndex)}
                  onChange={() => onToggle(originalIndex)}
                  className="mt-0.5 h-4 w-4 rounded accent-blue-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-blue-600 mr-2">
                    #{originalIndex + 1}
                  </span>
                  <span className="text-sm text-gray-800">{pair.question}</span>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{pair.answer}</p>
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {tr.back === 'Back' ? 'Done' : 'Listo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PreviewPairs() {
  const {
    pairs, setView, setSession, setCurrentQuestion, language, quizMode, setQuizMode,
    document: doc, pairsVersion, applyDocumentState,
  } = useQuizStore();
  const tr = translations[language];
  const es = language === 'es';

  // Removed pairs (bad AI extractions) — by original document index
  const [removed, setRemoved] = useState<Set<number>>(new Set());

  // Selected pairs for the quiz — initialise to all
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(pairs.map((_, i) => i)),
  );

  const [page, setPage] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [rangeInput, setRangeInput] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pairs keep arriving while the server extracts the PDF. New ones are
  // appended and selected; if the list is replaced (another bank, or a retry
  // that re-inserts chunks), selection and removals start over.
  const knownCount = useRef(pairs.length);
  const knownVersion = useRef(pairsVersion);
  useEffect(() => {
    if (pairsVersion !== knownVersion.current) {
      knownVersion.current = pairsVersion;
      knownCount.current = pairs.length;
      setRemoved(new Set());
      setSelected(new Set(pairs.map((_, i) => i)));
      return;
    }
    if (pairs.length > knownCount.current) {
      const from = knownCount.current;
      knownCount.current = pairs.length;
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = from; i < pairs.length; i++) next.add(i);
        return next;
      });
    }
  }, [pairs, pairsVersion]);

  // Active = not removed, in original document order
  const activePairs = pairs
    .map((pair, originalIndex) => ({ pair, originalIndex }))
    .filter(({ originalIndex }) => !removed.has(originalIndex));

  // Topics in document order, with the (original) indices of their questions.
  const topics = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const { pair, originalIndex } of activePairs) {
      const key = pair.topic ?? '';
      groups.set(key, [...(groups.get(key) ?? []), originalIndex]);
    }
    const hasTopics = [...groups.keys()].some((k) => k !== '');
    return hasTopics ? [...groups.entries()].map(([name, indices]) => ({ name, indices })) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, removed]);

  const toggleTopic = (indices: number[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = indices.every((i) => next.has(i));
      indices.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
      return next;
    });
  };

  const handleRetry = async () => {
    if (!doc) return;
    setIsRetrying(true);
    try {
      const state = await retryDocument(doc.hash);
      applyDocumentState(state, doc.fileName);
      if (state.status === 'processing') pollDocument(doc.hash, doc.fileName);
    } catch (err) {
      setStartError((err as Error).message);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCopyShare = async () => {
    if (doc && (await copyToClipboard(shareCodeFor(doc.hash)))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const selectedCount = activePairs.filter(({ originalIndex }) =>
    selected.has(originalIndex),
  ).length;

  // Pagination over the active (non-removed) list
  const totalPages = Math.max(1, Math.ceil(activePairs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagePairs = activePairs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const toggleSelection = (originalIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(originalIndex) ? next.delete(originalIndex) : next.add(originalIndex);
      return next;
    });
  };

  const selectAll = () =>
    setSelected(new Set(activePairs.map(({ originalIndex }) => originalIndex)));

  const deselectAll = () => setSelected(new Set());

  // ── Range selection ────────────────────────────────────────────────────────
  // Parses "1-54" or "1-20, 30-40" into a flat list of 1-based question numbers.
  // Returns null on any parse error.
  const parseRanges = (input: string): number[] | null => {
    const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const nums: number[] = [];
    for (const part of parts) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map((s) => parseInt(s.trim(), 10));
        if (isNaN(a) || isNaN(b) || a < 1 || b < a) return null;
        for (let i = a; i <= b; i++) nums.push(i);
      } else {
        const n = parseInt(part, 10);
        if (isNaN(n) || n < 1) return null;
        nums.push(n);
      }
    }
    return nums.length > 0 ? [...new Set(nums)] : null;
  };

  const applyRange = () => {
    if (!rangeInput.trim()) {
      setRangeError(null);
      return;
    }
    const nums = parseRanges(rangeInput);
    if (!nums) {
      setRangeError(language === 'es' ? 'Formato inválido' : 'Invalid format');
      return;
    }
    const numberSet = new Set(nums);
    // #N in the UI = originalIndex + 1
    const next = new Set<number>();
    activePairs.forEach(({ originalIndex }) => {
      if (numberSet.has(originalIndex + 1)) next.add(originalIndex);
    });
    setSelected(next);
    setRangeError(null);
  };

  const handleRemove = (originalIndex: number) => {
    setRemoved((prev) => new Set([...prev, originalIndex]));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(originalIndex);
      return next;
    });
    // Step back if this was the last visible item on the current page
    const remainingOnPage = pagePairs.filter(
      (p) => p.originalIndex !== originalIndex,
    ).length;
    if (remainingOnPage === 0 && safePage > 0) setPage(safePage - 1);
  };

  const startQuiz = async () => {
    const quizPairs = activePairs
      .filter(({ originalIndex }) => selected.has(originalIndex))
      .map(({ pair }) => pair);
    if (quizPairs.length === 0) return;

    setIsStarting(true);
    setStartError(null);
    // Starting before extraction finishes uses the questions loaded so far.
    // The server keeps going; reopening the bank later shows all of them.
    stopPolling();
    try {
      const session = await startQuizSession(quizPairs);
      setSession(session.sessionId, quizPairs, session.totalCount);
      setCurrentQuestion(session.currentIndex, session.question, session.totalCount);
      setView('quiz');
    } catch (err) {
      setStartError((err as Error).message);
      setIsStarting(false);
    }
  };

  return (
    <>
      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-6 pt-6 overflow-hidden">
        {/* Title */}
        <div className="mb-4 shrink-0">
          <h2 className="text-2xl font-bold text-gray-800">{tr.reviewTitle}</h2>
          <p className="text-gray-500 mt-1">{tr.reviewSubtitle(activePairs.length)}</p>

          {doc && (doc.status === 'processing' || doc.status === 'paused') && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <div className="flex items-center gap-2">
                {doc.status === 'processing' && (
                  <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span>
                  {doc.status === 'paused'
                    ? es
                      ? `IA deshabilitada: faltan ${doc.totalChunks - doc.completedChunks} de ${doc.totalChunks} partes. Se reanudará al habilitarla.`
                      : `AI disabled: ${doc.totalChunks - doc.completedChunks} of ${doc.totalChunks} parts left. Resumes once enabled.`
                    : es
                      ? `Cargando preguntas… parte ${doc.completedChunks} de ${doc.totalChunks}`
                      : `Loading questions… part ${doc.completedChunks} of ${doc.totalChunks}`}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded bg-blue-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(100 * doc.completedChunks) / Math.max(1, doc.totalChunks)}%` }}
                />
              </div>
              {doc.status === 'processing' && (
                <p className="mt-1 text-xs text-blue-600">
                  {es
                    ? 'Puedes empezar ya con las preguntas cargadas; el resto seguirá guardándose.'
                    : 'You can start now with the loaded questions; the rest keeps being saved.'}
                </p>
              )}
            </div>
          )}

          {doc && doc.failedChunks > 0 && doc.status !== 'processing' && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="flex-1">
                {es
                  ? `${doc.failedChunks} de ${doc.totalChunks} partes no se pudieron leer.`
                  : `${doc.failedChunks} of ${doc.totalChunks} parts could not be read.`}
                {doc.error && <span className="block text-xs text-red-500 truncate">{doc.error}</span>}
              </span>
              <button
                onClick={() => void handleRetry()}
                disabled={isRetrying}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60 shrink-0"
              >
                {isRetrying ? '…' : es ? 'Reintentar' : 'Retry'}
              </button>
            </div>
          )}

          {doc && (
            <p className="mt-2 text-xs text-gray-400">
              {es ? 'Código para compartir: ' : 'Share code: '}
              <code className="font-mono text-gray-600">{shareCodeFor(doc.hash)}</code>{' '}
              <button onClick={() => void handleCopyShare()} className="text-blue-600 hover:underline">
                {copied ? (es ? '¡Copiado!' : 'Copied!') : es ? 'Copiar' : 'Copy'}
              </button>
            </p>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-2 mb-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              🔍 {language === 'es' ? 'Buscar' : 'Search'}
            </button>

            <button
              onClick={selectAll}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {language === 'es' ? 'Sel. todo' : 'Select all'}
            </button>

            <button
              onClick={deselectAll}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {language === 'es' ? 'Desel. todo' : 'Deselect all'}
            </button>

            <span className="ml-auto text-sm text-gray-500 font-medium">
              {selectedCount} / {activePairs.length} {language === 'es' ? 'sel.' : 'selected'}
            </span>
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center flex-1 rounded-lg border bg-white px-3 py-1.5 gap-2 ${
              rangeError ? 'border-red-300' : 'border-gray-200'
            }`}>
              <span className="text-xs text-gray-400 shrink-0">
                {language === 'es' ? 'Rango #' : 'Range #'}
              </span>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => { setRangeInput(e.target.value); setRangeError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyRange(); }}
                placeholder={language === 'es' ? 'ej. 1-54 o 1-20, 30-40' : 'e.g. 1-54 or 1-20, 30-40'}
                className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-300 min-w-0"
              />
              {rangeInput && (
                <button
                  onClick={() => { setRangeInput(''); setRangeError(null); }}
                  className="text-gray-300 hover:text-gray-500 text-base leading-none shrink-0"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={applyRange}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shrink-0"
            >
              {language === 'es' ? 'Aplicar' : 'Apply'}
            </button>
          </div>

          {topics.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-400 shrink-0">{es ? 'Temas:' : 'Topics:'}</span>
              {topics.map(({ name, indices }) => {
                const all = indices.every((i) => selected.has(i));
                const some = !all && indices.some((i) => selected.has(i));
                return (
                  <button
                    key={name || '__none'}
                    onClick={() => toggleTopic(indices)}
                    title={es ? 'Seleccionar / quitar este tema' : 'Select / deselect this topic'}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      all
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : some
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {name || (es ? 'Sin tema' : 'No topic')} ({indices.length})
                  </button>
                );
              })}
            </div>
          )}

          {rangeError && (
            <p className="text-xs text-red-500 -mt-1">
              {rangeError}
              {' — '}
              {language === 'es'
                ? 'usa "1-54" o "1-20, 30-40"'
                : 'use "1-54" or "1-20, 30-40"'}
            </p>
          )}
        </div>

        {/* Scrollable question list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {pagePairs.map(({ pair, originalIndex }) => {
            const isSelected = selected.has(originalIndex);
            return (
              <div
                key={originalIndex}
                onClick={() => toggleSelection(originalIndex)}
                className={`bg-white rounded-lg border p-4 cursor-pointer transition-colors select-none ${
                  isSelected
                    ? 'border-blue-300 ring-1 ring-blue-200'
                    : 'border-gray-200 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(originalIndex)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 h-4 w-4 rounded accent-blue-600 shrink-0"
                  />
                  <span className="text-xs font-bold text-blue-600 shrink-0 mt-0.5 w-8">
                    #{originalIndex + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    {pair.topic && (
                      <p className="text-[11px] font-medium text-indigo-500 mb-0.5 truncate">{pair.topic}</p>
                    )}
                    <p className="font-medium text-gray-800 text-sm">{pair.question}</p>
                    <p className="text-gray-400 text-xs mt-1 line-clamp-2">{pair.answer}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(originalIndex); }}
                    className="text-gray-300 hover:text-red-400 transition-colors shrink-0 text-xl leading-none mt-0.5"
                    title={tr.remove}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky bottom — pagination + actions */}
        <div className="sticky bottom-0 bg-gray-50 pt-3 pb-4 shrink-0">
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pb-3 text-sm text-gray-500 border-b border-gray-200 mb-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              <span className="tabular-nums">
                {safePage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
            </div>
          )}

          {/* Mode selector */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500 font-medium">{tr.quizModeLabel}:</span>
            {(['voice', 'flashcard'] as QuizMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setQuizMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  quizMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {mode === 'voice' ? tr.voiceMode : tr.flashcardMode}
              </button>
            ))}
          </div>

          {startError && (
            <p className="text-red-500 text-sm mb-2 text-center">{startError}</p>
          )}

          {/* Action bar */}
          <div className="flex gap-3">
            <button
              onClick={() => setView('upload')}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {tr.back}
            </button>
            <button
              onClick={startQuiz}
              disabled={selectedCount === 0 || isStarting}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStarting
                ? (language === 'es' ? 'Iniciando…' : 'Starting…')
                : tr.startQuiz(selectedCount)}
            </button>
          </div>
        </div>
      </div>

      {searchOpen && (
        <SearchDialog
          pairs={activePairs}
          selected={selected}
          onToggle={toggleSelection}
          onClose={() => setSearchOpen(false)}
          lang={language}
        />
      )}
    </>
  );
}
