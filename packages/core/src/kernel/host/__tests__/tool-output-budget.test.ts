import { describe, expect, it } from 'vitest';
import {
  TOOL_OUTPUT_BUDGET,
  TOOL_OUTPUT_HEAD,
  boundedPreview,
  codePointLength,
  createToolNameLedger,
  exceedsBudget,
  textOfBlocks,
} from '../tool-output-budget';

describe('工具输出预算 · 量的算法', () => {
  it('按码点量：中文与 emoji 都算一个', () => {
    expect(codePointLength('a')).toBe(1);
    expect(codePointLength('中')).toBe(1);
    expect(codePointLength('😀')).toBe(1);
  });

  it('预算内不动；超了才要兜底', () => {
    expect(exceedsBudget('x'.repeat(TOOL_OUTPUT_BUDGET))).toBe(false);
    expect(exceedsBudget('x'.repeat(TOOL_OUTPUT_BUDGET + 1))).toBe(true);
  });

  it('只有整份都是文本块才兜得住；带图的一律放回去', () => {
    expect(textOfBlocks([{ type: 'text', text: 'ab' }])).toBe('ab');
    expect(textOfBlocks([{ type: 'image' } as never])).toBeUndefined();
  });
});

describe('工具输出预算 · 预览与省略说明', () => {
  const big = Array.from({ length: 20000 }, () => '中').join('');

  it('★ 头尾各留一段，中间给省略号与取回路径', () => {
    const block = boundedPreview(big, { locator: '/tmp/x.txt', retrievalHint: 'ignored' })[0];
    const text = block.type === 'text' ? block.text : '';
    expect(text.startsWith('中'.repeat(TOOL_OUTPUT_HEAD))).toBe(true);
    expect(text).toContain('\n\n[...]\n\n');
    expect(text).toContain('/tmp/x.txt');
    expect(text).toContain('已省略');
    expect(text.length).toBeLessThan(TOOL_OUTPUT_BUDGET);
  });

  it('★★ 落不了盘：说清存不下，不假装有路径', () => {
    const block = boundedPreview(big, null)[0];
    const text = block.type === 'text' ? block.text : '';
    expect(text).toContain('存不下');
    expect(text).not.toContain('/tmp');
  });
});

describe('工具输出预算 · 工具名台账', () => {
  it('记过的才算工作台的；没记的不碰', () => {
    const names = createToolNameLedger();
    names.add('workbench_demo_list');
    expect(names.has('workbench_demo_list')).toBe(true);
    expect(names.has('read')).toBe(false);
    expect(names.size).toBe(1);
  });
});
