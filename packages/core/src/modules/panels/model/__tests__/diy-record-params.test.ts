import { describe, expect, it } from 'vitest';
import { RECORD_PREPARE_PARAMS, RECORD_READ_PARAMS, RECORD_STOP_PARAMS } from '../diy-record-params';

describe('录制三把的参数面：agent 看到的就是这三份', () => {
  it('★★ prepare：url 必填，expect 里只认 method / urlContains', () => {
    expect(RECORD_PREPARE_PARAMS.required).toEqual(['url']);
    expect(RECORD_PREPARE_PARAMS.additionalProperties).toBe(false);
    expect(Object.keys(RECORD_PREPARE_PARAMS.properties)).toEqual(['unit', 'url', 'doing', 'expect']);
    const expectSchema = RECORD_PREPARE_PARAMS.properties.expect;
    expect(expectSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(Object.keys(expectSchema.properties ?? {})).toEqual(['method', 'urlContains']);
  });

  it('★ read：只留一个 waitMs，别的都不收', () => {
    expect(Object.keys(RECORD_READ_PARAMS.properties)).toEqual(['waitMs']);
    expect(RECORD_READ_PARAMS.additionalProperties).toBe(false);
  });

  it('★★ stop：force 与 forceWhy 成对出现（要强制就得说清为什么）', () => {
    expect(Object.keys(RECORD_STOP_PARAMS.properties)).toEqual(['force', 'forceWhy']);
    expect(RECORD_STOP_PARAMS.properties.force.type).toBe('boolean');
    expect(RECORD_STOP_PARAMS.properties.forceWhy.type).toBe('string');
  });
});
