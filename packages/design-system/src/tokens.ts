export const color = {
  accent: {
    50: '#FBF0E8',
    100: '#F4D4C0',
    200: '#EAB497',
    400: '#E0916B',
    600: '#CF7350',
    700: '#B15A3C',
    900: '#8A4530',
  },
  state: {
    idle: '#9A9088',
    listening: '#E0916B',
    thinking: '#B79BE8',
    speaking: '#E6B450',
    error: '#D8584E',
  },
  dark: {
    surface: '#16141C',
    surfaceRaised: '#241F2B',
    text: '#F4F1EC',
    textMuted: '#9A9088',
    border: 'rgba(255, 255, 255, 0.10)',
    glass: 'rgba(34, 28, 27, 0.82)',
  },
  light: {
    surface: '#F3EFE9',
    surfaceRaised: '#FFFDFA',
    text: '#2A2420',
    textMuted: '#6A635C',
    border: 'rgba(0, 0, 0, 0.08)',
    glass: 'rgba(255, 253, 250, 0.78)',
  },
} as const;

export const font = {
  ui: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  size: { xs: '11px', sm: '13px', base: '15px', lg: '18px', xl: '24px', '2xl': '32px' },
  weight: { regular: 400, medium: 500, semibold: 600 },
} as const;

export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
} as const;

export const radius = { sm: '8px', md: '12px', lg: '18px', full: '999px' } as const;

export const shadow = {
  glass: '0 12px 40px rgba(0, 0, 0, 0.45)',
  glassLight: '0 12px 40px rgba(140, 110, 90, 0.18)',
} as const;

export const motion = {
  duration: { fast: '120ms', base: '200ms', slow: '400ms' },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

export const tokens = { color, font, space, radius, shadow, motion } as const;
