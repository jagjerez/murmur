import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import {
  createMemoryHotkeyManager,
  createMockTranscriptionProvider,
  createMockTextToSpeechProvider,
} from '@murmur/core';
import { createMockVoiceInput, createMemoryVoiceOutput } from '@murmur/audio';
import { createMockChatProvider } from '@murmur/rag';
import { createMockConfigClient } from '../config/config-client';
import { useOfflineMurmur, type OfflineMurmurDeps } from './use-offline-murmur';

afterEach(cleanup);

function makeDeps(overrides: Partial<OfflineMurmurDeps> = {}): OfflineMurmurDeps {
  return {
    config: createMockConfigClient({ hotkey: 'CommandOrControl+Shift+Space' }),
    input: createMockVoiceInput([new Uint8Array([1, 2])]),
    output: createMemoryVoiceOutput(),
    transcription: createMockTranscriptionProvider('hola', 'local-whisper'),
    chat: createMockChatProvider(() => 'respuesta'),
    tts: createMockTextToSpeechProvider(new Uint8Array([7])),
    hotkey: createMemoryHotkeyManager(),
    ...overrides,
  };
}

describe('useOfflineMurmur', () => {
  it('arranca en idle y desconectado', () => {
    const { result } = renderHook(() => useOfflineMurmur(makeDeps()));
    expect(result.current.capsuleState).toBe('idle');
    expect(result.current.connection).toBe('idle');
    expect(result.current.transcript).toEqual([]);
  });

  it('registra el hotkey de la config (sin API key)', async () => {
    const hotkey = createMemoryHotkeyManager();
    const config = createMockConfigClient({ hotkey: 'CommandOrControl+Shift+M' });
    renderHook(() => useOfflineMurmur(makeDeps({ hotkey, config })));
    await waitFor(() => expect(hotkey.registered()).toContain('CommandOrControl+Shift+M'));
  });

  it('sin API key sigue registrando el hotkey (diferencia con useMurmur)', async () => {
    const hotkey = createMemoryHotkeyManager();
    const config = createMockConfigClient(); // sin key
    renderHook(() => useOfflineMurmur(makeDeps({ hotkey, config })));
    // En modo offline siempre se registra el hotkey aunque no haya API key.
    await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
  });

  it('startCapture conecta y pasa a listening', async () => {
    const { result } = renderHook(() => useOfflineMurmur(makeDeps()));

    await act(async () => {
      await result.current.startCapture();
    });

    await waitFor(() => expect(result.current.connection).toBe('connected'));
    await waitFor(() => expect(result.current.capsuleState).toBe('listening'));
  });

  it('stopCapture ejecuta el turno completo y acumula el transcript', async () => {
    const { result } = renderHook(() => useOfflineMurmur(makeDeps()));

    await act(async () => {
      await result.current.startCapture();
    });
    await waitFor(() => expect(result.current.capsuleState).toBe('listening'));

    await act(async () => {
      await result.current.stopCapture();
    });

    await waitFor(() =>
      expect(result.current.transcript).toEqual([
        { role: 'user', text: 'hola' },
        { role: 'assistant', text: 'respuesta' },
      ]),
    );
    await waitFor(() => expect(result.current.capsuleState).toBe('idle'));
  });

  it('al disparar el hotkey arranca la captura (estado listening)', async () => {
    const hotkey = createMemoryHotkeyManager();
    const config = createMockConfigClient({ hotkey: 'CommandOrControl+Shift+Space' });
    const { result } = renderHook(() => useOfflineMurmur(makeDeps({ hotkey, config })));

    await waitFor(() => expect(hotkey.registered()).toContain('CommandOrControl+Shift+Space'));

    await act(async () => {
      hotkey.trigger('CommandOrControl+Shift+Space');
    });

    await waitFor(() => expect(result.current.capsuleState).toBe('listening'));
    await waitFor(() => expect(result.current.connection).toBe('connected'));
  });
});
