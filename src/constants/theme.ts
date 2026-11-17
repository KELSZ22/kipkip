import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1C1E',
    background: '#FBFAF7',
    backgroundElement: '#F0EEE8',
    backgroundSelected: '#E2DFD6',
    textSecondary: '#5C5F66',
    border: '#D6D3CA',
    accent: '#0F6F66',
    onAccent: '#FFFFFF',
    danger: '#B3261E',
  },
  dark: {
    text: '#F2F1EE',
    background: '#121314',
    backgroundElement: '#1F2022',
    backgroundSelected: '#2E3032',
    textSecondary: '#B4B6BA',
    border: '#3A3C3F',
    accent: '#5FD3C6',
    onAccent: '#06211E',
    danger: '#F2B8B5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Android's minimum recommended touch target. */
export const MinTouchTarget = 48;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
