import { TextStyle } from 'react-native';

// ════════════════════════════════════════════════════════════
// OSPOS Design System v2.1 — "Liquid Glass"
// Dark venue-mode. Works in bright sunlight AND dim bars.
// ════════════════════════════════════════════════════════════

export const fonts = {
  // Inter: sans-serif — body, headers, buttons, labels, numbers.
  // One UI font for the whole app.
  display: 'Inter_700Bold',
  displaySemiBold: 'Inter_600SemiBold',
  body: 'Inter_500Medium',
  bodyRegular: 'Inter_400Regular',
  // Bitter italic stays for menu-tile monogram letters — slab serif italic
  // is OSPOS's signature visual for empty/single-letter glyphs and Inter
  // doesn't ship italic in our default load.
  bodyItalic: 'Bitter_500Medium_Italic',

  // DM Serif Display: reserved for display moments only — hero totals,
  // page titles like "Sales" and "Settings", "Payment received". Never
  // used in lists, buttons, body text, or anything dense.
  displaySerif: 'DMSerifDisplay_400Regular',

  // Numbers map to Inter at appropriate weights. Tabular-nums applied
  // per-usage via fontVariant: ['tabular-nums'] for alignment in grids.
  num: 'Inter_700Bold',
  numSemiBold: 'Inter_600SemiBold',
  numMedium: 'Inter_500Medium',
  numRegular: 'Inter_400Regular',

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
  // PAGE TITLES — DM Serif Display, reserved for display moments
  largeTitle: { fontSize: 34, fontFamily: fonts.displaySerif, color: colors.text, letterSpacing: -0.5 },
  title1: { fontSize: 28, fontFamily: fonts.displaySerif, color: colors.text, letterSpacing: -0.4 },

  // SECONDARY HEADINGS — Inter SemiBold (functional, not display)
  title2: { fontSize: 22, fontFamily: fonts.displaySemiBold, color: colors.text },
  title3: { fontSize: 20, fontFamily: fonts.displaySemiBold, color: colors.text },

  // BODY — Inter
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

  // HERO DISPLAY NUMBERS — DM Serif Display, the "display moments":
  // PaymentScreen total, ReceiptScreen amount, SummaryScreen total sales.
  displayHero: { fontSize: 56, fontFamily: fonts.displaySerif, color: colors.text, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  displayLarge: { fontSize: 44, fontFamily: fonts.displaySerif, color: colors.text, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  displayMedium: { fontSize: 30, fontFamily: fonts.displaySerif, color: colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },

  // FUNCTIONAL NUMBERS — Inter with tabular-nums. Used in lists, totals,
  // anywhere a number sits next to a label (not the hero of the screen).
  price: { fontSize: 20, fontFamily: fonts.num, color: colors.primary, fontVariant: ['tabular-nums'] },
  total: { fontSize: 32, fontFamily: fonts.num, color: colors.text, fontVariant: ['tabular-nums'] },
  priceSmall: { fontSize: 15, fontFamily: fonts.numSemiBold, color: colors.primary, fontVariant: ['tabular-nums'] },
  priceMuted: { fontSize: 15, fontFamily: fonts.numMedium, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  statNumber: { fontSize: 22, fontFamily: fonts.num, color: colors.primary, fontVariant: ['tabular-nums'] },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const borderRadius = { sm: 6, md: 10, lg: 14, xl: 20 } as const;
export const touchTargets = { minimum: 48, chargeButton: 56 } as const;
