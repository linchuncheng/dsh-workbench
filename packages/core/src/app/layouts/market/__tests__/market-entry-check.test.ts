import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../panel.tsx', import.meta.url), 'utf8');

describe('进市场页要不要补一次检查', () => {
  it('★ 判据认版本检查自己的时刻（上一回真去问过的那次），不是能力探针那个', () => {
    expect(page).toContain('checkedAt: moduleVersionsCheckedAt(versions)');
    expect(page).not.toMatch(/useMarketReload\(\{\s*checkedAt,/);
  });
});