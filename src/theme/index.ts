import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

export const lightPalette = {
  // Brand Primary (Deep Trustworthy Navy & Electric Royal Blue)
  navy900: '#0F172A',
  navy800: '#1E293B',
  navy700: '#334155',
  primary600: '#2563EB',
  primary500: '#3B82F6',
  primary100: '#DBEAFE',
  primary50: '#EFF6FF',

  // Semantic Inventory Status Colours
  // IN_STOCK (Emerald)
  success700: '#047857',
  success600: '#059669',
  success100: '#D1FAE5',
  success50: '#ECFDF5',

  // LOW_STOCK (Amber)
  warning700: '#B45309',
  warning600: '#D97706',
  warning100: '#FEF3C7',
  warning50: '#FFFBEB',

  // OUT_OF_STOCK (Crimson)
  danger700: '#B91C1C',
  danger600: '#DC2626',
  danger100: '#FEE2E2',
  danger50: '#FEF2F2',

  // Provenance Accents
  indigo700: '#4338CA',
  indigo100: '#E0E7FF',
  indigo50: '#EEF2FF',
  sky700: '#0369A1',
  sky100: '#E0F2FE',
  sky50: '#F0F9FF',

  // Neutrals (Light Mode: Dark Slate text on Crisp Light surfaces)
  slate900: '#0F172A',
  slate800: '#1E293B',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',
  white: '#FFFFFF',
};

export const darkPalette: typeof lightPalette = {
  // Brand Primary (Hero banners stay rich deep navy; primary accents brighten for dark contrast)
  navy900: '#020617',
  navy800: '#0F172A',
  navy700: '#1E293B',
  primary600: '#3B82F6',
  primary500: '#60A5FA',
  primary100: '#1E3A8A',
  primary50: '#172554',

  // Semantic Inventory Status Colours (Dark Mode tuned badges & text)
  // IN_STOCK (Emerald)
  success700: '#34D399',
  success600: '#10B981',
  success100: '#065F46',
  success50: '#064E3B',

  // LOW_STOCK (Amber)
  warning700: '#FBBF24',
  warning600: '#F59E0B',
  warning100: '#78350F',
  warning50: '#451A03',

  // OUT_OF_STOCK (Crimson)
  danger700: '#F87171',
  danger600: '#EF4444',
  danger100: '#7F1D1D',
  danger50: '#450A0A',

  // Provenance Accents
  indigo700: '#A5B4FC',
  indigo100: '#3730A3',
  indigo50: '#1E1B4B',
  sky700: '#7DD3FC',
  sky100: '#075985',
  sky50: '#082F49',

  // Neutrals (Dark Mode: Crisp light text on Deep Slate surfaces)
  slate900: '#F8FAFC',
  slate800: '#E2E8F0',
  slate700: '#CBD5E1',
  slate600: '#94A3B8',
  slate500: '#64748B',
  slate400: '#475569',
  slate300: '#334155',
  slate200: '#1E293B',
  slate100: '#0F172A',
  slate50: '#020617',
  white: '#0F172A',
};

let currentThemeMode: ThemeMode = 'light';
let currentIsDark = false;

/**
 * Live mutable `palette` object.
 * Mutating its keys in-place when switching between Light and Dark mode ensures that
 * both dynamic inline styles AND pre-created `StyleSheet.create(...)` objects across
 * every screen update to the active theme palette automatically when re-rendered.
 */
export const palette: typeof lightPalette = { ...lightPalette };

export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  try {
    return Appearance.getColorScheme() === 'dark';
  } catch {
    return false;
  }
}

export function applyThemePalette(mode: ThemeMode): boolean {
  currentThemeMode = mode;
  const isDark = resolveIsDark(mode);
  currentIsDark = isDark;
  const source = isDark ? darkPalette : lightPalette;
  (Object.keys(source) as (keyof typeof lightPalette)[]).forEach((key) => {
    palette[key] = source[key];
  });
  return isDark;
}

export function getActiveThemeMode(): ThemeMode {
  return currentThemeMode;
}

export function getIsDarkTheme(): boolean {
  return currentIsDark;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
};
