import { describe, it, expect } from 'vitest';
import {
  MurmurError,
  ConfigError,
  AudioError,
  ModelError,
  MemoryError,
  HotkeyError,
  PluginError,
} from './errors';

describe('errores', () => {
  it('MurmurError lleva código y es Error', () => {
    const e = new MurmurError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('MURMUR_ERROR');
    expect(e.name).toBe('MurmurError');
  });

  it('las subclases fijan su código y son instanceof MurmurError', () => {
    expect(new ConfigError('x').code).toBe('CONFIG_ERROR');
    expect(new AudioError('x').code).toBe('AUDIO_ERROR');
    expect(new ModelError('x').code).toBe('MODEL_ERROR');
    expect(new MemoryError('x').code).toBe('MEMORY_ERROR');
    expect(new HotkeyError('x').code).toBe('HOTKEY_ERROR');
    expect(new PluginError('x').code).toBe('PLUGIN_ERROR');
    expect(new ConfigError('x')).toBeInstanceOf(MurmurError);
    expect(new HotkeyError('x')).toBeInstanceOf(MurmurError);
    expect(new PluginError('x')).toBeInstanceOf(MurmurError);
    expect(new HotkeyError('x').name).toBe('HotkeyError');
    expect(new PluginError('x').name).toBe('PluginError');
  });
});
