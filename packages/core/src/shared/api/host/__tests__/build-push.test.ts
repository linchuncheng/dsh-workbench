import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchBuildPush } from '../build-push';

const stops: Array<() => void> = [];
const dirs: string[] = [];

function outbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-outbox-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function watchBox(dir: string, onPush: (unit: string) => void, settleMs = 10): void {
  stops.push(watchBuildPush(dir, { onPush: (push) => onPush(push.unit), settleMs }));
}

function armed(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

describe('watchBuildPush（构建完就推，不轮询）', () => {
  it('目录不存在就建出来，并留下 .keep（监听根要有实体）', () => {
    const dir = join(outbox(), 'outbox');
    watchBox(dir, () => undefined);

    expect(readdirSync(dir)).toEqual(['.keep']);
  });

  it('新写的推送会带出 unit', async () => {
    const dir = outbox();
    const pushed: string[] = [];
    watchBox(dir, (unit) => pushed.push(unit));
    await armed();

    writeFileSync(join(dir, 'demo.json'), JSON.stringify({ unit: 'demo' }), 'utf8');

    await vi.waitFor(() => expect(pushed).toEqual(['demo']), { timeout: 5_000, interval: 25 });
  });

  it('开监听之前就有的推送不补发（构建发生在启动前，启动时本来就会读新文件）', async () => {
    const dir = outbox();
    const pushed: string[] = [];
    writeFileSync(join(dir, 'old.json'), JSON.stringify({ unit: 'old' }), 'utf8');
    watchBox(dir, (unit) => pushed.push(unit));
    await armed();

    writeFileSync(join(dir, 'new.json'), JSON.stringify({ unit: 'fresh' }), 'utf8');

    await vi.waitFor(() => expect(pushed).toEqual(['fresh']), { timeout: 5_000, interval: 25 });
  });

  it('同一个 unit 再次构建：按 mtime 再推一次', async () => {
    const dir = outbox();
    const pushed: string[] = [];
    watchBox(dir, (unit) => pushed.push(unit));
    await armed();

    writeFileSync(join(dir, 'demo.json'), JSON.stringify({ unit: 'demo' }), 'utf8');
    await vi.waitFor(() => expect(pushed).toHaveLength(1), { timeout: 5_000, interval: 25 });

    writeFileSync(join(dir, 'demo.json'), JSON.stringify({ unit: 'demo' }), 'utf8');
    await vi.waitFor(() => expect(pushed).toHaveLength(2), { timeout: 5_000, interval: 25 });
  });

  it('坏文件与缺少 unit 的只 warn，不推', async () => {
    const dir = outbox();
    const warned: string[] = [];
    const pushed: string[] = [];
    stops.push(
      watchBuildPush(dir, {
        onPush: (push) => pushed.push(push.unit),
        settleMs: 10,
        logger: { warn: (message) => warned.push(message) },
      }),
    );

    writeFileSync(join(dir, 'bad.json'), '{ 这不是 JSON', 'utf8');
    writeFileSync(join(dir, 'empty.json'), JSON.stringify({ unit: '' }), 'utf8');

    await vi.waitFor(
      () => {
        const text = warned.join('\n');
        expect(text).toContain('无法读取构建推送');
        expect(text).toContain('缺少 unit');
      },
      { timeout: 5_000, interval: 25 },
    );
    expect(pushed).toEqual([]);
  });

  it('停掉之后不再推', async () => {
    const dir = outbox();
    const pushed: string[] = [];
    watchBox(dir, (unit) => pushed.push(unit));
    await armed();
    stops.splice(0).forEach((stop) => stop());

    writeFileSync(join(dir, 'demo.json'), JSON.stringify({ unit: 'demo' }), 'utf8');

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(pushed).toEqual([]);
  });
});
