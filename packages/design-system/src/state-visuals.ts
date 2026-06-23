import type { AssistantState } from '@murmur/shared';
import { color } from './tokens';

export type StateAnimation = 'none' | 'breathe' | 'pulse' | 'equalize' | 'shake';

export interface StateVisual {
  color: string;
  animation: StateAnimation;
  label: string;
}

/** Única fuente de verdad del mapeo estado → color/animación/etiqueta. */
export const stateVisuals: Record<AssistantState, StateVisual> = {
  idle: { color: color.state.idle, animation: 'none', label: 'En reposo' },
  listening: { color: color.state.listening, animation: 'breathe', label: 'Escuchando…' },
  thinking: { color: color.state.thinking, animation: 'pulse', label: 'Pensando…' },
  speaking: { color: color.state.speaking, animation: 'equalize', label: 'Hablando…' },
  error: { color: color.state.error, animation: 'shake', label: 'Algo falló' },
};
