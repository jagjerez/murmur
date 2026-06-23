import { useReducer } from 'react';
import type { AssistantState } from '@murmur/shared';
import { nextCapture, type CaptureEvent, type InteractionMode } from './interaction';
import type { Anchor } from './anchor';

export interface CapsuleState {
  state: AssistantState;
  mode: InteractionMode;
  anchor: Anchor;
  capturing: boolean;
}

export type CapsuleAction =
  | { type: 'setState'; state: AssistantState }
  | { type: 'setMode'; mode: InteractionMode }
  | { type: 'setAnchor'; anchor: Anchor }
  | { type: 'press' }
  | { type: 'release' }
  | { type: 'cancel' };

export const initialCapsuleState: CapsuleState = {
  state: 'idle',
  mode: 'push-to-talk',
  anchor: 'bottom-center',
  capturing: false,
};

function applyCapture(prev: CapsuleState, event: CaptureEvent): CapsuleState {
  const { capturing, state } = nextCapture(prev.mode, prev.capturing, event);
  return { ...prev, capturing, state };
}

export function capsuleReducer(prev: CapsuleState, action: CapsuleAction): CapsuleState {
  switch (action.type) {
    case 'setState':
      return { ...prev, state: action.state };
    case 'setMode':
      // Cambiar de modo cancela cualquier captura en curso.
      return { ...prev, mode: action.mode, capturing: false };
    case 'setAnchor':
      return { ...prev, anchor: action.anchor };
    case 'press':
      return applyCapture(prev, 'press');
    case 'release':
      return applyCapture(prev, 'release');
    case 'cancel':
      return applyCapture(prev, 'cancel');
  }
}

export interface CapsuleController {
  state: CapsuleState;
  setState: (state: AssistantState) => void;
  setMode: (mode: InteractionMode) => void;
  setAnchor: (anchor: Anchor) => void;
  press: () => void;
  release: () => void;
  cancel: () => void;
}

/** Hook de estado de la cápsula. La lógica de transición vive en `nextCapture`. */
export function useCapsule(initial: CapsuleState = initialCapsuleState): CapsuleController {
  const [state, dispatch] = useReducer(capsuleReducer, initial);

  return {
    state,
    setState: (s) => dispatch({ type: 'setState', state: s }),
    setMode: (m) => dispatch({ type: 'setMode', mode: m }),
    setAnchor: (a) => dispatch({ type: 'setAnchor', anchor: a }),
    press: () => dispatch({ type: 'press' }),
    release: () => dispatch({ type: 'release' }),
    cancel: () => dispatch({ type: 'cancel' }),
  };
}
