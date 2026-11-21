import { describe, expect, it } from 'vitest';
import { DIAG_BUNDLE_SCHEMA, buildDiagBundle, redactText } from '../diag-bundle.js';
import type { DiagRecord } from '../diag-records.js';

function recordOf(at: number): DiagRecord {
  return { ts: at, level: 'warn', code: 'READ_FAILED', class: 'env', area: 'panels', corrId: 'c-1' };
}

function inputOf(over: Parameters<typeof buildDiagBundle>[0] extends infer T ? Partial<T> : never = {}) {
  return {
    at: '2026-11-21T10:00:00.000Z',
    env: { version: '1.4.3', profile: '/Users/me/.dsh/profiles/workbench' },
    config: { patch: 'ok', dependencies: { '@acme/x': '1.0.0' } },
    runtime: { panels: [recordOf(1)], logs: ['started'] },
    records: [recordOf(1), recordOf(2)],
    checks: { swallow: 514 },
    ...over,
  };
}

describe('诊断目录', () => {
  it('★ 清单齐全、带 schema 版本、文件都兑现', () => {
    const bundle = buildDiagBundle(inputOf());

    expect(bundle.manifest['schema']).toBe(DIAG_BUNDLE_SCHEMA);
    expect(bundle.files).toMatchObject({
      'env.json': expect.any(String),
      'config.json': expect.any(String),
      'runtime.json': expect.any(String),
      'records.jsonl': expect.any(String),
      'checks.json': expect.any(String),
      'manifest.json': expect.any(String),
    });
    expect(bundle.truncated).toEqual([]);
  });

  it('★ 脱敏：敏感键剔除、绝对路径换成片段+短哈希', () => {
    const bundle = buildDiagBundle(
      inputOf({
        env: { token: 'abc', nested: { apiKey: 'k', ok: 'x' }, profile: '/Users/me/.dsh/profiles/workbench' },
      }),
    );

    const env = bundle.files['env.json'] ?? '';
    expect(env).not.toContain('abc');
    expect(env).not.toContain('apiKey');
    expect(env).not.toContain('/Users/me');
    expect(env).toContain('<path:workbench:');
  });

  it('redactText 保留周围的引号与空白', () => {
    expect(redactText('cwd: "/Users/me/proj" ok')).toMatch(/^cwd: "<path:proj:[0-9a-f]{6}>" ok$/);
  });

  it('★ 超限时按 记录 → 日志 → 面板 的顺序截断，并写进 manifest', () => {
    const many = Array.from({ length: 200 }, (_, index) => recordOf(index));
    const bundle = buildDiagBundle(
      inputOf({ records: many, maxBytes: 3_000 }),
    );

    expect(bundle.truncated[0]).toBe('records');
    expect(bundle.manifest['truncated']).toEqual(bundle.truncated);
    expect((bundle.files['records.jsonl'] ?? '').length).toBeLessThan(many.length * 40);
  });
});
