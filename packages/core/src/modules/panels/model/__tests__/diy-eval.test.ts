import { describe, expect, it } from 'vitest';
import { evalPayloadOf } from '../diy-eval';
import { RECORD_ARM_SCRIPTS } from '../diy-record-scripts';

const HOSTILE = /["&|<>%$`\r\n]/;

const decodedOf = (payload: string): string => {
  const flat = payload.replace(/['"\\]/g, '');
  const encoded = /atob\(([A-Za-z0-9+/=]+)\)/.exec(flat)?.[1] ?? '';
  return Buffer.from(encoded, 'base64').toString('utf8');
};

describe('注入页面的 JS：先包成 base64 再交给壳', () => {
  it('★★ 负载里一个 shell 元字符都没有（Windows 的 .cmd 会剥引号、按 & 断句）', () => {
    for (const script of RECORD_ARM_SCRIPTS) {
      expect(HOSTILE.test(evalPayloadOf(script))).toBe(false);
    }
  });

  it('★ 解出来就是原文（引号、&、% 一个不少）', () => {
    const script = 'const a = "x & y | z"; if (a && 100 % 3 === 1) { stash["k"] = a; }';

    expect(decodedOf(evalPayloadOf(script))).toBe(script);
  });
});
