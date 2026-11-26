import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outboxDirOf, pushBuild } from '../build/push.mjs';

const dirs = [];
const beforeHome = process.env.DSH_WORKBENCH_HOME;
const beforeStage = process.env.DSH_WB_RELEASE_HOME;

function workbench(withDiy) {
  const home = mkdtempSync(join(tmpdir(), 'wb-push-'));
  dirs.push(home);
  if (withDiy) mkdirSync(join(home, 'diy'), { recursive: true });
  process.env.DSH_WORKBENCH_HOME = home;
  delete process.env.DSH_WB_RELEASE_HOME;
  return home;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (beforeHome === undefined) delete process.env.DSH_WORKBENCH_HOME;
  else process.env.DSH_WORKBENCH_HOME = beforeHome;
  if (beforeStage === undefined) delete process.env.DSH_WB_RELEASE_HOME;
  else process.env.DSH_WB_RELEASE_HOME = beforeStage;
});

describe('pushBuild（构建完直接推给运行中的工作台）', () => {
  it('写进 diy/outbox：带 unit、源目录与产物时间', () => {
    const home = workbench(true);

    const pushed = pushBuild({
      unit: 'demo',
      root: '/w/demo',
      files: [{ path: 'client.js', mtimeMs: 42 }],
      now: new Date('2026-01-02T03:04:05.000Z'),
    });

    expect(pushed.ok).toBe(true);
    const body = JSON.parse(readFileSync(join(home, 'diy', 'outbox', 'demo.json'), 'utf8'));
    expect(body).toEqual({
      unit: 'demo',
      dir: '/w/demo',
      at: '2026-01-02T03:04:05.000Z',
      files: [{ path: 'client.js', mtimeMs: 42 }],
      pid: process.pid,
    });
  });

  it('没有工坊就跳过，不在别人的机器上乱写', () => {
    const home = workbench(false);

    const pushed = pushBuild({ unit: 'demo', root: '/w/demo' });

    expect(pushed).toEqual({ ok: false, skipped: true, reason: '没有工坊目录（工作台可能没有安装）' });
    expect(existsSync(join(home, 'diy'))).toBe(false);
  });

  it('unit 里的怪字符不进文件名（读的是 payload 里的 unit）', () => {
    const home = workbench(true);

    pushBuild({ unit: 'acme/demo:v2', root: '/w/demo' });

    expect(existsSync(join(outboxDirOf(home), 'acme_demo_v2.json'))).toBe(true);
  });
});
