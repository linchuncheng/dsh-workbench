import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { preflightEvidenceOf, readPreflightSnapshot } from '../diag-preflight.js';

describe('读启动检查快照', () => {
  it('★ 没有文件给 null，不抛', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-preflight-'));
    expect(readPreflightSnapshot(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('★ 有文件就解析出内容', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-preflight-'));
    fs.writeFileSync(path.join(dir, 'preflight.json'), JSON.stringify({ phase: 'ready', at: 1 }), 'utf8');

    expect(readPreflightSnapshot(dir)).toEqual({ phase: 'ready', at: 1 });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('启动检查摘要（给 agent 的症状，不带日志）', () => {
  it('★ 步骤只留 id/status/detail，日志不进摘要；缺口与事实原样保留', () => {
    const evidence = preflightEvidenceOf(
      {
        phase: 'ready',
        at: 10,
        steps: [
          { id: 'cli', status: 'ok', detail: '2.0.3', log: ['第一行', '第二行'] },
          { id: 'diy', status: 'warn', detail: 'never started', command: 'npm i -g x', log: ['log'] },
        ],
        diyGap: { kind: 'broken-row', rows: ['tool-schedule'], detail: 'never started' },
        hostGap: { tier: 'older', runtime: '0.2.2', verified: '0.2.3' },
        hostFacts: { version: '0.2.2', verified: '0.2.3' },
        paths: { workbenchRoot: '/tmp/wb', dshHome: '/tmp/home' },
        bridgeIssues: ['extension'],
      },
      '/tmp/wb',
    );

    expect(evidence?.steps).toEqual([
      { id: 'cli', status: 'ok', detail: '2.0.3' },
      { id: 'diy', status: 'warn', detail: 'never started', command: 'npm i -g x' },
    ]);
    expect(evidence?.diy).toMatchObject({ kind: 'broken-row' });
    expect(evidence?.host).toMatchObject({ tier: 'older' });
    expect(evidence?.facts).toMatchObject({ version: '0.2.2' });
    expect(evidence?.paths).toMatchObject({ workbenchRoot: '/tmp/wb' });
    expect(evidence?.bridgeIssues).toEqual(['extension']);
    expect(evidence?.evidence).toBe('/tmp/wb/preflight.json');
    expect(JSON.stringify(evidence)).not.toContain('第一行');
  });

  it('★ 失败态带 failure/guidance/error', () => {
    const evidence = preflightEvidenceOf(
      { phase: 'failed', failure: 'network', guidance: 'install', error: 'EAI_AGAIN', steps: [] },
      '/tmp/wb',
    );

    expect(evidence).toMatchObject({ phase: 'failed', failure: 'network', guidance: 'install', error: 'EAI_AGAIN' });
  });

  it('★ 不是快照（旧格式 / 被改坏）→ null，不硬编字段', () => {
    expect(preflightEvidenceOf(null, '/tmp/wb')).toBeNull();
    expect(preflightEvidenceOf('ready', '/tmp/wb')).toBeNull();
    expect(preflightEvidenceOf({ at: 1 }, '/tmp/wb')).toBeNull();
  });
});
