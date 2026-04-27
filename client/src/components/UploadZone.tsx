import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadPDF, pollUploadJob, fetchSession, startQuizSession } from '../api/quizApi';
import { useQuizStore } from '../store/quizStore';
import { translations } from '../i18n';
import {
  computeFileHash,
  getDocumentByHash,
  getSavedDocuments,
  saveDocument,
  deleteDocument,
  formatRelativeTime,
  type SavedDocument,
} from '../lib/storage';
import {
  getDraftSession,
  clearDraftSession,
  type DraftSession,
} from '../lib/draftSession';
import type { QAPair } from '../types';

export function UploadZone() {
  const { setPairs, setView, language, setSession, setCurrentQuestion, setQuizMode } = useQuizStore();
  const [isUploading, setIsUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SavedDocument[]>([]);
  const [draft, setDraft] = useState<DraftSession | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const tr = translations[language];

  useEffect(() => {
    setRecent(getSavedDocuments());
    setDraft(getDraftSession());
  }, []);

  const handleResume = useCallback(async () => {
    if (!draft) return;
    setIsResuming(true);
    try {
      // Try to reattach to the existing server session
      try {
        const serverSession = await fetchSession(draft.sessionId);
        if (!serverSession.done && serverSession.question && serverSession.currentIndex !== undefined) {
          setSession(draft.sessionId, draft.pairs, serverSession.totalCount);
          setCurrentQuestion(serverSession.currentIndex, serverSession.question, serverSession.totalCount);
          setQuizMode(draft.quizMode);
          setView('quiz');
          setDraft(null);
          return;
        }
      } catch {
        // Server session expired — fall through to restart with remaining pairs
      }

      // Server session gone: start fresh with only the remaining questions
      const remainingPairs = draft.pairs.slice(draft.currentIndex);
      if (remainingPairs.length === 0) {
        clearDraftSession();
        setDraft(null);
        return;
      }
      const session = await startQuizSession(remainingPairs);
      setSession(session.sessionId, remainingPairs, session.totalCount);
      setCurrentQuestion(session.currentIndex, session.question, session.totalCount);
      setQuizMode(draft.quizMode);
      setView('quiz');
      setDraft(null);
    } catch {
      setIsResuming(false);
    }
  }, [draft, setSession, setCurrentQuestion, setQuizMode, setView]);

  const handleDismissDraft = () => {
    clearDraftSession();
    setDraft(null);
  };

  const loadPairs = useCallback(
    (pairs: QAPair[]) => {
      setPairs(pairs);
      setView('preview');
    },
    [setPairs, setView],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setStatusMsg(null);

      // 1. Compute hash client-side — check localStorage first
      let hash = '';
      try {
        hash = await computeFileHash(file);
        const cached = getDocumentByHash(hash);
        if (cached) {
          loadPairs(cached.pairs);
          return;
        }
      } catch {
        hash = '';
      }

      setIsUploading(true);
      setStatusMsg(tr.extracting);

      try {
        const result = await uploadPDF(file);

        // Fast path: server cache hit — pairs returned immediately
        if ('pairs' in result) {
          saveDocument({ hash: result.hash || hash, fileName: file.name, savedAt: Date.now(), pairs: result.pairs });
          setRecent(getSavedDocuments());
          loadPairs(result.pairs);
          return;
        }

        // Slow path: extraction is running in the background — poll for result
        const { jobId } = result;
        const pollResult = await pollUploadJob(jobId, (attempt) => {
          const seconds = attempt * 2;
          setStatusMsg(
            language === 'es'
              ? `Extrayendo preguntas… ${seconds}s`
              : `Extracting questions… ${seconds}s`,
          );
        });

        saveDocument({ hash: pollResult.hash || hash, fileName: file.name, savedAt: Date.now(), pairs: pollResult.pairs });
        setRecent(getSavedDocuments());
        loadPairs(pollResult.pairs);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsUploading(false);
        setStatusMsg(null);
      }
    },
    [loadPairs, language, tr.extracting],
  );

  const handleDelete = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteDocument(hash);
    setRecent(getSavedDocuments());
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: isUploading,
    onDropAccepted: ([file]) => handleFile(file),
    onDropRejected: () => setError(tr.pdfOnly),
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 pt-8 overflow-y-auto">
      <div className="w-full max-w-lg">
        <p className="text-center text-gray-500 mb-6">{tr.uploadSubtitle}</p>

        {/* Resume card */}
        {draft && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">📋</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">{tr.resumeTitle}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {tr.resumeProgress(draft.currentIndex, draft.totalCount)}
                  </p>
                  <p className="text-xs text-amber-500 mt-0.5">
                    {formatRelativeTime(draft.savedAt, language)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismissDraft}
                className="text-amber-400 hover:text-amber-600 transition-colors text-lg leading-none shrink-0"
                title={tr.resumeDismiss}
              >
                ×
              </button>
            </div>
            <button
              onClick={handleResume}
              disabled={isResuming}
              className="mt-3 w-full py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-60 text-sm"
            >
              {isResuming ? '...' : tr.resumeButton}
            </button>
          </div>
        )}

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'
          } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600">{statusMsg ?? tr.extracting}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="text-5xl">📄</div>
              <p className="text-gray-700 font-medium">
                {isDragActive ? tr.dropzoneActive : tr.dropzone}
              </p>
              <p className="text-sm text-gray-400">{tr.dropzoneHint}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {language === 'es' ? 'Documentos recientes' : 'Recent documents'}
            </h3>
            <div className="space-y-2">
              {recent.map((doc) => (
                <div
                  key={doc.hash}
                  onClick={() => loadPairs(doc.pairs)}
                  className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <span className="text-2xl shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {doc.pairs.length}{' '}
                      {language === 'es' ? 'preguntas' : 'questions'}
                      {' · '}
                      {formatRelativeTime(doc.savedAt, language)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {language === 'es' ? 'Cargar' : 'Load'}
                    </span>
                    <button
                      onClick={(e) => handleDelete(doc.hash, e)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                      title={language === 'es' ? 'Eliminar' : 'Remove'}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
