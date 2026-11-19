import { describe, expect, it } from 'vitest';

import { timeOf } from '../time';

describe('timeOf', () => {
  it('把时间串变成毫秒', () => {
    expect(timeOf('2026-11-18T09:12:00')).toBeTypeOf('number');
  });

  it('读不出的时间返回 undefined', () => {
    expect(timeOf('not-a-date')).toBeUndefined();
  });
});
