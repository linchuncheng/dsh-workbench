import { describe, expect, it } from 'vitest';
import { depthOf } from '../diy-lines';

describe('diy-lines', () => {
  it('只数圆括号、花括号、方括号的进出', () => {
    expect(depthOf('  a: () => void;')).toBe(0);
    expect(depthOf('  probe?: (')).toBe(1);
    expect(depthOf('  ): Promise<void>;')).toBe(-1);
    expect(depthOf('  x: [a, b]')).toBe(0);
  });
});
