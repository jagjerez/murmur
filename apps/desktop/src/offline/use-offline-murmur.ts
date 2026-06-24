import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantState } from '@murmur/shared';
import {
  OfflineConversationOrchestrator,
  type HotkeyManager,
  type TranscriptionProvider,
  type TextToSpeechProvider,
} from '@murmur/core';
import type { ChatProvider, ConversationStore } from '@murmur/rag';
import type { VoiceInputProvider, VoiceOutputProvider } from '@murmur/audio';
import type { ConfigClient } from '../config/config-client';
import { createMemoryConversationStore } from '../conversation/memory-conversation-store';
import type { ConnectionStatus } from '../components/Settings';
import type { TranscriptLine } from '../components/Transcript';
import type { MurmurController } from '../use-murmur';

/** Dependencias inyectables del controlador offline. Defaults reales en `App`, mocks en tests. */
export interface OfflineMurmurDeps {
  config: ConfigClient;
  input: VoiceInputProvider;
  output: VoiceOutputProvider;
  transcription: TranscriptionProvider;
  chat: ChatProvider;
  tts: TextToSpeechProvider;
  hotkey: HotkeyManager;
  /** Almacén de conversación. Por defecto en memoria (webview). */
  conversation?: ConversationStore;
  /** ID del dispositivo de entrada a usar (micrófono seleccionado). */
  deviceId?: string;
}

/**
 * Controlador que cablea el `OfflineConversationOrchestrator` con audio, STT, LLM, TTS, config
 * y hotkey. El orchestrator se construye de forma perezosa al primer `startCapture`. No requiere
 * API key (modo offline). Refleja `onStateChange`/`onTranscript`/`onError` en estado de React.
 * Registra el hotkey de la config y lo enlaza a la captura. Todo es inyectable: en tests se
 * pasan mocks (sin red ni hardware).
 */
export function useOfflineMurmur(deps: OfflineMurmurDeps): MurmurController {
  const [capsuleState, setCapsuleState] = useState<AssistantState>('idle');
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  // El store en memoria persiste entre renders.
  const conversationRef = useRef<ConversationStore | null>(null);
  if (conversationRef.current === null) {
    conversationRef.current = deps.conversation ?? createMemoryConversationStore();
  }

  // El orchestrator vive entre renders; se crea perezosamente al primer startCapture.
  const orchestratorRef = useRef<OfflineConversationOrchestrator | null>(null);
  const connectedRef = useRef(false);
  const deviceIdRef = useRef(deps.deviceId);
  deviceIdRef.current = deps.deviceId;

  // Deps estables para el orchestrator (no deben cambiar entre renders en la app real).
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const ensureSession = useCallback(async (): Promise<void> => {
    if (connectedRef.current) return;
    const { input, output, transcription, chat, tts } = depsRef.current;
    setConnection('connecting');

    const orchestrator = new OfflineConversationOrchestrator({
      input,
      output,
      transcription,
      chat,
      tts,
      conversation: conversationRef.current!,
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

  // Registra el hotkey de la config y lo enlaza a la captura. Sin API key sigue registrando
  // (diferencia con useMurmur: el modo offline no requiere key).
  useEffect(() => {
    let cancelled = false;
    const hotkey = deps.hotkey;
    void (async () => {
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

  return { capsuleState, connection, transcript, startCapture, stopCapture };
}
