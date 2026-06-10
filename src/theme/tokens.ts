/**
 * Design tokens — single source of truth for all visual constants.
 *
 * Aligned with xopc DESIGN.md: "Calm Intelligence" — neutral grays dominate,
 * blue is the sole accent signal, semantic colors are status-only.
 *
 * Usage:
 *   import { colors, spacing, radii, typography } from '../theme/tokens';
 *   const bg = colors[isDark ? 'dark' : 'light'].surface.base;
 */

// ── Structural types ────────────────────────────────────────

export type SurfaceColors = {
  /** App background / grouped sections */
  base: string;
  /** Cards, panels, elevated content */
  panel: string;
  /** Input fields, composer shell */
  input: string;
  /** Hover / pressed state */
  hover: string;
  /** Active / strong selection */
  active: string;
};

export type TextColors = {
  primary: string;
  secondary: string;
  tertiary: string;
  disabled: string;
  inverse: string;
};

export type BorderColors = {
  subtle: string;
  default: string;
  strong: string;
};

export type AccentColors = {
  primary: string;
  primaryHover: string;
  /** Selection highlight background */
  selectionBg: string;
  /** Soft accent tint for cards / highlights (e.g. Today Brief) */
  soft: string;
};

export type SemanticColors = {
  success: string;
  warning: string;
  error: string;
  errorBold: string;
  info: string;
};

export type ColorScheme = {
  surface: SurfaceColors;
  text: TextColors;
  border: BorderColors;
  accent: AccentColors;
  semantic: SemanticColors;
};

// ── Surface & Layer ─────────────────────────────────────────

const lightSurface: SurfaceColors = {
  base: '#F5F5F7',
  panel: '#FFFFFF',
  /** White panel on grouped base — clearer field edges than same-as-base gray */
  input: '#FFFFFF',
  hover: '#E8E8ED',
  active: '#DCDCDE',
};

const darkSurface: SurfaceColors = {
  base: '#000000',
  panel: '#1C1C1E',
  input: '#2C2C2E',
  hover: '#3A3A3C',
  active: '#48484A',
};

// ── Text ────────────────────────────────────────────────────

const lightText: TextColors = {
  primary: '#1D1D1F',
  secondary: '#6E6E73',
  tertiary: '#86868B',
  disabled: '#AEAEB2',
  inverse: '#FFFFFF',
};

const darkText: TextColors = {
  primary: '#F5F5F7',
  secondary: '#A1A1A6',
  tertiary: '#8E8E93',
  disabled: '#636366',
  inverse: '#000000',
};

// ── Border ──────────────────────────────────────────────────

const lightBorder: BorderColors = {
  subtle: '#EBEBED',
  default: '#D2D2D7',
  strong: '#BCBCC0',
};

const darkBorder: BorderColors = {
  subtle: '#2C2C2E',
  default: '#38383A',
  strong: '#48484A',
};

// ── Accent & Semantic ───────────────────────────────────────

const lightAccent: AccentColors = {
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  selectionBg: 'rgba(37,99,235,0.10)',
  soft: '#EFF6FF',
};

const darkAccent: AccentColors = {
  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  selectionBg: 'rgba(59,130,246,0.18)',
  soft: '#151B2B',
};

export const semantic = {
  success: { light: '#16A34A', dark: '#86EFAC' },
  warning: { light: '#D97706', dark: '#FCD34D' },
  error: { light: '#DC2626', dark: '#FCA5A5' },
  errorBold: { light: '#EF4444', dark: '#FF453A' },
  info: { light: '#2563EB', dark: '#93C5FD' },
} as const;

// ── Composed palette per scheme ─────────────────────────────

export const lightColors: ColorScheme = {
  surface: lightSurface,
  text: lightText,
  border: lightBorder,
  accent: lightAccent,
  semantic: {
    success: semantic.success.light,
    warning: semantic.warning.light,
    error: semantic.error.light,
    errorBold: semantic.errorBold.light,
    info: semantic.info.light,
  },
};

export const darkColors: ColorScheme = {
  surface: darkSurface,
  text: darkText,
  border: darkBorder,
  accent: darkAccent,
  semantic: {
    success: semantic.success.dark,
    warning: semantic.warning.dark,
    error: semantic.error.dark,
    errorBold: semantic.errorBold.dark,
    info: semantic.info.dark,
  },
};

export const colors = { light: lightColors, dark: darkColors } as const;

// ── Spacing (8pt grid) ──────────────────────────────────────

export const spacing = {
  /** 2px */
  xxs: 2,
  /** 4px */
  xs: 4,
  /** 8px */
  sm: 8,
  /** 12px */
  md: 12,
  /** 16px */
  lg: 16,
  /** 24px */
  xl: 24,
  /** 32px */
  xxl: 32,
  /** 48px */
  xxxl: 48,
} as const;

// ── Border Radius ───────────────────────────────────────────

export const radii = {
  /** 6px — tags, small badges */
  sm: 6,
  /** 10px — chips, list items */
  md: 10,
  /** 14px — cards, dialogs */
  lg: 14,
  /** 18px — panels, modals */
  xl: 18,
  /** 22px — composer, buttons */
  xxl: 22,
  /** Full pill */
  full: 9999,
} as const;

// ── Typography ──────────────────────────────────────────────

export const typography = {
  /** 30px — welcome/empty state hero */
  display: { fontSize: 30, lineHeight: 36, fontWeight: '600' as const },
  /** 20px — page/modal titles */
  title: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  /** 17px — section titles */
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  /** 15px — body, main UI text */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  /** 14px — UI controls, buttons */
  ui: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  /** 13px — secondary labels */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  /** 12px — timestamps, metadata */
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '400' as const },
  /** 11px — tiny badges, micro-copy */
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const },
} as const;
