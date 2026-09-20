/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * Please follow the figma design for a better look on how to use the colors
 */
 
import '@/global.css';
 
import { Platform } from 'react-native';
 
export const Colors = {
  light: {
    onPrimary: '#FFFFFF',
    text: '#16231B',
    background: '#FFFFFF',
    backgroundElement: '#F5F7F5',
    backgroundSelected: '#E5EBE7',
    textSecondary: '#69766E',
 
    primary: '#185D3D',
    primaryDark: '#11482F',
    primaryLight: '#E8F4EC',
 
    success: '#2F8B57',
    warning: '#C9892B',
    warningLight: '#FFF3D6',
    danger: '#D84F4F',
    dangerLight: '#FDE9E9',
 
    accentMintBg: '#E7F4EB',
    accentMintIcon: '#1F6B46',
    accentPeachBg: '#FAEBDD',
    accentPeachIcon: '#C97D37',
    accentSkyBg: '#E4F0F8',
    accentSkyIcon: '#4A7FA8',
    accentLavenderBg: '#EEE8F7',
    accentLavenderIcon: '#8067A9',
    accentBlushBg: '#F8E7EF',
    accentBlushIcon: '#B75D83',
  },
  dark: {
    onPrimary: '#FFFFFF',
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
 
    primary: '#2F9E58',
    primaryDark: '#1F6B42',
    primaryLight: '#1E3A2A',
 
    success: '#27AE60',
    warning: '#F2994A',
    warningLight: '#3A2A1A',
    danger: '#EB5757',
    dangerLight: '#3A2020',
 
    accentMintBg: '#1E3A2A',
    accentMintIcon: '#4CBF7A',
    accentPeachBg: '#3A2A1A',
    accentPeachIcon: '#E8934A',
    accentSkyBg: '#1A2A3A',
    accentSkyIcon: '#6BA8EE',
    accentLavenderBg: '#2A1E3A',
    accentLavenderIcon: '#B08AF0',
    accentBlushBg: '#3A1E2E',
    accentBlushIcon: '#EC7DB0',
  },
} as const;

export type ThemeColor =
  keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Georgia',
    rounded: 'System',
    mono: 'Menlo',
  },
  android: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif',
    mono: 'monospace',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-display)',
    mono: 'var(--font-mono)',
  },
});

export const Typography = {
  screenTitle: {
    fontFamily: Fonts.sans,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.35,
  },
  pageTitle: {
    fontFamily: Fonts.sans,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800' as const,
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700' as const,
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  button: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700' as const,
  },
  caption: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400' as const,
  },
  badge: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700' as const,
  },
} as const;

export const Radius = {
  small: 10,
  control: 14,
  card: 18,
  large: 22,
  sheet: 28,
  pill: 999,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset =
  Platform.select({ ios: 50, android: 80 }) ?? 0;

export const MaxContentWidth = 800;