import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RECORD_ARM_BAR_ITEMS_SCRIPT,
  RECORD_ARM_BAR_SCRIPT,
  RECORD_ARM_BAR_WIRING_SCRIPT,
} from '../diy-record-bar-scripts';
import { RECORD_ARM_NET_SCRIPT } from '../diy-record-scripts';

describe('钩子没装好之前，浮条上的按钮不许点', () => {
  it('★★ 装好钩子那一拍才置 __ready，并且当场重画一次', () => {
    expect(RECORD_ARM_NET_SCRIPT).toContain('state.__ready = true;');
    expect(RECORD_ARM_NET_SCRIPT).toContain('state.__repaint()');
  });

  it('★★ 没 ready 时：文案是「正在准备录制…」，两个键都禁用、呼吸点灭', () => {
    const at = RECORD_ARM_BAR_WIRING_SCRIPT.indexOf("if (state.__ready !== true) {");
    expect(at).toBeGreaterThan(0);
    const block = RECORD_ARM_BAR_WIRING_SCRIPT.slice(at, at + 420);
    expect(block).toContain('正在准备录制…');
    expect(block).toContain('shot.disabled = true');
    expect(block).toContain('end.disabled = true');
    expect(block).toContain("dot.style.display = 'none'");
  });

  it('★ 第 2 拍就把整条浮条建好：出现即完整，不存在空壳那一帧', () => {
    expect(RECORD_ARM_BAR_SCRIPT).toContain("bar.id = '__dsh-record-bar'");
    expect(RECORD_ARM_BAR_SCRIPT).toContain('正在准备录制…');
    expect(RECORD_ARM_BAR_SCRIPT).toContain('shot.disabled = true');
    expect(RECORD_ARM_BAR_SCRIPT).toContain('end.disabled = true');
  });

  it('★ 样式里带着转圈动画（准备中那个小圈要用它）', () => {
    const css = readFileSync(new URL('../diy-record-bar-scripts.ts', import.meta.url), 'utf8');
    expect(css).toContain('__dshRecordSpin');
  });
});

describe('「正在准备录制」只说一次，不闪', () => {
  it('★★ 同一句话由建浮条那一拍写上，后面几拍不再重复写', () => {
    expect(RECORD_ARM_BAR_SCRIPT).toContain("label.textContent = '正在准备录制…';");
    expect(RECORD_ARM_BAR_ITEMS_SCRIPT).not.toContain("label.textContent = '正在准备录制…';");
  });
});
