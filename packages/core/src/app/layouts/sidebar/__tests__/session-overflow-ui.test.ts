import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const VIEW = read('SessionList.tsx');
const OVERFLOW = read('SessionOverflow.tsx');
const WATERMARK = read('use-session-watermark.ts');

describe('会话列表的「展开其余 N 个会话」', () => {
  it('★ 默认露出 10 条，每点一次再多 10 条，最后一步直接全开', () => {
    expect(WATERMARK).toContain('const VISIBLE_SESSIONS = 10;');
    expect(WATERMARK).toContain('watermark + VISIBLE_SESSIONS');
    expect(WATERMARK).toContain('visible.hiddenCount <= VISIBLE_SESSIONS ? ALL_SESSIONS');
  });

  it('★ 当前会话与要关注的行自动露出，自动展开最多到第 50 条', () => {
    expect(WATERMARK).toContain('requiredSessionWatermark');
    expect(WATERMARK).toContain('sessionNeedsAttention');
    expect(WATERMARK).toContain('const AUTO_VISIBLE_MAX = 50;');
  });

  it('★ 展开行是独立组件：按钮语义、开合态与两句文案都走词表', () => {
    expect(VIEW).toContain('<SessionOverflow');
    expect(OVERFLOW).toContain('<button');
    expect(OVERFLOW).toContain('type="button"');
    expect(OVERFLOW).toContain('aria-expanded={expanded}');
    expect(OVERFLOW).toContain("t('session.expand', { n: hiddenCount })");
    expect(OVERFLOW).toContain("t('session.collapse')");
  });
});
