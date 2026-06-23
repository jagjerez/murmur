import { useEffect, useId, useRef, useState } from 'react';
import { canonicalizeAccelerator } from '@murmur/core';
import { HotkeyError } from '@murmur/shared';
import type { AudioDevice, AudioDeviceManager } from '@murmur/audio';
import type { ConfigClient, ThemePref } from '../config/config-client';

/** Estado de la conexión realtime, para reflejarlo en ajustes. */
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface SettingsProps {
  config: ConfigClient;
  /** Enumerador de dispositivos de audio (Web Audio en prod, mock en tests). */
  devices: AudioDeviceManager;
  connection: ConnectionStatus;
  /** Aplicación del tema (por defecto escribe `data-theme` en `<html>`). */
  onTheme?: (theme: ThemePref) => void;
}

/** Voces disponibles del modelo realtime (curado para el MVP). */
const VOICES = ['verse', 'sol', 'alloy', 'cedar'] as const;
/** Modelos realtime soportados. */
const MODELS = ['gpt-realtime', 'gpt-realtime-mini'] as const;
const THEMES: readonly ThemePref[] = ['system', 'dark', 'light'] as const;

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  idle: 'En reposo',
  connecting: 'Conectando…',
  connected: 'Conectado',
  error: 'Error de conexión',
};

function applyThemeToRoot(theme: ThemePref): void {
  const root = document.documentElement;
  if (theme === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

/**
 * Panel de ajustes: micrófono (vía `AudioDeviceManager` inyectable), voz, modelo,
 * atajo (validado con `canonicalizeAccelerator`), tema (`data-theme`) y estado de
 * conexión. Cada cambio persiste vía `ConfigClient`. Accesible: cada control tiene
 * `label`; el error del atajo se anuncia con `role="alert"`.
 */
export function Settings({ config, devices, connection, onTheme }: SettingsProps) {
  const ids = {
    mic: useId(),
    voice: useId(),
    model: useId(),
    theme: useId(),
    hotkey: useId(),
  };

  const [inputs, setInputs] = useState<AudioDevice[] | null>(null);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [voice, setVoice] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [theme, setThemeState] = useState<ThemePref>('system');
  const [hotkey, setHotkey] = useState<string>('');
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // Carga inicial: config persistida + lista de micrófonos.
  useEffect(() => {
    let cancelled = false;
    void config.get().then((view) => {
      if (cancelled) return;
      setVoice(view.voice);
      setModel(view.model);
      setThemeState(view.theme);
      setHotkey(view.hotkey);
    });
    void devicesRef.current.list().then((list) => {
      if (cancelled) return;
      setInputs(list.filter((d) => d.kind === 'input'));
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const handleVoice = (value: string): void => {
    setVoice(value);
    void config.setVoice(value);
  };
  const handleModel = (value: string): void => {
    setModel(value);
    void config.setModel(value);
  };
  const handleTheme = (value: ThemePref): void => {
    setThemeState(value);
    if (onTheme) {
      onTheme(value);
    } else {
      applyThemeToRoot(value);
    }
    void config.setTheme(value);
  };

  const handleHotkeySubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    try {
      const canonical = canonicalizeAccelerator(hotkey);
      setHotkey(canonical);
      setHotkeyError(null);
      void config.setHotkey(canonical);
    } catch (err) {
      const message = err instanceof HotkeyError ? err.message : 'Atajo inválido';
      setHotkeyError(message);
    }
  };

  return (
    <section className="settings" aria-label="Ajustes de murmur">
      <h2>Ajustes</h2>

      <div className="settings__row">
        <label htmlFor={ids.mic}>Micrófono</label>
        {inputs !== null && inputs.length === 0 ? (
          <span className="muted">Sin dispositivos de entrada</span>
        ) : (
          <select id={ids.mic} value={selectedMic} onChange={(e) => setSelectedMic(e.target.value)}>
            {inputs === null && <option value="">Cargando…</option>}
            {inputs?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="settings__row">
        <label htmlFor={ids.voice}>Voz</label>
        <select id={ids.voice} value={voice} onChange={(e) => handleVoice(e.target.value)}>
          {VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="settings__row">
        <label htmlFor={ids.model}>Modelo</label>
        <select id={ids.model} value={model} onChange={(e) => handleModel(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="settings__row">
        <label htmlFor={ids.theme}>Tema</label>
        <select
          id={ids.theme}
          value={theme}
          onChange={(e) => handleTheme(e.target.value as ThemePref)}
        >
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <form className="settings__row" onSubmit={handleHotkeySubmit}>
        <label htmlFor={ids.hotkey}>Atajo global</label>
        <input
          id={ids.hotkey}
          type="text"
          value={hotkey}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={hotkeyError !== null}
          onChange={(e) => {
            setHotkey(e.target.value);
            setHotkeyError(null);
          }}
        />
        <button type="submit">Guardar atajo</button>
        {hotkeyError !== null && (
          <p className="settings__error" role="alert">
            {hotkeyError}
          </p>
        )}
      </form>

      <div className="settings__row settings__status">
        <span>Conexión</span>
        <span data-status={connection}>{CONNECTION_LABEL[connection]}</span>
      </div>
    </section>
  );
}
