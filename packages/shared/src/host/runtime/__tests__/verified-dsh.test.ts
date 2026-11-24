import { describe, expect, it } from 'vitest';
import { VERIFIED_DSH, dshHostGapOf, dshTierOf } from '../verified-dsh.js';

describe('运行中的 dsh 与验证过的 dsh 分档', () => {
  it('同代（major.minor 相同）不打扰：补丁版与预发布版都算已验证', () => {
    expect(dshTierOf('0.2.3', '0.2.3-alpha.2')).toBe('ok');
    expect(dshTierOf('0.2.5-rc.1', '0.2.3-alpha.2')).toBe('ok');
    expect(dshTierOf('0.2.3-alpha.2', '0.2.3-alpha.2')).toBe('ok');
  });

  it('跨代才算未验证', () => {
    expect(dshTierOf('0.3.0-rc.1', '0.2.3-alpha.2')).toBe('newer');
    expect(dshTierOf('1.0.0', '0.2.3-alpha.2')).toBe('newer');
  });

  it('低于下限算版本过低，预发布边界不漏', () => {
    expect(dshTierOf('0.2.3-alpha.1', '0.2.3-alpha.2')).toBe('older');
    expect(dshTierOf('0.2.2-rc.5', '0.2.3-alpha.2')).toBe('older');
  });

  it('读不到或读不懂就当不知道，不猜', () => {
    expect(dshTierOf(undefined)).toBe('unknown');
    expect(dshTierOf('')).toBe('unknown');
    expect(dshTierOf('garbage')).toBe('unknown');
    expect(dshTierOf('0.2.3', 'garbage')).toBe('unknown');
  });

  it('★ 缺省以常量为准：它必须和 engines.dsh 一致（由自动检查钉住）', () => {
    expect(VERIFIED_DSH).toBe('0.2.3-alpha.2');
    expect(dshTierOf('0.2.3')).toBe('ok');
  });
});

describe('给启动检查的缺口对象', () => {
  it('同代 / 不知道都不出缺口', () => {
    expect(dshHostGapOf('0.2.3', '0.2.3-alpha.2')).toBeUndefined();
    expect(dshHostGapOf(undefined)).toBeUndefined();
  });

  it('★ 跨代出缺口，带运行版本与验证版本，不带命令（命令由调用方补一处真相）', () => {
    expect(dshHostGapOf('0.3.0-rc.1', '0.2.3-alpha.2')).toEqual({
      tier: 'newer',
      runtime: '0.3.0-rc.1',
      verified: '0.2.3-alpha.2',
    });
  });

  it('版本过低出缺口，版本号原样不改写', () => {
    expect(dshHostGapOf(' 0.2.2-rc.5 ', '0.2.3-alpha.2')).toEqual({
      tier: 'older',
      runtime: '0.2.2-rc.5',
      verified: '0.2.3-alpha.2',
    });
  });
});
