import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { patchBlocks, spannedBlocks } from '../patch-blocks.js';

const LF = ['- insert:', '  - id: ui-sidebar', '- id: ui-shell', '  name: shell', ''].join('\n');

const CRLF = ['- insert:', '  - id: ui-sidebar', '- id: ui-shell', '  name: shell', ''].join('\r\n');

describe('patch 分块：行尾 CRLF 与 LF 同解', () => {
  it('CRLF 下 - insert: 仍然算 insert 块（Windows 上记事本存过就是 CRLF）', () => {
    const [insert] = patchBlocks(CRLF);
    expect(insert?.insert).toBe(true);
    expect(insert?.key).toBe('insert:ui-sidebar');
  });

  it('LF 下结论一致', () => {
    const [insert] = patchBlocks(LF);
    expect(insert?.insert).toBe(true);
    expect(insert?.key).toBe('insert:ui-sidebar');
  });

  it('CRLF 下 id 块的 id 不带回车', () => {
    const blocks = patchBlocks(CRLF);
    expect(blocks.map((one) => one.key)).toEqual(['insert:ui-sidebar', 'id:ui-shell']);
    expect(blocks[1]?.id).toBe('ui-shell');
    expect(blocks[1]?.names).toEqual(['shell']);
  });

  it('CRLF 与 LF 的分块行号一致（调用点按 from/to 回原文切片）', () => {
    const lf = spannedBlocks(LF).map((one) => [one.from, one.to]);
    const crlf = spannedBlocks(CRLF).map((one) => [one.from, one.to]);
    expect(crlf).toEqual(lf);
    expect(crlf).toEqual([
      [0, 2],
      [2, 5],
    ]);
  });
});

describe('patch 分块：YAML 节点区间', () => {
  it('!!js 自定义标签不挡分块', () => {
    const text = readFileSync(
      new URL('../../supply/__tests__/fixtures/patch/with-js-tags.yml', import.meta.url),
      'utf8',
    );
    expect(patchBlocks(text).map((one) => one.key)).toEqual(['id:webserver', 'insert:workbench']);
  });

  it('块标量里的 - 不当成新块', () => {
    const text = ['- id: a', '  config:', '    body: |', '      - not a block', '- id: b', ''].join('\n');
    expect(patchBlocks(text).map((one) => one.key)).toEqual(['id:a', 'id:b']);
  });

  it('坏 YAML 明确抛，不猜', () => {
    expect(() => patchBlocks('- id: [')).toThrow(/无法解析/);
  });
});
