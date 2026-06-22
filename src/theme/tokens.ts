/**
 * Design tokens — single source of truth for all visual constants.
 *
 * Aligned with xopc DESIGN.md: "Calm Intelligence" — neutral surfaces dominate,
 * Loop Blue is the primary direction/focus signal, semantic colors are status-only.
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

export type OverlayColors = {
  scrim: string;
};

export type ColorScheme = {
  surface: SurfaceColors;
  text: TextColors;
  border: BorderColors;
  accent: AccentColors;
  semantic: SemanticColors;
  overlay: OverlayColors;
};

// ── Surface & Layer ─────────────────────────────────────────

const lightSurface: SurfaceColors = {
  base: '#FFFFFF',
  panel: '#FAFAFA',
  input: '#FAFAFA',
  hover: '#F4F6FF',
  active: '#EEF2FF',
};

const darkSurface: SurfaceColors = {
  base: '#0A0A0A',
  panel: '#121212',
  input: '#1A1A1A',
  hover: '#1A1A1A',
  active: '#202020',
};

// ── Text ────────────────────────────────────────────────────

const lightText: TextColors = {
  primary: '#111111',
  secondary: '#666666',
  tertiary: '#999999',
  disabled: '#B7B7B7',
  inverse: '#FFFFFF',
};

const darkText: TextColors = {
  primary: '#F5F5F5',
  secondary: '#A1A1A1',
  tertiary: '#666666',
  disabled: '#4F4F4F',
  inverse: '#000000',
};

// ── Border ──────────────────────────────────────────────────

const lightBorder: BorderColors = {
  subtle: '#F1F1F1',
  default: '#ECECEC',
  strong: '#D8DCE8',
};

const darkBorder: BorderColors = {
  subtle: '#1A1A1A',
  default: '#222222',
  strong: '#333333',
};

// ── Accent & Semantic ───────────────────────────────────────

const lightAccent: AccentColors = {
  primary: '#3A6BFF',
  primaryHover: '#2F55D6',
  selectionBg: 'rgba(58,107,255,0.10)',
  soft: '#EEF2FF',
};

const darkAccent: AccentColors = {
  primary: '#3A6BFF',
  primaryHover: '#6F91FF',
  selectionBg: 'rgba(58,107,255,0.18)',
  soft: '#151A2B',
};

export const semantic = {
  success: { light: '#2CCB7F', dark: '#2CCB7F' },
  warning: { light: '#FFB84D', dark: '#FFB84D' },
  error: { light: '#FF5D5D', dark: '#FF5D5D' },
  errorBold: { light: '#E5484D', dark: '#FF6B6B' },
  info: { light: '#3A6BFF', dark: '#6F91FF' },
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
  overlay: {
    scrim: 'rgba(0,0,0,0.28)',
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
  overlay: {
    scrim: 'rgba(0,0,0,0.52)',
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
