import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFormHtml } from '../diy-form-file';

describe('表单快照落盘：跟捕获文件并排，名字一眼认得', () => {
  it('★★ rec-demo.jsonl → rec-demo-form.html，内容原样', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-form-'));
    const capture = join(dir, 'rec-demo.jsonl');

    const file = writeFormHtml(capture, '<form><input name="a" required></form>');

    expect(file).toBe(join(dir, 'rec-demo-form.html'));
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('required');
  });

  it.skipIf(process.platform === 'win32')('★ 目录不可写 ⇒ 返回空串，不抛（收工那一刻不能因为存不下就失败）', () => {
    expect(writeFormHtml('/definitely/not/here/rec-demo.jsonl', '<form></form>')).toBe('');
  });
});
