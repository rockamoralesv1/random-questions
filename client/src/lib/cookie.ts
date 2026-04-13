import type { Lang } from '../i18n';

const LANG_COOKIE = 'quiz_lang';
const ONE_YEAR_S = 60 * 60 * 24 * 365;

export function getLangCookie(): Lang {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|; )quiz_lang=([^;]*)/);
  const val = match ? decodeURIComponent(match[1]) : null;
  return val === 'es' ? 'es' : 'en';
}

export function setLangCookie(lang: Lang): void {
  document.cookie = `${LANG_COOKIE}=${lang}; max-age=${ONE_YEAR_S}; path=/; SameSite=Strict`;
}
