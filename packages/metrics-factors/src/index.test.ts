import { describe, expect, it } from 'vitest';
import { PERFORMANCE_FACTORS } from './index';

describe('metrics-factors', () => {
  it('exposes IK_CHAIN_LENGTH_FACTOR', () => {
    expect(PERFORMANCE_FACTORS.IK_CHAIN_LENGTH_FACTOR).toBeGreaterThan(0);
  });
});
