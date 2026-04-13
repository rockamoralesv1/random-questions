import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadPDF } from '../api/quizApi';
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
import type { QAPair } from '../types';

export function UploadZone() {
  const { setPairs, setView, language } = useQuizStore();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SavedDocument[]>([]);
  const tr = translations[language];

  useEffect(() => {
    setRecent(getSavedDocuments());
  }, []);

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

      // 1. Compute hash client-side — check localStorage first
      let hash: string;
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

      // 2. Upload to server (server also has an in-memory extraction cache)
      setIsUploading(true);
      try {
        const data = await uploadPDF(file);

        // 3. Persist to localStorage for future loads
        saveDocument({
          hash: data.hash || hash,
          fileName: file.name,
          savedAt: Date.now(),
          pairs: data.pairs,
        });
        setRecent(getSavedDocuments());

        loadPairs(data.pairs);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsUploading(false);
      }
    },
    [loadPairs],
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

        {/* Drop zone */}
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
              <p className="text-gray-600">{tr.extracting}</p>
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

        {/* Recent documents */}
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
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {doc.fileName}
                    </p>
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
