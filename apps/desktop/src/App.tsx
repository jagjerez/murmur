import { useEffect, useRef, useState } from 'react';
import { ASSISTANT_STATES, type AssistantState } from '@murmur/shared';
import { stateVisuals } from '@murmur/design-system';
import type { HotkeyManager } from '@murmur/core';
import type { AudioDevice, AudioDeviceManager, VoiceInputProvider } from '@murmur/audio';
import { Capsule } from './components/Capsule';
import { useCapsule } from './capsule/useCapsule';
import { ANCHORS, type Anchor } from './capsule/anchor';
import type { InteractionMode } from './capsule/interaction';
import { createTauriHotkeyManager } from './hotkey/tauri-hotkey-manager';
import { WebAudioDeviceManager } from './audio/web-audio';
import { useAudioLevel } from './audio/use-audio-level';

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
  /** Enumerador de dispositivos de audio. Por defecto Web Audio; mockeable en tests. */
  devices?: AudioDeviceManager;
  /**
   * Captura de voz para el nivel real del ecualizador. Inyectable; si no se
   * provee, el ecualizador usa solo la animación CSS por defecto (sin pedir
   * permiso de micrófono al montar).
   */
  audioInput?: VoiceInputProvider;
}

/**
 * App de la Fase 2: muestra la cápsula y un panel de desarrollo provisional
 * (hasta F11) para recorrer los 5 estados, alternar modo, ancla y tema.
 *
 * Fase 3: registra el atajo global por defecto y, al dispararse, ejecuta el gesto de
 * captura de la cápsula (press). El `HotkeyManager` se inyecta (Tauri por defecto).
 *
 * Fase 4: el panel dev lista los dispositivos de entrada (vía `AudioDeviceManager`,
 * Web Audio por defecto) y, si se inyecta un `VoiceInputProvider`, el ecualizador de
 * la cápsula refleja el nivel real (RMS) mientras se captura.
 */
export function App({ hotkeys, devices, audioInput }: AppProps = {}) {
  const capsule = useCapsule();
  const { state, mode, anchor, capturing } = capsule.state;
  const [theme, setTheme] = useState<ThemePref>('dark');

  // Nivel real del ecualizador: solo se captura mientras la cápsula está activa.
  const level = useAudioLevel(audioInput, capturing);

  // Lista de dispositivos de entrada para el panel dev (provisional hasta F11).
  const deviceManagerRef = useRef<AudioDeviceManager | null>(null);
  if (deviceManagerRef.current === null) {
    deviceManagerRef.current = devices ?? new WebAudioDeviceManager();
  }
  const [inputs, setInputs] = useState<AudioDevice[] | null>(null);
  const [selectedInput, setSelectedInput] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void deviceManagerRef.current!.list().then((list) => {
      if (cancelled) return;
      setInputs(list.filter((d) => d.kind === 'input'));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

        <div className="dev-row">
          <label htmlFor="murmur-input-device">Micrófono</label>
          {inputs !== null && inputs.length === 0 ? (
            <span className="muted">Sin dispositivos de entrada</span>
          ) : (
            <select
              id="murmur-input-device"
              value={selectedInput}
              onChange={(e) => setSelectedInput(e.target.value)}
            >
              {inputs === null && <option value="">Cargando…</option>}
              {inputs?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      <Capsule
        state={state}
        mode={mode}
        anchor={anchor}
        capturing={capturing}
        level={level}
        onPress={capsule.press}
        onRelease={capsule.release}
        onCancel={capsule.cancel}
      />
    </>
  );
}
