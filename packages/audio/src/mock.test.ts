import { describe, it, expect } from 'vitest';
import {
  createMockVoiceInput,
  createMemoryVoiceOutput,
  createMockAudioDeviceManager,
} from './mock';
import type { AudioDevice } from './providers';

async function* fromChunks(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const c of chunks) yield c;
}

describe('createMockVoiceInput', () => {
  it('emite los chunks predefinidos en orden y termina', async () => {
    const input = createMockVoiceInput([new Uint8Array([1]), new Uint8Array([2])]);
    expect(input.id).toBe('mock-input');
    const stream = await input.start();
    const out: number[] = [];
    for await (const chunk of stream.read()) out.push(chunk[0]!);
    expect(out).toEqual([1, 2]);
  });

  it('start sin chunks produce un stream vacío que termina', async () => {
    const input = createMockVoiceInput([]);
    const stream = await input.start();
    const out: Uint8Array[] = [];
    for await (const chunk of stream.read()) out.push(chunk);
    expect(out).toEqual([]);
  });

  it('registra el deviceId solicitado', async () => {
    const input = createMockVoiceInput([new Uint8Array([1])]);
    await input.start('mic-2');
    expect(input.lastDeviceId).toBe('mic-2');
  });

  it('stop corta la emisión', async () => {
    const input = createMockVoiceInput([new Uint8Array([1]), new Uint8Array([2])]);
    const stream = await input.start();
    await stream.stop();
    const out: Uint8Array[] = [];
    for await (const chunk of stream.read()) out.push(chunk);
    expect(out).toEqual([]);
  });
});

describe('createMemoryVoiceOutput', () => {
  it('acumula todo lo reproducido en chunks()', async () => {
    const output = createMemoryVoiceOutput();
    expect(output.id).toBe('memory-output');
    await output.play(fromChunks([new Uint8Array([1, 2]), new Uint8Array([3])]));
    expect(output.chunks().map((c) => Array.from(c))).toEqual([[1, 2], [3]]);
  });

  it('acumula a través de varias reproducciones', async () => {
    const output = createMemoryVoiceOutput();
    await output.play(fromChunks([new Uint8Array([1])]));
    await output.play(fromChunks([new Uint8Array([2])]));
    expect(output.chunks().map((c) => c[0])).toEqual([1, 2]);
  });

  it('stop marca parada', async () => {
    const output = createMemoryVoiceOutput();
    expect(output.stopped).toBe(false);
    await output.stop();
    expect(output.stopped).toBe(true);
  });
});

describe('createMockAudioDeviceManager', () => {
  it('devuelve la lista de dispositivos dada', async () => {
    const devices: AudioDevice[] = [
      { id: 'a', label: 'Mic A', kind: 'input' },
      { id: 'b', label: 'Speaker B', kind: 'output' },
    ];
    const manager = createMockAudioDeviceManager(devices);
    await expect(manager.list()).resolves.toEqual(devices);
  });

  it('por defecto devuelve lista vacía', async () => {
    await expect(createMockAudioDeviceManager().list()).resolves.toEqual([]);
  });
});
