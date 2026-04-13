import { useQuizStore } from '../store/quizStore';
import { translations } from '../i18n';
import { LanguageToggle } from './LanguageToggle';

export function Header() {
  const { language, view, reset } = useQuizStore();
  const tr = translations[language];

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
        <button
          onClick={reset}
          className="text-lg font-bold text-gray-800 hover:text-blue-600 transition-colors"
          title="Back to start"
        >
          {tr.appTitle}
        </button>

        <div className="flex items-center gap-4">
          {view === 'quiz' && (
            <button
              onClick={reset}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              ✕
            </button>
          )}
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
