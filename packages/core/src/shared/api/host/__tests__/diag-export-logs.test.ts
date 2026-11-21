import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { logTailOf } from '../diag-export-logs.js';

describe('日志尾巴', () => {
  it('★ 文件不存在给 null，不抛', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-log-'));
    expect(logTailOf(path.join(dir, 'nope.log'))).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('★ 超长只留尾巴，起点落在字节边界内', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-log-'));
    const file = path.join(dir, 'self.log');
    fs.writeFileSync(file, `${'a'.repeat(100)}TAIL`, 'utf8');

    expect(logTailOf(file, 8)).toBe('aaaaTAIL');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
