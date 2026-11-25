import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declaredTypeIn, publicTypeOf, renderTypeText, typeNameIn } from '../diy-types';
import { surfaceCoreRoot } from '../diy-deps';

describe('公开类型索引', () => {
  it('shared barrel 里的类型能按名字取到，带 JSDoc 与声明；未知回 null', () => {
    const root = surfaceCoreRoot();
    const seam = publicTypeOf('UnitSeam', root, []);
    expect(seam?.path).toMatch(/host\/seam\/unit-seam\.ts$/);
    expect(seam?.text).toContain('run(request');
    expect(seam?.text).toContain('受控执行');
    expect(publicTypeOf('UnitSeamRequest', root, [])?.text).toContain('retry');
    expect(publicTypeOf('NopeType', root, [])).toBeNull();
  });

  it('kit 的 .d.ts 里的 Props 类型也能按名字取到', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-types-'));
    const file = join(dir, 'Card.d.ts');
    writeFileSync(file, '/** 卡 */\nexport interface SampleCardProps {\n  /** 标题 */\n  readonly title: string;\n}\n');
    const fact = publicTypeOf('SampleCardProps', surfaceCoreRoot(), [file]);
    expect(fact?.path).toBe(file);
    expect(fact?.line).toBe(1);
    expect(fact?.text).toContain('readonly title');
    if (fact === null) throw new Error('没找到 SampleCardProps');
    expect(renderTypeText(fact)).toContain('SampleCardProps → ');
  });

  it('从组件 / hook 声明里取 props 或 options 的类型名', () => {
    expect(declaredTypeIn('export declare function Card(props: CardProps): JSX.Element;', 'Card')).toBe('CardProps');
    expect(
      declaredTypeIn('export declare function Card({ t, title }: CardProps): JSX.Element;', 'Card'),
    ).toBe('CardProps');
    expect(declaredTypeIn('export declare const Card: (props: CardProps) => JSX.Element;', 'Card')).toBe('CardProps');
    expect(
      declaredTypeIn('export declare function useLongTask<T>(options: LongTaskOptions): LongTaskFeed<T>;', 'useLongTask'),
    ).toBe('LongTaskOptions');
    expect(
      declaredTypeIn('export declare function useUnitSetup({ steps }: UseUnitSetupOptions): UnitSetup;', 'useUnitSetup'),
    ).toBe('UseUnitSetupOptions');
    expect(declaredTypeIn('export declare function usePlatform(): PlatformView;', 'usePlatform')).toBeNull();
  });

  it('类型提示只取第一个大写标识符，内联函数不回', () => {
    expect(typeNameIn('  readonly seam?: UnitSeam | undefined;')).toBe('UnitSeam');
    expect(typeNameIn('  readonly probe?: (')).toBeNull();
  });
});
