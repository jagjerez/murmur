import type { CSSProperties } from 'react';

/** Anclas posibles dentro del viewport (la colocación nativa real es F11). */
export type Anchor = 'bottom-center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const ANCHORS: readonly Anchor[] = [
  'bottom-center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

const GAP = 'var(--mur-anchor-gap)';

/** Estilo de posición fija para un ancla; centra con transform en bottom-center. */
export function anchorStyle(anchor: Anchor): CSSProperties {
  const base: CSSProperties = { position: 'fixed' };

  switch (anchor) {
    case 'bottom-center':
      return { ...base, bottom: GAP, left: '50%', transform: 'translateX(-50%)' };
    case 'top-left':
      return { ...base, top: GAP, left: GAP };
    case 'top-right':
      return { ...base, top: GAP, right: GAP };
    case 'bottom-left':
      return { ...base, bottom: GAP, left: GAP };
    case 'bottom-right':
      return { ...base, bottom: GAP, right: GAP };
  }
}
