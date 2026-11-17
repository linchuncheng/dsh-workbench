import { beforeEach, describe, expect, it } from 'vitest';
import { createDiyRig } from '../../__tests__/diy-harness';
import { heldStore } from '../../__tests__/record-fixtures';
import { recordDetailToolOf } from '../diy-record-detail-tool';
import { DIY_RECORD_DETAIL_TOOL } from '../../unit';

describe('detail 那一拍的入口：形状对得上注册表，缺参数时说的话能照做', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
  });

  it('★★ 名字 / 必填参数 / 输出形状与工具面一致', () => {
    const built = rig.harness({ withTools: true, pact: false, record: heldStore(null), probe: [] });
    const tool = recordDetailToolOf(built.ctx as never, built.record);

    expect(tool.name).toBe(DIY_RECORD_DETAIL_TOOL);
    expect(Object.keys(tool.parameters.properties ?? {})).toEqual(['key', 'index', 'at', 'unit', 'maxBody']);
    expect(tool.parameters.additionalProperties).toBe(false);
    expect(tool.output).toBeDefined();
  });

  it('★★ 没给 key 也没给 index：说清要哪一个，而不是空跑一趟', async () => {
    const built = rig.harness({ withTools: true, pact: false, record: heldStore(null), probe: [] });
    const tool = recordDetailToolOf(built.ctx as never, built.record);

    await expect(tool.execute({}, rig.diyExec() as never)).rejects.toThrow('请提供 key');
  });

  it('★ 本场清单已清、又没给 unit：说清「录制已不存在」并给出路', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [] });
    const tool = recordDetailToolOf(built.ctx as never, built.record);

    await expect(tool.execute({ key: 'POST https://x.test/api' }, rig.diyExec() as never)).rejects.toThrow(
      '录制已不存在',
    );
  });
});
