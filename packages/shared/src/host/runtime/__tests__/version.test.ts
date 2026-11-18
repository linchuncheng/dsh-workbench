import { describe, expect, it } from 'vitest';
import { isBetaVersion } from '../version.js';

describe('isBetaVersion', () => {
  it('beta 通道算 beta，rc / alpha / 正式版不算', () => {
    expect(isBetaVersion('1.4.0-beta.0')).toBe(true);
    expect(isBetaVersion('1.4.0-BETA.1')).toBe(true);
    expect(isBetaVersion('1.4.0-beta')).toBe(true);
    expect(isBetaVersion('1.4.0-rc.0')).toBe(false);
    expect(isBetaVersion('1.4.0-alpha.1')).toBe(false);
    expect(isBetaVersion('1.4.0')).toBe(false);
    expect(isBetaVersion('not-a-version')).toBe(false);
  });
});
