import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adapterContractGaps } from '@dsh-workbench/shared/host';
import { createAdapterSet } from '../index.js';

const ctx = { get: () => undefined } as never;
const dirs: string[] = [];

function tempHome(): void {
  const home = mkdtempSync(join(tmpdir(), 'wb-adapter-contract-'));
  dirs.push(home);
  vi.stubEnv('DSH_HOME', home);
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('适配器契约（默认集合）', () => {
  it('默认集合过契约：成员、能力、health/commands、data、布局', () => {
    tempHome();
    const set = createAdapterSet(ctx);
    expect(adapterContractGaps(set, ctx)).toEqual([]);
  });

  it('能力表把 opencli 的五项都打开', () => {
    tempHome();
    const set = createAdapterSet(ctx);
    expect(set.runtime.capabilities(ctx)).toEqual({
      console: true,
      pluginMarket: true,
      browserBridge: true,
    });
  });
});
