import { describe, it, expect } from 'vitest';
import { ANCHORS, anchorStyle } from './anchor';

describe('ANCHORS', () => {
  it('expone las cinco anclas con bottom-center primero', () => {
    expect(ANCHORS).toEqual([
      'bottom-center',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
  });
});

describe('anchorStyle', () => {
  it('siempre fija la posición a fixed', () => {
    for (const anchor of ANCHORS) {
      expect(anchorStyle(anchor).position).toBe('fixed');
    }
  });

  it('bottom-center centra horizontalmente con transform', () => {
    const style = anchorStyle('bottom-center');
    expect(style.bottom).toBe('var(--mur-anchor-gap)');
    expect(style.left).toBe('50%');
    expect(style.transform).toBe('translateX(-50%)');
    expect(style.top).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  it('top-left ancla arriba a la izquierda sin transform', () => {
    const style = anchorStyle('top-left');
    expect(style.top).toBe('var(--mur-anchor-gap)');
    expect(style.left).toBe('var(--mur-anchor-gap)');
    expect(style.transform).toBeUndefined();
    expect(style.bottom).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  it('top-right ancla arriba a la derecha', () => {
    const style = anchorStyle('top-right');
    expect(style.top).toBe('var(--mur-anchor-gap)');
    expect(style.right).toBe('var(--mur-anchor-gap)');
    expect(style.left).toBeUndefined();
    expect(style.bottom).toBeUndefined();
  });

  it('bottom-left ancla abajo a la izquierda', () => {
    const style = anchorStyle('bottom-left');
    expect(style.bottom).toBe('var(--mur-anchor-gap)');
    expect(style.left).toBe('var(--mur-anchor-gap)');
    expect(style.top).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  it('bottom-right ancla abajo a la derecha', () => {
    const style = anchorStyle('bottom-right');
    expect(style.bottom).toBe('var(--mur-anchor-gap)');
    expect(style.right).toBe('var(--mur-anchor-gap)');
    expect(style.top).toBeUndefined();
    expect(style.left).toBeUndefined();
  });
});
