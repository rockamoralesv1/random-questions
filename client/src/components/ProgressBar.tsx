import { translations } from '../i18n';
import type { Lang } from '../i18n';

interface ProgressBarProps {
  current: number;
  total: number;
  lang: Lang;
}

export function ProgressBar({ current, total, lang }: ProgressBarProps) {
  const tr = translations[lang];
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-500 mb-1">
        <span>{tr.questionOf(current, total)}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
