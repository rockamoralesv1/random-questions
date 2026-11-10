import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  uploadPDF,
  startQuizSession,
  getDocument,
  listDocuments,
  removeDocument,
  importDocument,
  getServerConfig,
  getActiveQuiz,
  discardQuiz,
} from '../api/quizApi';
import { useQuizStore } from '../store/quizStore';
import { translations } from '../i18n';
import {
  getSavedDocuments,
  deleteDocument as deleteLocalDocument,
  formatRelativeTime,
  type SavedDocument,
} from '../lib/storage';
import { getDraftSession, clearDraftSession, type DraftSession } from '../lib/draftSession';
import { getClientId, normalizePersonalCode, setClientId } from '../lib/clientId';
import { pollDocument } from '../lib/documentPoller';
import { shareCodeFor, copyToClipboard } from '../lib/shareCode';
import type { ActiveQuiz, ClientDocument, DocumentRole, DocumentState, QAPair } from '../types';

/** Quiz to resume: saved on the server, or a legacy one from localStorage. */
type ResumableQuiz = { kind: 'server'; quiz: ActiveQuiz } | { kind: 'local'; draft: DraftSession };

/** A row in "Recent documents": a server bank, or a legacy browser-only one. */
type RecentDoc =
  | ({ kind: 'server' } & ClientDocument)
  | ({ kind: 'local' } & SavedDocument);

export function UploadZone() {
  const { setPairs, setView, language, setSession, setCurrentQuestion, setQuizMode, applyDocumentState } =
    useQuizStore();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentDoc[]>([]);
  const [draft, setDraft] = useState<ResumableQuiz | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [clientId, setClientIdState] = useState(getClientId);
  const [aiEnabled, setAiEnabled] = useState(true);
  const tr = translations[language];
  const es = language === 'es';

  const refreshRecent = useCallback(async () => {
    const local = getSavedDocuments();
    try {
      const server = await listDocuments();
      const serverHashes = new Set(server.map((d) => d.hash));
      setRecent([
        ...server.map((d) => ({ kind: 'server' as const, ...d })),
        // Banks saved only in this browser before the database existed
        ...local.filter((d) => !serverHashes.has(d.hash)).map((d) => ({ kind: 'local' as const, ...d })),
      ]);
    } catch {
      setRecent(local.map((d) => ({ kind: 'local' as const, ...d })));
    }
  }, []);

  useEffect(() => {
    void getServerConfig().then((c) => setAiEnabled(c.aiEnabled));
  }, []);

  useEffect(() => {
    void refreshRecent();
    let cancelled = false;
    getActiveQuiz()
      .catch(() => null)
      .then((quiz) => {
        if (cancelled) return;
        if (quiz) return setDraft({ kind: 'server', quiz });
        const local = getDraftSession(); // saved before quizzes moved to the server
        setDraft(local ? { kind: 'local', draft: local } : null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshRecent, clientId]);

  const handleResume = useCallback(async () => {
    if (!draft) return;
    setIsResuming(true);
    try {
      if (draft.kind === 'server') {
        const { quiz } = draft;
        setSession(quiz.sessionId, quiz.pairs, quiz.totalCount);
        setCurrentQuestion(quiz.currentIndex, quiz.question, quiz.totalCount);
        setQuizMode(quiz.quizMode);
        setView('quiz');
        return;
      }

      // Legacy localStorage draft: its in-memory server session is gone after
      // the move to the database, so start a new (saved) quiz with the
      // questions that were left.
      const local = draft.draft;
      clearDraftSession();
      const remainingPairs = local.pairs.slice(local.currentIndex);
      if (remainingPairs.length === 0) {
        setDraft(null);
        return;
      }
      const session = await startQuizSession(remainingPairs, local.quizMode);
      setSession(session.sessionId, remainingPairs, session.totalCount);
      setCurrentQuestion(session.currentIndex, session.question, session.totalCount);
      setQuizMode(local.quizMode);
      setView('quiz');
    } catch {
      setIsResuming(false);
    }
  }, [draft, setSession, setCurrentQuestion, setQuizMode, setView]);

  const handleDismissDraft = () => {
    if (draft?.kind === 'server') void discardQuiz(draft.quiz.sessionId);
    else clearDraftSession();
    setDraft(null);
  };

  /** Shows a server bank in the preview, polling while it is still extracting. */
  const openDocument = useCallback(
    (state: DocumentState, fileName: string, role: DocumentRole) => {
      if (state.status === 'error' && state.pairs.length === 0) {
        setError(state.error ?? (es ? 'No se pudieron extraer preguntas.' : 'Extraction failed.'));
        return;
      }
      applyDocumentState(state, fileName, role);
      if (state.status === 'processing') pollDocument(state.hash, fileName);
      setView('preview');
    },
    [applyDocumentState, setView, es],
  );

  const loadLocalPairs = (pairs: QAPair[]) => {
    setPairs(pairs);
    setView('preview');
  };

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);
      try {
        // Responds immediately; the preview fills in as chunks finish.
        openDocument(await uploadPDF(file), file.name, 'owner');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsUploading(false);
      }
    },
    [openDocument],
  );

  const handleOpenRecent = async (doc: RecentDoc) => {
    setError(null);
    if (doc.kind === 'local') return loadLocalPairs(doc.pairs);
    try {
      openDocument(await getDocument(doc.hash), doc.fileName, doc.role);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (doc: RecentDoc, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteLocalDocument(doc.hash);
    if (doc.kind === 'server') await removeDocument(doc.hash).catch(() => {});
    void refreshRecent();
  };

  const handleCopy = async (text: string, key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (await copyToClipboard(text)) {
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    }
  };

  // One field accepts both kinds of code: a personal code (XXXX-XXXX-XXXX-XXXX)
  // restores a whole list; a share code (12+ hex chars) adds one bank.
  const handleCode = async () => {
    const input = codeInput.trim();
    if (!input) return;
    setCodeMsg(null);

    if (/^[0-9a-f]{12,64}$/i.test(input)) {
      try {
        const state = await importDocument(input);
        setCodeInput('');
        await refreshRecent();
        openDocument(state, '', 'shared');
      } catch (err) {
        setCodeMsg({ ok: false, text: (err as Error).message });
      }
      return;
    }

    const personal = normalizePersonalCode(input);
    if (!personal) {
      setCodeMsg({ ok: false, text: es ? 'Código no válido' : 'Invalid code' });
      return;
    }
    setClientId(personal);
    setClientIdState(personal); // triggers refreshRecent
    setCodeInput('');
    setCodeMsg({ ok: true, text: es ? 'Lista recuperada' : 'List restored' });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: isUploading || !aiEnabled,
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
                    {draft.kind === 'server'
                      ? tr.resumeProgress(draft.quiz.currentIndex, draft.quiz.totalCount)
                      : tr.resumeProgress(draft.draft.currentIndex, draft.draft.totalCount)}
                  </p>
                  <p className="text-xs text-amber-500 mt-0.5">
                    {formatRelativeTime(
                      draft.kind === 'server' ? draft.quiz.updatedAt : draft.draft.savedAt,
                      language,
                    )}
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
              <p className="text-gray-600">{es ? 'Subiendo PDF…' : 'Uploading PDF…'}</p>
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

        {!aiEnabled && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            {es
              ? 'La IA está deshabilitada en el servidor: no se pueden procesar PDFs nuevos. Puedes usar tus bancos guardados o cargar uno con un código.'
              : 'AI is disabled on the server: new PDFs can’t be processed. You can still use saved banks or load one by code.'}
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Codes: load a shared bank or restore a list */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => { setCodeInput(e.target.value); setCodeMsg(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCode(); }}
              placeholder={es ? 'Pega un código de banco o tu código personal' : 'Paste a bank code or your personal code'}
              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <button
              onClick={() => void handleCode()}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shrink-0"
            >
              {es ? 'Cargar' : 'Load'}
            </button>
          </div>
          {codeMsg && (
            <p className={`text-xs ${codeMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{codeMsg.text}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span>{es ? 'Tu código personal:' : 'Your personal code:'}</span>
            <code className="font-mono font-semibold text-gray-700 bg-gray-100 rounded px-1.5 py-0.5">{clientId}</code>
            <button
              onClick={(e) => void handleCopy(clientId, 'personal', e)}
              className="text-blue-600 hover:underline"
            >
              {copied === 'personal' ? (es ? '¡Copiado!' : 'Copied!') : es ? 'Copiar' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            {es
              ? 'Guárdalo para recuperar tus bancos en otro navegador. No lo compartas: para compartir un banco usa su código.'
              : 'Keep it to restore your banks on another browser. Don’t share it — to share a bank, use its code.'}
          </p>
        </div>

        {recent.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {es ? 'Documentos recientes' : 'Recent documents'}
            </h3>
            <div className="space-y-2">
              {recent.map((doc) => {
                const count = doc.kind === 'server' ? doc.questionCount : doc.pairs.length;
                const processing =
                  doc.kind === 'server' && doc.doneChunks + doc.failedChunks < doc.totalChunks;
                const code = shareCodeFor(doc.hash);
                return (
                  <div
                    key={doc.hash}
                    onClick={() => void handleOpenRecent(doc)}
                    className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                  >
                    <span className="text-2xl shrink-0">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {count} {es ? 'preguntas' : 'questions'}
                        {processing &&
                          (es
                            ? ` · procesando ${doc.doneChunks + doc.failedChunks}/${doc.totalChunks}`
                            : ` · processing ${doc.doneChunks + doc.failedChunks}/${doc.totalChunks}`)}
                        {doc.kind === 'server' && doc.failedChunks > 0 && !processing &&
                          (es ? ` · ${doc.failedChunks} parte(s) con error` : ` · ${doc.failedChunks} part(s) failed`)}
                        {' · '}
                        {formatRelativeTime(doc.savedAt, language)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.kind === 'server' && (
                        <button
                          onClick={(e) => void handleCopy(code, doc.hash, e)}
                          className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                          title={es ? `Copiar código para compartir: ${code}` : `Copy share code: ${code}`}
                        >
                          {copied === doc.hash ? (es ? '¡Copiado!' : 'Copied!') : es ? 'Compartir' : 'Share'}
                        </button>
                      )}
                      <button
                        onClick={(e) => void handleDelete(doc, e)}
                        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                        title={es ? 'Quitar de la lista' : 'Remove from list'}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
