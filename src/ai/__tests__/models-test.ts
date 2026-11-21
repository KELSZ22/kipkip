import { chooseTier, formatBytes, modelForTier } from '@/ai/models';

const GIBIBYTE = 1024 ** 3;

describe('chooseTier', () => {
  it('uses the tiny model under 6 GB and when RAM is unknown', () => {
    expect(chooseTier(null)).toBe('tiny');
    expect(chooseTier(6 * GIBIBYTE - 1)).toBe('tiny');
  });

  it('uses the small model from 6 GB until 12 GB', () => {
    expect(chooseTier(6 * GIBIBYTE)).toBe('small');
    expect(chooseTier(12 * GIBIBYTE - 1)).toBe('small');
  });

  it('uses the larger model at 12 GB and above', () => {
    expect(chooseTier(12 * GIBIBYTE)).toBe('large');
  });

  it('points each tier at the configured Qwen file', () => {
    expect(modelForTier('tiny').id).toBe('qwen2.5-0.5b-q4');
    expect(modelForTier('small').bytes).toBeGreaterThan(modelForTier('tiny').bytes);
    expect(modelForTier('large').sha256).toHaveLength(64);
    expect(formatBytes(modelForTier('tiny').bytes)).toBe('491 MB');
  });
});
