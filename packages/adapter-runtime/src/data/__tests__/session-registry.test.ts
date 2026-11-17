import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSessionRegistry } from '../session-registry.js';

const MAX_PID = 2147483646;

function dirOf(): string {
  return mkdtempSync(join(tmpdir(), 'wb-sessions-'));
}

describe('会话登记：上次进程留下的要清掉', () => {
  it('★ 死掉的进程留下的会话 → stale 报出来，文件也删掉', () => {
    const dir = dirOf();
    writeFileSync(join(dir, `${String(MAX_PID)}.json`), JSON.stringify({ pid: MAX_PID, sessions: ['workbench-read-a'] }));
    const registry = createSessionRegistry({ dir, processId: 12345 });

    expect(registry.stale()).toEqual(['workbench-read-a']);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('★ 还活着的进程（自己）名下的会话不报', () => {
    const dir = dirOf();
    const registry = createSessionRegistry({ dir, processId: process.pid });
    registry.claim('workbench-read-mine');

    expect(registry.stale()).toEqual([]);
    expect(readdirSync(dir)).toEqual([`${String(process.pid)}.json`]);
  });

  it('★ 同一个会话只写一次文件（读得再多也不反复落盘）', () => {
    const dir = dirOf();
    const registry = createSessionRegistry({ dir, processId: process.pid });
    registry.claim('workbench-read-a');
    registry.claim('workbench-read-a');
    registry.claim('workbench-read-b');

    expect(JSON.parse(readFileOf(dir, process.pid)).sessions).toEqual(['workbench-read-a', 'workbench-read-b']);
  });

  it('★ release 把自己那份删掉', () => {
    const dir = dirOf();
    const registry = createSessionRegistry({ dir, processId: process.pid });
    registry.claim('workbench-read-a');
    registry.release();

    expect(readdirSync(dir)).toEqual([]);
  });

  it('★ 坏文件直接丢，不因此报错', () => {
    const dir = dirOf();
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    const registry = createSessionRegistry({ dir, processId: process.pid });

    expect(registry.stale()).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });
});

function readFileOf(dir: string, pid: number): string {
  return readFileSync(join(dir, `${String(pid)}.json`), 'utf8');
}
