import { describe, it, expect } from 'vitest';
import type { AssistantState } from '@murmur/shared';
import { createMockVoiceInput, createMemoryVoiceOutput } from '@murmur/audio';
import { createSqliteStore, createMockChatProvider } from '@murmur/rag';
import { createMockTranscriptionProvider } from './providers/whisper';
import { createMockTextToSpeechProvider } from './providers/tts-provider';
import { OfflineConversationOrchestrator } from './offline-orchestrator';

function build() {
  const store = createSqliteStore(':memory:');
  const states: AssistantState[] = [];
  const transcripts: { role: 'user' | 'assistant'; text: string }[] = [];
  const tts = createMockTextToSpeechProvider(new Uint8Array([9, 9]));
  const output = createMemoryVoiceOutput();
  const orch = new OfflineConversationOrchestrator({
    input: createMockVoiceInput([new Uint8Array([1, 2, 3, 4])]),
    transcription: createMockTranscriptionProvider('hola, soy Ana', 'local-whisper'),
    chat: createMockChatProvider(() => 'Encantado, Ana.'),
    tts,
    output,
    conversation: store.conversation,
    onStateChange: (s) => states.push(s),
    onTranscript: (e) => transcripts.push(e),
  });
  return { orch, store, states, transcripts, tts, output };
}

describe('OfflineConversationOrchestrator', () => {
  it('compat: arranca en idle', () => {
    expect(new OfflineConversationOrchestrator().getState()).toBe('idle');
  });

  it('un turno completo: STT → chat → TTS → salida, persiste y emite estados', async () => {
    const h = build();
    const session = await h.orch.startSession();
    await h.orch.startListening();
    await h.orch.stopListening();
    await h.orch.flush();

    expect(h.transcripts).toEqual([
      { role: 'user', text: 'hola, soy Ana' },
      { role: 'assistant', text: 'Encantado, Ana.' },
    ]);
    const msgs = h.store.conversation
      .getMessages(session.id)
      .map((m) => ({ role: m.role, text: m.text }));
    expect(msgs).toEqual([
      { role: 'user', text: 'hola, soy Ana' },
      { role: 'assistant', text: 'Encantado, Ana.' },
    ]);
    expect(h.tts.lastText).toBe('Encantado, Ana.');
    expect(h.output.chunks()).toEqual([new Uint8Array([9, 9])]);
    expect(h.states).toEqual(['listening', 'thinking', 'speaking', 'idle']);
  });

  it('un fallo del chat lleva a estado error vía onError', async () => {
    const store = createSqliteStore(':memory:');
    const errors: Error[] = [];
    const states: AssistantState[] = [];
    const orch = new OfflineConversationOrchestrator({
      input: createMockVoiceInput([new Uint8Array([1])]),
      transcription: createMockTranscriptionProvider('x', 'local-whisper'),
      chat: { complete: () => Promise.reject(new Error('LLM caído')) },
      tts: createMockTextToSpeechProvider(),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      onError: (e) => errors.push(e),
      onStateChange: (s) => states.push(s),
    });
    await orch.startSession();
    await orch.startListening();
    await orch.stopListening();
    await orch.flush();
    expect(errors.map((e) => e.message)).toContain('LLM caído');
    expect(states).toContain('error');
  });
});
