import { describe, it, expect } from 'vitest';
import { createPushPullStream } from './stream';

async function collect(stream: { read(): AsyncIterable<Uint8Array> }): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const chunk of stream.read()) out.push(chunk);
  return out;
}

describe('createPushPullStream', () => {
  it('entrega los chunks pusheados antes de leer, en orden', async () => {
    const s = createPushPullStream();
    s.push(new Uint8Array([1]));
    s.push(new Uint8Array([2]));
    s.push(new Uint8Array([3]));
    s.end();
    const chunks = await collect(s);
    expect(chunks.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it('read espera cuando la cola está vacía y se resuelve al hacer push', async () => {
    const s = createPushPullStream();
    const iterator = s.read()[Symbol.asyncIterator]();
    const pending = iterator.next();
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    // Aún no hay datos: la promesa no se ha resuelto.
    await Promise.resolve();
    expect(resolved).toBe(false);

    s.push(new Uint8Array([42]));
    const result = await pending;
    expect(result.done).toBe(false);
    expect(result.value[0]).toBe(42);
  });

  it('end() termina el for await sin más valores', async () => {
    const s = createPushPullStream();
    s.push(new Uint8Array([7]));
    s.end();
    // push posterior a end se ignora.
    s.push(new Uint8Array([99]));
    const chunks = await collect(s);
    expect(chunks.map((c) => c[0])).toEqual([7]);
  });

  it('fail(e) hace que la iteración lance el error', async () => {
    const s = createPushPullStream();
    s.push(new Uint8Array([1]));
    s.fail(new Error('boom'));
    await expect(collect(s)).rejects.toThrow('boom');
  });

  it('fail propaga el error aunque la cola ya esté drenada y se espere', async () => {
    const s = createPushPullStream();
    const iterator = s.read()[Symbol.asyncIterator]();
    const pending = iterator.next();
    s.fail(new Error('late'));
    await expect(pending).rejects.toThrow('late');
  });

  it('stop() corta la iteración y vacía la cola', async () => {
    const s = createPushPullStream();
    s.push(new Uint8Array([1]));
    s.push(new Uint8Array([2]));
    await s.stop();
    const chunks = await collect(s);
    expect(chunks).toEqual([]);
  });

  it('intercalar push y read entrega en orden con backpressure', async () => {
    const s = createPushPullStream();
    const received: number[] = [];
    const consumer = (async () => {
      for await (const chunk of s.read()) received.push(chunk[0]!);
    })();
    s.push(new Uint8Array([1]));
    await Promise.resolve();
    s.push(new Uint8Array([2]));
    await Promise.resolve();
    s.push(new Uint8Array([3]));
    s.end();
    await consumer;
    expect(received).toEqual([1, 2, 3]);
  });

  it('read() es re-iterable de forma segura: una segunda iteración termina al instante tras end', async () => {
    const s = createPushPullStream();
    s.push(new Uint8Array([5]));
    s.end();
    expect((await collect(s)).map((c) => c[0])).toEqual([5]);
    // Tras consumir y end, una nueva iteración no cuelga.
    expect(await collect(s)).toEqual([]);
  });
});
