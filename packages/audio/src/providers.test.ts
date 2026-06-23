import { describe, it, expect } from 'vitest';
import { createNullAudioDeviceManager } from './providers';

describe('createNullAudioDeviceManager', () => {
  it('devuelve una lista de dispositivos vacía', async () => {
    const manager = createNullAudioDeviceManager();
    await expect(manager.list()).resolves.toEqual([]);
  });
});
