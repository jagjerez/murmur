import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantState } from '@murmur/shared';
import {
  ConversationOrchestrator,
  type HotkeyManager,
  type RealtimeModelProvider,
  type RealtimeTool,
  type WakeWordDetector,
} from '@murmur/core';
import type { ConversationStore } from '@murmur/rag';
import type { VoiceInputProvider, VoiceOutputProvider } from '@murmur/audio';
import type { ConfigClient } from './config/config-client';
import { createMemoryConversationStore } from './conversation/memory-conversation-store';
import type { ConnectionStatus } from './components/Settings';
import type { TranscriptLine } from './components/Transcript';

/** Dependencias inyectables del controlador. Defaults reales en `App`, mocks en tests. */
export interface MurmurDeps {
  config: ConfigClient;
  realtime: RealtimeModelProvider;
  input: VoiceInputProvider;
  output: VoiceOutputProvider;
  hotkey: HotkeyManager;
  /**
   * Detector de wake word inyectable. Si se proporciona y `config.wakeWord.enabled`, se arranca
   * y su detección dispara la captura (igual que el hotkey). Opcional: si falta, no hay wake word.
   */
  wakeWord?: WakeWordDetector;
  /**
   * Tools que el modelo puede invocar (function-calling) y su despachador. Van **acoplados**:
   * provéelos juntos (normalmente vía `createDesktopToolHost`). Pasar `dispatchTool` sin `tools`
   * no tiene efecto (sin tools el modelo no emite tool-calls); pasar `tools` sin `dispatchTool`
   * hace que las tool-calls se descarten de forma segura. Ambos opcionales.
   */
  tools?: RealtimeTool[];
  /** Despachador de tools; ejecuta una tool y devuelve su salida como texto. Ver `tools`. */
  dispatchTool?: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Almacén de conversación. Por defecto en memoria (webview). */
  conversation?: ConversationStore;
  /** ID del dispositivo de entrada a usar (micrófono seleccionado). */
  deviceId?: string;
}

export interface MurmurController {
  capsuleState: AssistantState;
  connection: ConnectionStatus;
  transcript: TranscriptLine[];
  /** Arranca sesión (si hace falta) y comienza la captura. */
  startCapture: () => Promise<void>;
  /** Detiene la captura y confirma el turno. */
  stopCapture: () => Promise<void>;
}

/**
 * Controlador que cablea el `ConversationOrchestrator` con audio, realtime, config y
 * hotkey. El orchestrator se construye de forma perezosa al primer `startCapture`
 * (cuando ya hay API key y modelo/voz desde la config) y refleja
 * `onStateChange`/`onTranscript`/`onError` en estado de React. Registra el hotkey de la
 * config y lo enlaza a la captura. Sin API key no registra nada (la app muestra
 * onboarding). Todo es inyectable: en tests se pasan mocks (sin red ni hardware).
 */
export function useMurmur(deps: MurmurDeps): MurmurController {
  const [capsuleState, setCapsuleState] = useState<AssistantState>('idle');
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  // El store en memoria persiste entre renders.
  const conversationRef = useRef<ConversationStore | null>(null);
  if (conversationRef.current === null) {
    conversationRef.current = deps.conversation ?? createMemoryConversationStore();
  }

  // El orchestrator vive entre renders; se crea perezosamente con la connection real.
  const orchestratorRef = useRef<ConversationOrchestrator | null>(null);
  const connectedRef = useRef(false);
  const deviceIdRef = useRef(deps.deviceId);
  deviceIdRef.current = deps.deviceId;

  // Deps estables para el orchestrator (no deben cambiar entre renders en la app real).
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const ensureSession = useCallback(async (): Promise<void> => {
    if (connectedRef.current) return;
    const { config, realtime, input, output, tools, dispatchTool } = depsRef.current;
    const apiKey = await config.readApiKey();
    if (!apiKey) {
      setConnection('error');
      return;
    }
    const view = await config.get();
    setConnection('connecting');

    const orchestrator = new ConversationOrchestrator({
      realtime,
      input,
      output,
      conversation: conversationRef.current!,
      connection: { apiKey, model: view.model, voice: view.voice },
      ...(tools !== undefined ? { tools } : {}),
      ...(dispatchTool !== undefined ? { dispatchTool } : {}),
      onStateChange: (s) => setCapsuleState(s),
      onTranscript: (e) => setTranscript((prev) => [...prev, e]),
      onError: () => setConnection('error'),
    });
    orchestratorRef.current = orchestrator;

    await orchestrator.startSession();
    connectedRef.current = true;
    setConnection('connected');
  }, []);

  const startCapture = useCallback(async (): Promise<void> => {
    await ensureSession();
    const orchestrator = orchestratorRef.current;
    if (!connectedRef.current || orchestrator === null) return;
    // Fire-and-forget: la promesa resuelve al cerrar el stream (ver JSDoc del orchestrator).
    void orchestrator.startListening(deviceIdRef.current).catch(() => setConnection('error'));
  }, [ensureSession]);

  const stopCapture = useCallback(async (): Promise<void> => {
    const orchestrator = orchestratorRef.current;
    if (!connectedRef.current || orchestrator === null) return;
    await orchestrator.stopListening();
  }, []);

  // El handler del hotkey debe ver siempre el `startCapture` actual sin re-registrar.
  const startRef = useRef(startCapture);
  startRef.current = startCapture;

  // Registra el hotkey de la config y lo enlaza a la captura. Sin API key no registra.
  useEffect(() => {
    let cancelled = false;
    const hotkey = deps.hotkey;
    void (async () => {
      const apiKey = await deps.config.readApiKey();
      if (cancelled || !apiKey) return;
      const view = await deps.config.get();
      if (cancelled) return;
      await hotkey.register(view.hotkey, () => {
        if (!cancelled) void startRef.current();
      });
    })();
    return () => {
      cancelled = true;
      void hotkey.unregisterAll();
    };
  }, [deps.config, deps.hotkey]);

  // Arranca el wake word si está habilitado en config y hay detector inyectado. La detección
  // dispara la captura igual que el hotkey. Requiere API key (como el hotkey). Limpieza con stop.
  useEffect(() => {
    const detector = deps.wakeWord;
    if (detector === undefined) return;
    let cancelled = false;
    void (async () => {
      const apiKey = await deps.config.readApiKey();
      if (cancelled || !apiKey) return;
      const view = await deps.config.get();
      if (cancelled || !view.wakeWord.enabled) return;
      await detector.start(() => {
        if (!cancelled) void startRef.current();
      });
    })();
    return () => {
      cancelled = true;
      void detector.stop();
    };
  }, [deps.config, deps.wakeWord]);

  return { capsuleState, connection, transcript, startCapture, stopCapture };
}
