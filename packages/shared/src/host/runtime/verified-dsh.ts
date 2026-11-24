import semver from 'semver';
import type { PreflightHostGap } from '../supply/preflight.js';

export const VERIFIED_DSH = '0.2.2-rc.2';

export type DshTier = 'ok' | 'newer' | 'older' | 'unknown';

export function dshTierOf(runtime: string | undefined, verified: string = VERIFIED_DSH): DshTier {
  const got = runtime?.trim() ?? '';
  if (semver.valid(got) === null || semver.valid(verified) === null) return 'unknown';
  if (semver.lt(got, verified)) return 'older';
  const have = semver.parse(got);
  const want = semver.parse(verified);
  if (have === null || want === null) return 'unknown';
  return have.major === want.major && have.minor === want.minor ? 'ok' : 'newer';
}

export function dshHostGapOf(runtime: string | undefined, verified: string = VERIFIED_DSH): PreflightHostGap | undefined {
  const tier = dshTierOf(runtime, verified);
  if (tier !== 'newer' && tier !== 'older') return undefined;
  return { tier, runtime: (runtime ?? '').trim(), verified };
}
