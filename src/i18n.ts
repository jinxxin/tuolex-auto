// 国际化初始化：i18next + 双语字典（zh/en 静态打包，默认中文，localStorage 记忆）
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import zh from './locales/zh.json';
import en from './locales/en.json';
import { BRAND_VARS } from './brand';

export const LANG_KEY = 'tuolex_lang';

function detectLng(): 'zh' | 'en' {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s === 'en' || s === 'zh') return s;
  } catch { /* SSR/隐私模式忽略 */ }
  return 'zh'; // 默认中文
}

i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: detectLng(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false, defaultVariables: BRAND_VARS },
});

export function isEn() {
  return (i18n.language || '').toLowerCase().startsWith('en');
}

export function setLang(l: 'zh' | 'en') {
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  dayjs.locale(l === 'zh' ? 'zh-cn' : 'en');
  i18n.changeLanguage(l);
}

// 初始化时同步 <html lang> 与 dayjs locale
document.documentElement.lang = detectLng();
dayjs.locale(detectLng() === 'zh' ? 'zh-cn' : 'en');

export default i18n;
