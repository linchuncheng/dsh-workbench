import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { logTailOf, packageVersionOf } from '../diag-export-logs.js';

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

describe('读包版本', () => {
  it('★ 没有 package.json 给 null；有就读 version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ver-'));
    expect(packageVersionOf(dir)).toBeNull();

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3' }), 'utf8');
    expect(packageVersionOf(dir)).toBe('1.2.3');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('★ 没有 version 字段也给 null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ver-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');
    expect(packageVersionOf(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
