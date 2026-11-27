// AUTO-GENERATED from packages/brand/brand.json — do not edit by hand. Run: node packages/brand/scripts/sync.mjs
export interface BrandAppMap { csv: string; auto: string; md: string; ipd: string; chip: string; pharm: string; air: string }
export interface Brand {
  version: string;
  visual: string; legal: string; zh: string; code: string; tagline: string;
  fallbackVisual: string; app: BrandAppMap; appZh: BrandAppMap;
  colors: { bg: string; card: string; accent: string; text: string; muted: string };
}
export const BRAND: Brand = {
  "version": "1.0.0",
  "visual": "tuoleX",
  "legal": "TUOLEX",
  "zh": "妥了",
  "code": "tuolex",
  "tagline": "合规数字化工作台",
  "fallbackVisual": "tuolix",
  "app": {
    "csv": "tuolecsv",
    "auto": "tuoleauto",
    "md": "tuolemd",
    "ipd": "tuoleipd",
    "chip": "tuolechip",
    "pharm": "tuolepharm",
    "air": "tuoleair"
  },
  "appZh": {
    "csv": "妥了 · 制药 CSV",
    "auto": "妥了 · 汽车",
    "md": "妥了 · 医疗器械",
    "ipd": "妥了 · 集成产品开发",
    "chip": "妥了 · 芯片",
    "pharm": "妥了 · 药品研发",
    "air": "妥了 · 航空"
  },
  "colors": {
    "bg": "#05070d",
    "card": "#0a111b",
    "accent": "#3dd6a8",
    "text": "#e8eef5",
    "muted": "#8ea6bb"
  }
};

/** i18next 插值变量（扁平键，保证 \{\{brandCsv\}\} 这类写法稳定可解析） */
export const BRAND_VARS: Record<string, string> = {
  "brand": "tuoleX",
  "brandLegal": "TUOLEX",
  "brandZh": "妥了",
  "brandCode": "tuolex",
  "brandTagline": "合规数字化工作台",
  "brandCsv": "tuolecsv",
  "brandAuto": "tuoleauto",
  "brandMd": "tuolemd",
  "brandIpd": "tuoleipd",
  "brandChip": "tuolechip",
  "brandPharm": "tuolepharm",
  "brandAir": "tuoleair"
};
