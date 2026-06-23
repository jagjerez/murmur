import { useCallback, useEffect, useRef, useState } from 'react';
import type { HotkeyManager, RealtimeModelProvider } from '@murmur/core';
import { createOpenAIRealtimeProvider } from '@murmur/core';
import type { AudioDeviceManager, VoiceInputProvider, VoiceOutputProvider } from '@murmur/audio';
import { Capsule } from './components/Capsule';
import { Onboarding, type RequestMic } from './components/Onboarding';
import { Settings } from './components/Settings';
import { Transcript } from './components/Transcript';
import { useMurmur } from './use-murmur';
import { useAudioLevel } from './audio/use-audio-level';
import { createTauriHotkeyManager } from './hotkey/tauri-hotkey-manager';
import {
  WebAudioDeviceManager,
  WebVoiceInputProvider,
  WebVoiceOutputProvider,
} from './audio/web-audio';
import { createTauriConfigClient, type ConfigClient, type ThemePref } from './config/config-client';

export interface AppProps {
  /** Configuración persistida. Por defecto Tauri (degrada a memoria fuera de Tauri). */
  config?: ConfigClient;
  /** Proveedor realtime. Por defecto OpenAI Realtime; mock en tests. */
  realtime?: RealtimeModelProvider;
  /** Captura de voz. Por defecto Web Audio; mock en tests. */
  input?: VoiceInputProvider;
  /** Salida de voz. Por defecto Web Audio; mock en tests. */
  output?: VoiceOutputProvider;
  /** Gestor de atajos globales. Por defecto Tauri; memoria en tests. */
  hotkey?: HotkeyManager;
  /** Enumerador de dispositivos (para ajustes). Por defecto Web Audio. */
  devices?: AudioDeviceManager;
  /** Solicitud de permiso de micrófono para el onboarding. */
  requestMic?: RequestMic;
}

function applyTheme(theme: ThemePref): void {
  const root = document.documentElement;
  if (theme === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

/**
 * Shell de la app. Lee la config: sin API key muestra el onboarding; con API key
 * muestra la cápsula (cuyo estado refleja el orchestrator vía `useMurmur`), el acceso
 * a ajustes y la transcripción alternable. El hotkey global (registrado por `useMurmur`)
 * dispara la captura. Todas las dependencias se inyectan; los defaults son las impls
 * reales (Tauri/Web/OpenAI) y en tests se pasan mocks.
 */
export function App({
  config,
  realtime,
  input,
  output,
  hotkey,
  devices,
  requestMic,
}: AppProps = {}) {
  // Defaults reales, construidos una vez. En tests se inyectan mocks.
  const configRef = useRef<ConfigClient | null>(null);
  if (configRef.current === null) configRef.current = config ?? createTauriConfigClient();
  const realtimeRef = useRef<RealtimeModelProvider | null>(null);
  if (realtimeRef.current === null)
    realtimeRef.current = realtime ?? createOpenAIRealtimeProvider();
  const inputRef = useRef<VoiceInputProvider | null>(null);
  if (inputRef.current === null) inputRef.current = input ?? new WebVoiceInputProvider();
  const outputRef = useRef<VoiceOutputProvider | null>(null);
  if (outputRef.current === null) outputRef.current = output ?? new WebVoiceOutputProvider();
  const hotkeyRef = useRef<HotkeyManager | null>(null);
  if (hotkeyRef.current === null) hotkeyRef.current = hotkey ?? createTauriHotkeyManager();
  const devicesRef = useRef<AudioDeviceManager | null>(null);
  if (devicesRef.current === null) devicesRef.current = devices ?? new WebAudioDeviceManager();

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);

  // Carga inicial: ¿hay API key y qué tema aplicar?
  const refreshConfig = useCallback(async (): Promise<void> => {
    const view = await configRef.current!.get();
    setHasApiKey(view.hasApiKey);
    applyTheme(view.theme);
  }, []);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const murmur = useMurmur({
    config: configRef.current,
    realtime: realtimeRef.current,
    input: inputRef.current,
    output: outputRef.current,
    hotkey: hotkeyRef.current,
  });

  // Nivel real del ecualizador: sólo mientras se está capturando (escuchando).
  const capturing = murmur.capsuleState === 'listening';
  const level = useAudioLevel(capturing ? inputRef.current : undefined, capturing);

  const handleOnboardingComplete = useCallback((): void => {
    void refreshConfig();
  }, [refreshConfig]);

  // Aún no sabemos si hay key (primer render asíncrono): no parpadear.
  if (hasApiKey === null) {
    return null;
  }

  if (!hasApiKey) {
    return (
      <Onboarding
        config={configRef.current}
        {...(requestMic ? { requestMic } : {})}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <>
      <div className="app-toolbar">
        <button type="button" onClick={() => setShowSettings((v) => !v)}>
          Ajustes
        </button>
        <button
          type="button"
          aria-pressed={showTranscript}
          onClick={() => setShowTranscript((v) => !v)}
        >
          Transcripción
        </button>
      </div>

      {showSettings && (
        <Settings
          config={configRef.current}
          devices={devicesRef.current}
          connection={murmur.connection}
          onTheme={applyTheme}
        />
      )}

      <Transcript lines={murmur.transcript} visible={showTranscript} />

      <Capsule
        state={murmur.capsuleState}
        mode="push-to-talk"
        anchor="bottom-center"
        capturing={capturing}
        level={level}
        onPress={() => void murmur.startCapture()}
        onRelease={() => void murmur.stopCapture()}
        onCancel={() => void murmur.stopCapture()}
      />
    </>
  );
}
