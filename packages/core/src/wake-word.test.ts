import { describe, it, expect, vi } from 'vitest';
import {
  createMockWakeWordDetector,
  createNullWakeWordDetector,
  type WakeWordDetector,
} from './wake-word';

describe('createMockWakeWordDetector', () => {
  it('arranca deshabilitado y se habilita tras start()', async () => {
    const detector = createMockWakeWordDetector();
    expect(detector.enabled).toBe(false);
    await detector.start(() => {});
    expect(detector.enabled).toBe(true);
  });

  it('triggerDetection() llama a onDetected tras start()', async () => {
    const onDetected = vi.fn();
    const detector = createMockWakeWordDetector();
    await detector.start(onDetected);

    detector.triggerDetection();
    detector.triggerDetection();

    expect(onDetected).toHaveBeenCalledTimes(2);
  });

  it('triggerDetection() antes de start() no llama a onDetected', () => {
    const detector = createMockWakeWordDetector();
    // No debe lanzar ni llamar nada (no hay handler registrado).
    expect(() => detector.triggerDetection()).not.toThrow();
  });

  it('stop() desactiva el detector: triggerDetection ya no llama a onDetected', async () => {
    const onDetected = vi.fn();
    const detector = createMockWakeWordDetector();
    await detector.start(onDetected);

    await detector.stop();
    expect(detector.enabled).toBe(false);

    detector.triggerDetection();
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('re-start() tras stop() vuelve a enlazar el nuevo onDetected', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const detector = createMockWakeWordDetector();

    await detector.start(first);
    await detector.stop();
    await detector.start(second);

    detector.triggerDetection();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cumple la interfaz WakeWordDetector', () => {
    const detector: WakeWordDetector = createMockWakeWordDetector();
    expect(typeof detector.start).toBe('function');
    expect(typeof detector.stop).toBe('function');
    expect(typeof detector.enabled).toBe('boolean');
  });
});

describe('createNullWakeWordDetector', () => {
  it('es no-op: nunca dispara y siempre está deshabilitado', async () => {
    const onDetected = vi.fn();
    const detector = createNullWakeWordDetector();

    expect(detector.enabled).toBe(false);
    await detector.start(onDetected);
    expect(detector.enabled).toBe(false);
    await detector.stop();
    expect(onDetected).not.toHaveBeenCalled();
  });
});
