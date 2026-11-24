import { describe, expect, it } from 'vitest';
import { readBridgeReport } from '../bridge-report.js';

const TEXT_OK = [
  'opencli v2.0.2 doctor (node v24.15.0)',
  '',
  '[OK] Daemon: running on port 19825 (v2.0.2)',
  '[OK] Extension: connected (v1.0.27)',
  '[OK] Connectivity: connected in 0.0s',
  '',
  'Everything looks good!',
].join('\n');

function jsonReport(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, data });
}

const GOOD = {
  cliVersion: '2.0.3',
  daemonRunning: true,
  daemonFlaky: false,
  daemonStale: false,
  extensionConnected: true,
  extensionFlaky: false,
  extensionVersion: '1.0.27',
  extensionOutdated: false,
  connectivity: { ok: true, durationMs: 13 },
  profiles: [{ contextId: 'abc', extensionConnected: true, pending: 0 }],
  issues: [],
};

describe('readBridgeReport：手上的 doctor 是 JSON 还是文本', () => {
  it('★ 2.x 的 JSON、一切正常 → ok，detail 带版本', () => {
    const report = readBridgeReport(jsonReport(GOOD));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.detail).toContain('2.0.3');
    expect(report.detail).toContain('1.0.27');
  });

  it('★ 2.x 的 JSON、daemon 是旧进程 → stale，detail 照抄它给的 issues', () => {
    const report = readBridgeReport(
      jsonReport({
        ...GOOD,
        daemonStale: true,
        issues: ['Stale daemon detected: daemon v2.0.2 != CLI v2.0.3.'],
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.issues).toContain('stale');
    expect(report.detail).toContain('Stale daemon');
  });

  it('★ 2.x 的 JSON、扩展没连上 → extension', () => {
    const report = readBridgeReport(
      jsonReport({ ...GOOD, extensionConnected: false, profiles: [], issues: ['Extension not connected'] }),
    );

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(['extension']);
  });

  it('★ 2.x 的 JSON、扩展太旧 → 也算 extension 的账', () => {
    const report = readBridgeReport(jsonReport({ ...GOOD, extensionOutdated: true }));

    expect(report.issues).toContain('extension');
  });

  it('★ 多个 profile 同时连着 → profile', () => {
    const report = readBridgeReport(
      jsonReport({
        ...GOOD,
        profiles: [{ contextId: 'a' }, { contextId: 'b' }],
        issues: ['Multiple Chrome profiles are connected'],
      }),
    );

    expect(report.issues).toContain('profile');
  });

  it('★ 1.x 的文本输出仍然读得懂（灰度期两边都能跑）', () => {
    const report = readBridgeReport(TEXT_OK);

    expect(report.ok).toBe(true);
    expect(report.detail).toBe('Everything looks good!');
  });

  it('★★ 旧 CLI 说 daemon 是旧进程（stale; CLI vX）→ 认成 stale，不只当它没起来', () => {
    const report = readBridgeReport(
      [
        'opencli v1.8.8 doctor (node v24.21.0)',
        '',
        '[WARN] Daemon: running on port 19825 (v2.0.3, stale; CLI v1.8.8)',
        '[OK] Extension: connected (v1.0.27)',
        '[OK] Connectivity: connected in 0.0s',
      ].join('\n'),
    );

    expect(report.issues).toContain('stale');
    expect(report.issues).toContain('daemon');
  });

  it('★★ 版本对不上的另一种写法（v2.0.3 != CLI v2.0.2）也认成 stale', () => {
    const report = readBridgeReport(
      [
        'opencli v2.0.2 doctor (node v24.15.0)',
        '',
        '[STALE] Daemon: running on port 19825 (v2.0.3 != CLI v2.0.2)',
        '[OK] Extension: connected (v1.0.24)',
      ].join('\n'),
    );

    expect(report.issues).toContain('stale');
  });

  it('★ 读不懂的输出 → unknown，不假装通过', () => {
    const report = readBridgeReport('{"ok":true}');

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(['unknown']);
  });

  it('★★ 三行都 OK，但 Issues 里说扩展和 CLI 不兼容 → 不算过，归到 extension', () => {
    const report = readBridgeReport(
      [
        'opencli v2.0.3 doctor (node v24.15.0)',
        '',
        '[OK] Daemon: running on port 19825 (v2.0.3)',
        '[OK] Extension: connected (v1.0.27)',
        '[OK] Connectivity: connected in 0.0s',
        '',
        'Issues:',
        'CLI version incompatible with extension: extension v1.0.27 requires CLI <2.0.0, but CLI is v2.0.3',
      ].join('\n'),
    );

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(['extension-incompatible']);
    expect(report.detail).toContain('incompatible');
    expect(report.facts?.extension).toBe('1.0.27');
  });

  it('★ 文本报告也带 facts：扩展版本与连上了', () => {
    const report = readBridgeReport(
      [
        '[OK] Daemon: running on port 19825 (v2.0.3)',
        '[OK] Extension: connected (v1.0.27)',
        '[OK] Connectivity: connected in 0.0s',
        '',
        'Everything looks good!',
      ].join('\n'),
    );

    expect(report.ok).toBe(true);
    expect(report.facts).toEqual({ extension: '1.0.27', connected: true });
  });
});

describe('readBridgeReport：把 JSON 里的可用事实带出来', () => {
  it('★ 正常时的 facts：扩展版本、连通耗时、连上了、不是旧进程', () => {
    const report = readBridgeReport(jsonReport(GOOD));

    expect(report.facts).toEqual({ extension: '1.0.27', connectivityMs: 13, connected: true });
  });

  it('★ daemon 旧进程时 facts.stale 为真（界面据此提示重启一次）', () => {
    const report = readBridgeReport(jsonReport({ ...GOOD, daemonStale: true, issues: ['stale'] }));

    expect(report.facts?.stale).toBe(true);
  });
});
