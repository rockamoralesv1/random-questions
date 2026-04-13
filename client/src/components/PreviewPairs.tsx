import { useEffect, useRef, useState } from 'react';
import { useQuizStore } from '../store/quizStore';
import { startQuizSession } from '../api/quizApi';
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
  const { pairs, setView, setSession, setCurrentQuestion, language, quizMode, setQuizMode } = useQuizStore();
  const tr = translations[language];

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

  // Active = not removed, in original document order
  const activePairs = pairs
    .map((pair, originalIndex) => ({ pair, originalIndex }))
    .filter(({ originalIndex }) => !removed.has(originalIndex));

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
