/** Error base de murmur; todos los errores del dominio heredan de aquí. */
export class MurmurError extends Error {
  readonly code: string;

  constructor(message: string, code = 'MURMUR_ERROR', options?: ErrorOptions) {
    super(message, options);
    this.name = 'MurmurError';
    this.code = code;
  }
}

export class ConfigError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'CONFIG_ERROR', options);
    this.name = 'ConfigError';
  }
}

export class AudioError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'AUDIO_ERROR', options);
    this.name = 'AudioError';
  }
}

export class ModelError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'MODEL_ERROR', options);
    this.name = 'ModelError';
  }
}

export class MemoryError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'MEMORY_ERROR', options);
    this.name = 'MemoryError';
  }
}

export class HotkeyError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'HOTKEY_ERROR', options);
    this.name = 'HotkeyError';
  }
}

export class PluginError extends MurmurError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'PLUGIN_ERROR', options);
    this.name = 'PluginError';
  }
}
