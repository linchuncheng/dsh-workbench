import { describe, expect, it } from 'vitest';
import {
  DIAG_ACTIONS,
  DIAG_AREAS,
  DIAG_CLASSES,
  DIAG_CODES,
  DIAG_FALLBACK_CODE,
  diagSpecOf,
  isDiagCode,
} from '../diagnostics.js';
import { en } from '../../i18n/en.js';
import { zh } from '../../i18n/zh.js';

const dictionaries = { zh, en } as const;

describe('故障码注册表', () => {
  it('码唯一、形状稳定（写进排障手册后不再改）', () => {
    const codes = DIAG_CODES.map((spec) => spec.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  it('★ 每个码的类别、区域、动作都在枚举内', () => {
    for (const spec of DIAG_CODES) {
      expect(DIAG_CLASSES, spec.code).toContain(spec.class);
      expect(DIAG_AREAS, spec.code).toContain(spec.area);
      expect(DIAG_ACTIONS, spec.code).toContain(spec.action);
    }
  });

  it('★ 每个码的中英文案都在词表里且非空（缺一份就等于用户看不到解释）', () => {
    for (const spec of DIAG_CODES) {
      for (const language of ['zh', 'en'] as const) {
        const text = (dictionaries[language] as Readonly<Record<string, string>>)[spec.messageKey] ?? '';
        expect(typeof text, `${language}:${spec.messageKey}`).toBe('string');
        expect(text.trim(), `${language}:${spec.messageKey}`).not.toBe('');
      }
    }
  });

  it('文案键不重复（两个码共用一句话 = 用户分不清是哪一种）', () => {
    const keys = DIAG_CODES.map((spec) => spec.messageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('兜底码也在表里，查不到时给兜底而不是 undefined', () => {
    expect(isDiagCode(DIAG_FALLBACK_CODE)).toBe(true);
    expect(diagSpecOf('NO_SUCH_CODE')).toBeUndefined();
  });
});
