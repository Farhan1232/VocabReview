import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION, describeRetention, intervalScale, MAX_RETENTION, MIN_RETENTION } from './retention';

describe('review frequency', () => {
  it('the default changes nothing', () => {
    expect(intervalScale(DEFAULT_RETENTION)).toBe(1);
    expect(describeRetention(DEFAULT_RETENTION)).toBe('The FSRS default.');
  });
  it('higher retention means shorter gaps, lower means longer', () => {
    expect(intervalScale(MAX_RETENTION)).toBeLessThan(1);
    expect(intervalScale(MIN_RETENTION)).toBeGreaterThan(1);
    expect(describeRetention(0.95)).toContain('more often');
    expect(describeRetention(0.95)).toContain('2.5×');
    expect(describeRetention(0.8)).toContain('less often');
    expect(describeRetention(0.8)).toContain('3.3×');
  });
});
