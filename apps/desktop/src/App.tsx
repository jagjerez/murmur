import { useEffect, useRef, useState } from 'react';
import { ASSISTANT_STATES, type AssistantState } from '@murmur/shared';
import { stateVisuals } from '@murmur/design-system';
import type { HotkeyManager } from '@murmur/core';
import { Capsule } from './components/Capsule';
import { useCapsule } from './capsule/useCapsule';
import { ANCHORS, type Anchor } from './capsule/anchor';
import type { InteractionMode } from './capsule/interaction';
import { createTauriHotkeyManager } from './hotkey/tauri-hotkey-manager';

/** Atajo global por defecto que activa murmur (hasta que F11 lo haga configurable). */
export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';

type ThemePref = 'dark' | 'light' | 'system';
const THEMES: readonly ThemePref[] = ['dark', 'light', 'system'] as const;

function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = pref;
  }
}

const MODES: readonly InteractionMode[] = ['push-to-talk', 'toggle'] as const;

export interface AppProps {
  /** Gestor de atajos globales. Inyectable (memoria en tests; Tauri en producción). */
  hotkeys?: HotkeyManager;
}

/**
 * App de la Fase 2: muestra la cápsula y un panel de desarrollo provisional
 * (hasta F11) para recorrer los 5 estados, alternar modo, ancla y tema.
 *
 * Fase 3: registra el atajo global por defecto y, al dispararse, ejecuta el gesto de
 * captura de la cápsula (press). El `HotkeyManager` se inyecta (Tauri por defecto).
 */
export function App({ hotkeys }: AppProps = {}) {
  const capsule = useCapsule();
  const { state, mode, anchor, capturing } = capsule.state;
  const [theme, setTheme] = useState<ThemePref>('dark');

  // El manager por defecto se crea una sola vez; en tests se inyecta uno en memoria.
  const managerRef = useRef<HotkeyManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = hotkeys ?? createTauriHotkeyManager();
  }

  // El handler debe ver siempre el `press` actual sin re-registrar el atajo.
  const pressRef = useRef(capsule.press);
  pressRef.current = capsule.press;

  useEffect(() => {
    const manager = managerRef.current;
    if (manager === null) return;
    let cancelled = false;
    void manager.register(DEFAULT_HOTKEY, () => {
      if (!cancelled) pressRef.current();
    });
    return () => {
      cancelled = true;
      void manager.unregisterAll();
    };
  }, []);

  return (
    <>
      <section className="dev-panel" aria-label="Panel de desarrollo de murmur">
        <h2>murmur · panel dev</h2>

        <div className="dev-row">
          <span>Estado</span>
          <div className="group">
            {ASSISTANT_STATES.map((s: AssistantState) => (
              <button
                key={s}
                type="button"
                aria-pressed={state === s}
                onClick={() => capsule.setState(s)}
              >
                {stateVisuals[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="dev-row">
          <span>Modo</span>
          <div className="group">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => capsule.setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="dev-row">
          <span>Ancla</span>
          <div className="group">
            {ANCHORS.map((a: Anchor) => (
              <button
                key={a}
                type="button"
                aria-pressed={anchor === a}
                onClick={() => capsule.setAnchor(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="dev-row">
          <span>Tema</span>
          <div className="group">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={theme === t}
                onClick={() => {
                  setTheme(t);
                  applyTheme(t);
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Capsule
        state={state}
        mode={mode}
        anchor={anchor}
        capturing={capturing}
        onPress={capsule.press}
        onRelease={capsule.release}
        onCancel={capsule.cancel}
      />
    </>
  );
}
