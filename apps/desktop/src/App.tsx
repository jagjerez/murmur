import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HotkeyManager,
  RealtimeModelProvider,
  TranscriptionProvider,
  TextToSpeechProvider,
} from '@murmur/core';
import {
  createOpenAIRealtimeProvider,
  createLocalWhisperProvider,
  createPiperTtsProvider,
} from '@murmur/core';
import { invoke } from '@tauri-apps/api/core';
// Subruta `@murmur/rag/chat` (no el barrel): evita arrastrar el SQLite (`node:sqlite`/`node:crypto`)
// de `@murmur/rag` al bundle del webview, que rompería el `vite build`.
import { createOllamaChatProvider, type ChatProvider } from '@murmur/rag/chat';
import type { AudioDeviceManager, VoiceInputProvider, VoiceOutputProvider } from '@murmur/audio';
import { Capsule } from './components/Capsule';
import { Onboarding, type RequestMic } from './components/Onboarding';
import { Settings } from './components/Settings';
import { Transcript } from './components/Transcript';
import { useMurmur, type MurmurController } from './use-murmur';
import { useOfflineMurmur } from './offline/use-offline-murmur';
import { useAudioLevel } from './audio/use-audio-level';
import { createTauriHotkeyManager } from './hotkey/tauri-hotkey-manager';
import {
  WebAudioDeviceManager,
  WebVoiceInputProvider,
  WebVoiceOutputProvider,
} from './audio/web-audio';
import { createTauriConfigClient, type ConfigClient, type ThemePref } from './config/config-client';
import { createDesktopToolHost, type ToolHost } from './plugins/desktop-plugins';
import { createTauriLocalWhisperRun } from './offline/local-whisper-run';
import { createTauriPiperRun } from './offline/piper-tts-run';

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
  /** Host de tools (plugins) para function-calling. Por defecto los plugins del webview. */
  toolHost?: ToolHost;
  /** Proveedor de transcripción offline (inyectable en tests). */
  transcription?: TranscriptionProvider;
  /** Proveedor de chat offline (inyectable en tests). */
  chat?: ChatProvider;
  /** Proveedor TTS offline (inyectable en tests). */
  tts?: TextToSpeechProvider;
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
 * Shell presentacional: renderiza la barra de herramientas, ajustes opcionales,
 * transcripción y cápsula. Driven by any `MurmurController` (cloud u offline).
 */
function CapsuleShell({
  controller,
  input,
  config,
  devices,
}: {
  controller: MurmurController;
  input: VoiceInputProvider;
  config: ConfigClient;
  devices: AudioDeviceManager;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);

  // Nivel real del ecualizador: sólo mientras se está capturando (escuchando).
  const capturing = controller.capsuleState === 'listening';
  const level = useAudioLevel(capturing ? input : undefined, capturing);

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
          config={config}
          devices={devices}
          connection={controller.connection}
          onTheme={applyTheme}
        />
      )}

      <Transcript lines={controller.transcript} visible={showTranscript} />

      <Capsule
        state={controller.capsuleState}
        mode="push-to-talk"
        anchor="bottom-center"
        capturing={capturing}
        level={level}
        onPress={() => void controller.startCapture()}
        onRelease={() => void controller.stopCapture()}
        onCancel={() => void controller.stopCapture()}
      />
    </>
  );
}

/** Shell que usa el orquestador cloud (OpenAI Realtime). */
function CloudShell({
  config,
  realtime,
  input,
  output,
  hotkey,
  devices,
  tools,
  dispatchTool,
}: {
  config: ConfigClient;
  realtime: RealtimeModelProvider;
  input: VoiceInputProvider;
  output: VoiceOutputProvider;
  hotkey: HotkeyManager;
  devices: AudioDeviceManager;
  tools?: ToolHost['tools'];
  dispatchTool?: ToolHost['dispatchTool'];
}) {
  const murmur = useMurmur({ config, realtime, input, output, hotkey, tools, dispatchTool });
  return <CapsuleShell controller={murmur} input={input} config={config} devices={devices} />;
}

/** Shell que usa el orquestador offline (STT+LLM+TTS locales). */
function OfflineShell({
  config,
  input,
  output,
  hotkey,
  devices,
  transcription,
  chat,
  tts,
}: {
  config: ConfigClient;
  input: VoiceInputProvider;
  output: VoiceOutputProvider;
  hotkey: HotkeyManager;
  devices: AudioDeviceManager;
  transcription?: TranscriptionProvider;
  chat?: ChatProvider;
  tts?: TextToSpeechProvider;
}) {
  // Providers offline construidos una vez (perezosamente en refs). Sólo se construyen
  // cuando se monta OfflineShell; el cloud path nunca los crea.
  const transcriptionRef = useRef<TranscriptionProvider | null>(null);
  if (transcriptionRef.current === null) {
    transcriptionRef.current =
      transcription ?? createLocalWhisperProvider({ run: createTauriLocalWhisperRun({ invoke }) });
  }
  const chatRef = useRef<ChatProvider | null>(null);
  if (chatRef.current === null) {
    chatRef.current = chat ?? createOllamaChatProvider({ model: 'llama3' });
  }
  const ttsRef = useRef<TextToSpeechProvider | null>(null);
  if (ttsRef.current === null) {
    ttsRef.current = tts ?? createPiperTtsProvider({ run: createTauriPiperRun({ invoke }) });
  }

  const murmur = useOfflineMurmur({
    config,
    input,
    output,
    transcription: transcriptionRef.current,
    chat: chatRef.current,
    tts: ttsRef.current,
    hotkey,
  });
  return <CapsuleShell controller={murmur} input={input} config={config} devices={devices} />;
}

/**
 * Shell de la app. Lee la config y enruta por modo: `offline` monta `OfflineShell`
 * (orquestador local vía `useOfflineMurmur`, sin API key); en `cloud`, sin API key muestra el
 * onboarding y con key monta `CloudShell` (orquestador realtime vía `useMurmur`). Ambos renderizan
 * la `CapsuleShell` común (cápsula + ajustes + transcripción) y el hotkey global dispara la captura.
 * Todas las dependencias se inyectan; los defaults son las impls reales (Tauri/Web/OpenAI) y en
 * tests se pasan mocks.
 */
export function App({
  config,
  realtime,
  input,
  output,
  hotkey,
  devices,
  requestMic,
  toolHost,
  transcription,
  chat,
  tts,
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
  // El tool host por defecto es JS puro (registry + tool-defs, sin I/O); se construye una vez aunque
  // todavía no haya API key (onboarding). Sólo se usa cuando arranca la sesión (con key + hotkey).
  const toolHostRef = useRef<ToolHost | null>(null);
  if (toolHostRef.current === null) toolHostRef.current = toolHost ?? createDesktopToolHost();

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'cloud' | 'offline' | null>(null);

  // Carga inicial: ¿hay API key, qué modo y qué tema aplicar?
  const refreshConfig = useCallback(async (): Promise<void> => {
    const view = await configRef.current!.get();
    setHasApiKey(view.hasApiKey);
    setMode(view.mode);
    applyTheme(view.theme);
  }, []);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const handleOnboardingComplete = useCallback((): void => {
    void refreshConfig();
  }, [refreshConfig]);

  // Aún no sabemos si hay key o modo (primer render asíncrono): no parpadear.
  if (hasApiKey === null || mode === null) {
    return null;
  }

  // Modo offline: no requiere API key; nunca muestra onboarding.
  if (mode === 'offline') {
    return (
      <OfflineShell
        config={configRef.current!}
        input={inputRef.current!}
        output={outputRef.current!}
        hotkey={hotkeyRef.current!}
        devices={devicesRef.current!}
        transcription={transcription}
        chat={chat}
        tts={tts}
      />
    );
  }

  // Modo cloud: si no hay key, mostrar onboarding.
  if (!hasApiKey) {
    return (
      <Onboarding
        config={configRef.current!}
        {...(requestMic ? { requestMic } : {})}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <CloudShell
      config={configRef.current!}
      realtime={realtimeRef.current!}
      input={inputRef.current!}
      output={outputRef.current!}
      hotkey={hotkeyRef.current!}
      devices={devicesRef.current!}
      tools={toolHostRef.current!.tools}
      dispatchTool={toolHostRef.current!.dispatchTool}
    />
  );
}
