import { describe, expect, it } from 'vitest';
import { countHidden, prefill, revealMask } from './prefill';

const letters = (s: string) => Array.from(s).filter((c) => /\p{L}/u.test(c)).length;

describe('prefill', () => {
  it('very hard hides every letter but keeps spaces and hyphens', () => {
    expect(prefill('bank', { difficulty: 'very_hard', seed: 1 })).toBe('_ _ _ _');
    expect(prefill('look after', { difficulty: 'very_hard', seed: 1 })).toBe('_ _ _ _   _ _ _ _ _');
    expect(prefill('mother-in-law', { difficulty: 'very_hard', seed: 1, style: 'compact' })).toBe('______-__-___');
  });

  it('easy and medium always show the first letter of each word', () => {
    for (const seed of [1, 2, 3, 99, 1234]) {
      expect(prefill('boarding pass', { difficulty: 'easy', seed, style: 'compact' })).toMatch(/^b\S* p/);
      expect(prefill('boarding pass', { difficulty: 'medium', seed, style: 'compact' })).toMatch(/^b\S* p/);
    }
  });

  it('shows fewer letters as difficulty rises', () => {
    const word = 'itinerary';
    const h = (d: 'easy' | 'medium' | 'hard' | 'very_hard') => countHidden(word, d, 7);
    expect(h('easy')).toBeLessThan(h('medium'));
    expect(h('medium')).toBeLessThan(h('hard'));
    expect(h('hard')).toBeLessThan(h('very_hard'));
    expect(h('very_hard')).toBe(letters(word));
  });

  it('always hides at least one letter, except never on non-letters', () => {
    for (const d of ['easy', 'medium', 'hard'] as const)
      for (const w of ['go', 'cat', 'bank', 'ubiquitous']) expect(countHidden(w, d, 5)).toBeGreaterThanOrEqual(1);
  });

  it('is stable for the same seed and changes with a new seed', () => {
    const a = prefill('ubiquitous', { difficulty: 'medium', seed: 11 });
    expect(prefill('ubiquitous', { difficulty: 'medium', seed: 11 })).toBe(a);
    const others = [12, 13, 14, 15, 16].map((s) => prefill('ubiquitous', { difficulty: 'medium', seed: s }));
    expect(others.some((o) => o !== a)).toBe(true);
  });

  it('handles Polish/accented letters as letters', () => {
    expect(revealMask('źdźbło', 'very_hard', 1).every((v) => !v)).toBe(true);
  });
});
