import { describe, it, expect } from 'vitest';
import { currentTimePlugin } from './time';

describe('currentTimePlugin', () => {
  it('no requiere capacidades (plugin puro)', () => {
    const plugin = currentTimePlugin({ now: () => 0 });
    expect(plugin.name).toBe('current_time');
    expect(plugin.capabilities).toEqual([]);
  });

  it('devuelve la hora del now inyectado', async () => {
    const fixed = Date.UTC(2026, 5, 23, 12, 0, 0); // determinista
    const plugin = currentTimePlugin({ now: () => fixed });

    const result = await plugin.run({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe(new Date(fixed).toISOString());
  });

  it('usa el now en cada invocación', async () => {
    let t = 1000;
    const plugin = currentTimePlugin({ now: () => t });

    const first = await plugin.run({});
    t = 2000;
    const second = await plugin.run({});

    expect(first.output).toBe(new Date(1000).toISOString());
    expect(second.output).toBe(new Date(2000).toISOString());
  });
});
