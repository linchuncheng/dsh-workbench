import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPreflightSnapshot } from '../diag-preflight.js';

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
