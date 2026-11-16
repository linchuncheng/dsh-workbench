import { describe, expect, it } from 'vitest';
import { revealTargetOf, topRankedOf, workspaceSections } from '../workspace-groups';

const HEADINGS = { workspaces: '工作区', defaultWorkspace: '默认工作区', workshop: '工坊' };

const at = (path: string, title: string) => ({ path, title });

const PROJECTS = [
  at('/Users/you/项目/公司项目/team-app', 'team-app'),
  at('/Users/you/项目/个人项目/dsh-workbench', 'dsh工作台'),
];
const DEFAULT = at('/Users/you/Documents/deepseek-harness/default-workspace', 'default-workspace');
const WORKSHOP = at('/Users/you/.dsh/workbench/diy', '工作台DIY');

const ranker = (ranks: Record<string, number>) => (item: { readonly path: string }): number | null =>
  ranks[item.path] ?? null;

const priority = (ranks: Record<string, number>) => (item: { readonly path: string }): number =>
  ranks[item.path] ?? Number.POSITIVE_INFINITY;

describe('workspaceSections', () => {
  it('三类各归各的：用户的项目 / dsh 的默认工作区 / 工坊', () => {
    const sections = workspaceSections([...PROJECTS, DEFAULT, WORKSHOP], HEADINGS);
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);
    expect(sections[0]?.items).toEqual(PROJECTS);
    expect(sections[1]?.items).toEqual([DEFAULT]);
    expect(sections[2]?.items).toEqual([WORKSHOP]);
  });

  it('显示顺序是 项目 → 默认工作区 → 工坊（自带的那两处都收在用户的项目后面）', () => {
    const sections = workspaceSections([WORKSHOP, DEFAULT, ...PROJECTS], HEADINGS);
    expect(sections.flatMap((section) => section.items)).toEqual([...PROJECTS, DEFAULT, WORKSHOP]);
  });

  it('有默认工作区或工坊时，用户那一组才画「工作区」标题（没东西要区分就不画）', () => {
    expect(workspaceSections([...PROJECTS, DEFAULT, WORKSHOP], HEADINGS).map((one) => one.heading)).toEqual([
      '工作区',
      '默认工作区',
      '工坊',
    ]);
    expect(workspaceSections(PROJECTS, HEADINGS)).toEqual([
      { id: 'workspaces', heading: null, items: PROJECTS },
    ]);
  });

  it('认默认工作区用的是身份：title 或路径尾段，改别名也还在默认那一段', () => {
    expect(workspaceSections([DEFAULT], HEADINGS)).toEqual([
      { id: 'defaultWorkspace', heading: null, items: [DEFAULT] },
    ]);
    const renamed = at(DEFAULT.path, '文档暂存');
    expect(workspaceSections([renamed], HEADINGS)).toEqual([
      { id: 'defaultWorkspace', heading: null, items: [renamed] },
    ]);
    const moved = at('/Users/you/elsewhere/default-workspace', '别处的项目');
    expect(workspaceSections([moved], HEADINGS)).toEqual([
      { id: 'defaultWorkspace', heading: null, items: [moved] },
    ]);
  });

  it('只剩工坊那一条时，只画「工坊」那一段（一条不摆标题）', () => {
    expect(workspaceSections([WORKSHOP], HEADINGS)).toEqual([
      { id: 'workshop', heading: null, items: [WORKSHOP] },
    ]);
  });

  it('工坊优先于默认工作区（同一条不会被分到两段里）', () => {
    const both = at(WORKSHOP.path, 'default-workspace');
    expect(workspaceSections([both], HEADINGS)).toEqual([
      { id: 'workshop', heading: null, items: [both] },
    ]);
  });

  it('没命中任何一条就是空（空态那句话说给调用点）', () => {
    expect(workspaceSections([], HEADINGS)).toEqual([]);
  });
});

describe('workspaceSections：组内按「待审批 → 通知 → 在跑 → 无状态」排', () => {
  const rankOf = ranker({ '/a/approval': 0, '/a/fresh': 1, '/a/running': 2 });

  it('★★ 四条状态各一条时，顺序按优先级来（与传进来的顺序无关）', () => {
    const rows = [at('/a/idle', 'idle'), at('/a/running', 'running'), at('/a/fresh', 'fresh'), at('/a/approval', 'approval')];
    const sections = workspaceSections(rows, HEADINGS, { rankOf });
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['approval', 'fresh', 'running', 'idle']);
  });

  it('★ 同一档里保持传进来的先后（稳定排序，不按名字乱动）', () => {
    const rows = [at('/a/b', 'b'), at('/a/a', 'a'), at('/c/c', 'c')];
    const sections = workspaceSections(rows, HEADINGS, { rankOf });
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['b', 'a', 'c']);
  });

  it('不给 rankOf 就原样（老行为一个字不改）', () => {
    const rows = [at('/a/idle', 'idle'), at('/a/approval', 'approval')];
    expect(workspaceSections(rows, HEADINGS)[0]?.items).toEqual(rows);
  });
});

describe('workspaceSections：只有待审批能搬组，同档仍按固定段序', () => {
  it('★★ 通知那一档不搬组：组的位置不因「跑完了」而变', () => {
    const rows = [...PROJECTS, DEFAULT, WORKSHOP];
    const sections = workspaceSections(rows, HEADINGS, { rankOf: ranker({ [DEFAULT.path]: 1 }) });
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);
    expect(sections[1]?.heading).toBe('默认工作区');
  });

  it('★★ 在跑那一档也不搬组：agent 工作台里「在跑」是常态，搬组等于重建空间记忆', () => {
    const rows = [...PROJECTS, DEFAULT, WORKSHOP];
    const sections = workspaceSections(rows, HEADINGS, { rankOf: ranker({ [WORKSHOP.path]: 2 }) });
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);
  });

  it('★★ 待审批那一段整段上浮，其余按固定段序跟在后面', () => {
    const rows = [...PROJECTS, at('/a/approval', 'approval'), DEFAULT, WORKSHOP];
    const sections = workspaceSections(rows, HEADINGS, {
      rankOf: ranker({ '/a/approval': 0, [DEFAULT.path]: 1, [WORKSHOP.path]: 2 }),
    });
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);

    const lifted = workspaceSections(rows, HEADINGS, {
      rankOf: ranker({ '/a/approval': 0, [DEFAULT.path]: 0, [WORKSHOP.path]: 2 }),
    });
    expect(lifted.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);

    const defaultFirst = workspaceSections(rows, HEADINGS, { rankOf: ranker({ [DEFAULT.path]: 0 }) });
    expect(defaultFirst.map((section) => section.id)).toEqual(['defaultWorkspace', 'workspaces', 'workshop']);
  });

  it('★ 组内仍按四档排（待审批 → 通知 → 在跑 → 无状态）', () => {
    const rows = [at('/a/idle', 'idle'), at('/a/approval', 'approval'), DEFAULT, WORKSHOP, at('/a/running', 'running')];
    const sections = workspaceSections(rows, HEADINGS, {
      rankOf: ranker({ '/a/approval': 0, '/a/running': 2, [WORKSHOP.path]: 1 }),
    });
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['approval', 'running', 'idle']);
  });

  it('★ 一组都没有状态时，三类的先后照旧（稳定排序，不按名字乱动）', () => {
    const sections = workspaceSections([WORKSHOP, DEFAULT, ...PROJECTS], HEADINGS, { rankOf: ranker({}) });
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);
  });
});

describe('workspaceSections：同档按最近活动，再退宿主顺序', () => {
  const recencyOf = (times: Record<string, number>) => (item: { readonly path: string }): number =>
    times[item.path] ?? 0;

  it('★★ 同档按最近活动降序（与传进来的顺序无关）', () => {
    const rows = [at('/a/old', 'old'), at('/a/new', 'new'), at('/a/mid', 'mid')];
    const sections = workspaceSections(rows, HEADINGS, {
      rankOf: ranker({}),
      recencyOf: recencyOf({ '/a/old': 1, '/a/new': 3, '/a/mid': 2 }),
    });
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['new', 'mid', 'old']);
  });

  it('★ 最近活动一样时保持宿主顺序（手动排过的位置不丢）', () => {
    const rows = [at('/a/b', 'b'), at('/a/a', 'a')];
    const sections = workspaceSections(rows, HEADINGS, {
      rankOf: ranker({}),
      recencyOf: recencyOf({ '/a/b': 5, '/a/a': 5 }),
    });
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['b', 'a']);
  });

  it('★ 档位优先于最近活动：在跑的那条排到最前，哪怕它更旧', () => {
    const rows = [at('/a/fresh-idle', 'idle'), at('/a/stale-run', 'run')];
    const sections = workspaceSections(rows, HEADINGS, {
      rankOf: ranker({ '/a/stale-run': 2 }),
      recencyOf: recencyOf({ '/a/fresh-idle': 9, '/a/stale-run': 1 }),
    });
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['run', 'idle']);
  });
});

describe('workspaceSections：条目少时不摆标题', () => {
  it('★ 三行三组（1 个项目 + 默认 + 工坊）：平铺，全不画标题', () => {
    const sections = workspaceSections([...PROJECTS.slice(0, 1), DEFAULT, WORKSHOP], HEADINGS);
    expect(sections.map((section) => section.heading)).toEqual([null, null, null]);
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);
  });

  it('★ 四条起才画标题（分组有区分价值）', () => {
    const sections = workspaceSections([...PROJECTS, DEFAULT, WORKSHOP], HEADINGS);
    expect(sections.map((section) => section.heading)).toEqual(['工作区', '默认工作区', '工坊']);
  });
});

describe('topRankedOf：打开时该滚到哪一条', () => {
  it('★★ 不分段，只按档位挑：后面的「通知」压过前面的「在跑」', () => {
    const ranks = { '/a/run': 2, '/a/done': 1 };
    const sections = workspaceSections([at('/a/run', 'run'), DEFAULT, at('/a/done', 'done')], HEADINGS, {
      rankOf: priority(ranks),
    });

    expect(topRankedOf(sections, priority(ranks))?.title).toBe('done');
  });

  it('★ 同档取列表里先出现的那条', () => {
    const ranks = { '/a/first': 1, '/a/second': 1 };
    const sections = workspaceSections([at('/a/first', 'first'), at('/a/second', 'second')], HEADINGS, {
      rankOf: priority(ranks),
    });

    expect(topRankedOf(sections, priority(ranks))?.title).toBe('first');
  });

  it('★ 一条状态都没有就回 null（列表停在顶上，不乱滚）', () => {
    const sections = workspaceSections(PROJECTS, HEADINGS);
    expect(topRankedOf(sections, () => Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('revealTargetOf：打开时焦点落在哪', () => {
  const CURRENT = at('/Users/you/项目/公司项目/current', 'current');
  const RUNNING = at('/Users/you/项目/公司项目/running', 'running');
  const DONE = at('/Users/you/项目/公司项目/done', 'done');
  const noSignal = (): number => Number.POSITIVE_INFINITY;

  it('★★ 有结果就取那一条（在跑不算），当前工作区只是兜底', () => {
    const ranks = priority({ [DONE.path]: 1, [RUNNING.path]: 2 });
    const sections = workspaceSections([CURRENT, RUNNING, DONE], HEADINGS, { rankOf: ranks });
    expect(revealTargetOf(sections, ranks, CURRENT)?.title).toBe('done');
  });

  it('★★ 只有在跑 / 无状态时回退当前工作区，不拿「在跑」当焦点', () => {
    const sections = workspaceSections([CURRENT, RUNNING], HEADINGS, { rankOf: noSignal });
    expect(revealTargetOf(sections, noSignal, CURRENT)?.title).toBe('current');
  });

  it('★★ 连当前工作区都没有：没有目标（不滚、不高亮、回车不动作）', () => {
    const sections = workspaceSections([RUNNING], HEADINGS, { rankOf: noSignal });
    expect(revealTargetOf(sections, noSignal, null)).toBeNull();
  });
});
