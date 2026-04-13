import { useQuizStore } from '../store/quizStore';
import type { Lang } from '../i18n';

const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'es', label: 'ES' },
];

export function LanguageToggle() {
  const { language, setLanguage } = useQuizStore();

  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
      {LANGUAGES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setLanguage(value)}
          className={`px-3 py-1.5 font-medium transition-colors ${
            language === value
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
