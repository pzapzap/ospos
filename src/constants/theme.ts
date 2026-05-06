import { TextStyle } from 'react-native';

// ════════════════════════════════════════════════════════════
// OSPOS Design System v2.1 — "Liquid Glass"
// Dark venue-mode. Works in bright sunlight AND dim bars.
// ════════════════════════════════════════════════════════════

export const fonts = {
  // Bitter: slab serif — body, headers, buttons, labels
  display: 'Bitter_700Bold',
  displaySemiBold: 'Bitter_600SemiBold',
  body: 'Bitter_500Medium',
  bodyRegular: 'Bitter_400Regular',
  bodyItalic: 'Bitter_500Medium_Italic',

  // Archivo: grotesque sans — ALL prices, totals, dollar amounts
  num: 'Archivo_700Bold',
  numSemiBold: 'Archivo_600SemiBold',
  numMedium: 'Archivo_500Medium',
  numRegular: 'Archivo_400Regular',

  // JetBrains Mono: eyebrows, IDs, timestamps, technical metadata
  mono: 'JetBrainsMono_500Medium',
} as const;

export const colors = {
  // Surface system — "venue mode"
  background: '#09090B',
  surface: '#18181B',
  surfaceLight: '#27272A',
  border: '#27272A',

  // Text hierarchy
  text: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted: '#8E8E93',

  // Primary action — cyan
  primary: '#22D3EE',
  primaryDark: '#06B6D4',
  primaryLight: 'rgba(34,211,238,0.15)',

  // Semantic
  success: '#22D3EE',
  successLight: 'rgba(34,211,238,0.12)',
  danger: '#EF4444',
  dangerDark: '#B83838',
  dangerLight: 'rgba(239,68,68,0.12)',
  warning: '#F59E0B',
  warningLight: 'rgba(245,158,11,0.12)',
  green: '#34C759',
  greenDark: '#1F9D44',

  // Functional
  cash: '#F59E0B',
  cashDark: '#C77C0A',
  card: '#18181B',
  cardHighlight: '#27272A',
  disabled: '#3F3F46',

  // Accent — warm sand/gold
  accent: '#D4A574',
  accentDark: '#B8895E',
  accentLight: 'rgba(212,165,116,0.1)',

  // Tinted surfaces — pre-computed amber/gold over surface (no color-mix in RN)
  surfaceCash: '#221F1B',
  surfacePremium: '#1F1D1B',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export const typography: Record<string, TextStyle> = {
  largeTitle: { fontSize: 34, fontFamily: fonts.display, color: colors.text },
  title1: { fontSize: 28, fontFamily: fonts.display, color: colors.text },
  title2: { fontSize: 22, fontFamily: fonts.displaySemiBold, color: colors.text },
  title3: { fontSize: 20, fontFamily: fonts.displaySemiBold, color: colors.text },
  body: { fontSize: 17, fontFamily: fonts.body, color: colors.text },
  bodyBold: { fontSize: 17, fontFamily: fonts.displaySemiBold, color: colors.text },
  caption: { fontSize: 13, fontFamily: fonts.bodyRegular, color: colors.textSecondary },

  // Eyebrow — JetBrains Mono caps for metadata above titles
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.mono,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },

  // NUMBER STYLES — Archivo
  price: { fontSize: 20, fontFamily: fonts.num, color: colors.primary },
  total: { fontSize: 32, fontFamily: fonts.num, color: colors.text },
  priceSmall: { fontSize: 15, fontFamily: fonts.numSemiBold, color: colors.primary },
  priceMuted: { fontSize: 15, fontFamily: fonts.numMedium, color: colors.textSecondary },
  statNumber: { fontSize: 22, fontFamily: fonts.num, color: colors.primary },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const borderRadius = { sm: 6, md: 10, lg: 14, xl: 20 } as const;
export const touchTargets = { minimum: 48, chargeButton: 56 } as const;
