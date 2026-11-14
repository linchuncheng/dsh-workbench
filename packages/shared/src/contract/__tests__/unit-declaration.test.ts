import { describe, expect, it } from 'vitest';
import { unitTitleKey } from '../unit.js';
import { DECLARATION_KEYS, declarationProblemsOf, readDeclaration, type UnitDeclaration } from '../unit-declaration.js';

const declared = (tools: unknown) => ({
  apiVersion: 3,
  unit: 'demo',
  title: { zh: '演示', en: 'Demo' },
  card: null,
  tools,
  host: { inject: [] },
});

describe('清单里的工具声明', () => {
  it('key 是可选的：不给就只是没有生成物可对', () => {
    expect(declarationProblemsOf('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true }]))).toEqual([]);
  });

  it('给了 key 就得是能当代码键名的 lowerCamelCase', () => {
    expect(
      declarationProblemsOf('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true, key: 'sync' }])),
    ).toEqual([]);
    expect(
      declarationProblemsOf('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true, key: 'podLogs' }])),
    ).toEqual([]);

    for (const bad of ['Sync', 'pod-logs', 'pod_logs', '1sync', '', 'pod logs', '__proto__']) {
      const problems = declarationProblemsOf(
        '@t/demo',
        declared([{ name: 'workbench_demo_sync', writes: true, key: bad }]),
      );
      expect(problems.join('\n'), `key=${JSON.stringify(bad)} 该红`).toMatch(/\.key 要是 lowerCamelCase/);
    }
  });

  it('onDemand: false 是"这把工具不随工具包收"，只收 boolean', () => {
    expect(
      declarationProblemsOf('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true, onDemand: false }])),
    ).toEqual([]);
    const problems = declarationProblemsOf(
      '@t/demo',
      declared([{ name: 'workbench_demo_sync', writes: true, onDemand: 'no' }]),
    );

    expect(problems.join('\n')).toMatch(/\.onDemand 要是 true \/ false/);
  });

  it('onDemand 写进外壳那份清单（工具包按它把常驻的那几把放过去）', () => {
    const read = readDeclaration(
      '@t/demo',
      declared([
        { name: 'workbench_demo_sync', writes: true, onDemand: false },
        { name: 'workbench_demo_apply', writes: true },
      ]),
    );

    expect(read.manifest?.tools).toEqual([
      { name: 'workbench_demo_sync', writes: true, onDemand: false },
      { name: 'workbench_demo_apply', writes: true },
    ]);
  });

  it('★ key 撞了当场红（生成物里的键只能有一个，不然生成出来是静默覆盖）', () => {
    const problems = declarationProblemsOf(
      '@t/demo',
      declared([
        { name: 'workbench_demo_sync', writes: true, key: 'sync' },
        { name: 'workbench_demo_apply', writes: true, key: 'sync' },
      ]),
    );

    expect(problems.join('\n')).toMatch(/key「sync」与前面那条撞了/);
  });

  it('key 不进外壳那份清单（外壳不读它，它是给代码用的）', () => {
    const read = readDeclaration('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true, key: 'sync' }]));

    expect(read.problems).toEqual([]);
    expect(read.manifest?.tools).toEqual([{ name: 'workbench_demo_sync', writes: true }]);
  });
});

describe('清单里的名字（v3 起名字在顶层，是字面量）', () => {
  it('中英各一份，都有就过', () => {
    expect(declarationProblemsOf('@t/demo', declared([]))).toEqual([]);
  });

  it('少一门 / 空串 → 红，点名那一门', () => {
    expect(declarationProblemsOf('@t/demo', { ...declared([]), title: { zh: '演示' } }).join('\n')).toMatch(
      /title\.en/,
    );
    expect(
      declarationProblemsOf('@t/demo', { ...declared([]), title: { zh: '演示', en: '  ' } }).join('\n'),
    ).toMatch(/title\.en 要是非空字符串/);
  });

  it('★ v2 的老写法（card.titleKey）被点名，并给出迁移提示', () => {
    const v2 = { ...declared([]), apiVersion: 2, card: { titleKey: 'demo.cardTitle', order: 7 } };
    expect(declarationProblemsOf('@t/demo', v2).join('\n')).toMatch(/v3 把卡片标题挪成了顶层/);
    const keyOnly = { ...declared([]), card: { titleKey: 'demo.cardTitle', order: 7 } };
    expect(declarationProblemsOf('@t/demo', keyOnly).join('\n')).toMatch(/不认的键/);
  });

  it('★ 清单里的名字键由外壳合成：模块不用写、也别想写', () => {
    const read = readDeclaration('@t/demo', { ...declared([]), card: { order: 7 } });

    expect(read.problems).toEqual([]);
    expect(read.manifest?.title).toEqual({ zh: '演示', en: 'Demo' });
    expect(read.manifest?.titleKey).toBe(unitTitleKey('demo'));
    expect(read.manifest?.card).toEqual({ order: 7 });
  });
});

describe('声明协议的键表', () => {
  it('DECLARATION_KEYS 与 UnitDeclaration 的字段一一对应', () => {
    const full: UnitDeclaration = {
      apiVersion: 3,
      unit: 'demo',
      title: { zh: '演示', en: 'Demo' },
      card: { order: 1 },
      tools: [{ name: 'workbench_demo_sync', writes: false }],
      host: { inject: [], optional: [], writes: [] },
      needs: [],
    };
    expect(Object.keys(full).sort()).toEqual([...DECLARATION_KEYS].sort());
  });
});

describe('origin 权限声明', () => {
  const withOrigins = (origins: unknown) => ({
    ...declared([]),
    host: { inject: [], origins },
  });

  it('合法 origin 归一化进清单', () => {
    const read = readDeclaration('@t/demo', withOrigins(['https://oa.example.com/', 'https://x.example.com']));
    expect(read.problems).toEqual([]);
    expect(read.manifest?.host.origins).toEqual(['https://oa.example.com', 'https://x.example.com']);
  });

  it('path / query / 非 http 都拒', () => {
    const problems = declarationProblemsOf(
      '@t/demo',
      withOrigins(['https://oa.example.com/oa', 'https://x.example.com/?a=1', 'ftp://x.example.com']),
    ).join('\n');
    expect(problems).toMatch(/只能是站点根/);
    expect(problems).toMatch(/只能是 http \/ https/);
  });

  it('带端口、大写 host、重复项都按站点根归一化并去重', () => {
    const read = readDeclaration(
      '@t/demo',
      withOrigins(['https://OA.Example.com:8443/', 'https://oa.example.com:8443', 'https://oa.example.com:8443/']),
    );
    expect(read.problems).toEqual([]);
    expect(read.manifest?.host.origins).toEqual(['https://oa.example.com:8443']);
  });

  it('不写 origins 就是没声明（兼容旧模块）', () => {
    const read = readDeclaration('@t/demo', withOrigins(undefined));
    expect(read.problems).toEqual([]);
    expect(read.manifest?.host.origins).toBeUndefined();
  });
});

describe('站点表', () => {
  const withSites = (sites: unknown, origins?: unknown) => ({
    ...declared([]),
    host: { inject: [], ...(origins === undefined ? {} : { origins }), sites },
  });

  const oa = {
    origin: 'https://oa.example.com/',
    loginUrl: 'https://oa.example.com/login',
    session: 'workbench-read',
    timeoutMs: 10_000,
    authLoss: { path: 'errorCode', equals: '002', messagePath: 'msg' },
    envelope: { dataPath: ' data ', codePath: 'code' },
    pagination: { pageParam: 'pageNo', sizeParam: 'pageSize', totalPath: 'data.total' },
  };

  it('合法站点表归一化进清单，origins 由站点推导', () => {
    const read = readDeclaration('@t/demo', withSites({ oa }));

    expect(read.problems).toEqual([]);
    expect(read.manifest?.host.origins).toEqual(['https://oa.example.com']);
    expect(read.manifest?.host.sites?.oa).toEqual({
      ...oa,
      origin: 'https://oa.example.com',
      envelope: { dataPath: 'data', codePath: 'code' },
    });
  });

  it('显式 origins 与站点并集去重，顺序是站点在前', () => {
    const read = readDeclaration(
      '@t/demo',
      withSites(
        { oa, wiki: { origin: 'https://wiki.example.com' } },
        ['https://oa.example.com', 'https://x.example.com'],
      ),
    );

    expect(read.problems).toEqual([]);
    expect(read.manifest?.host.origins).toEqual([
      'https://oa.example.com',
      'https://wiki.example.com',
      'https://x.example.com',
    ]);
  });

  it('站点名要小写短名', () => {
    const problems = declarationProblemsOf('@t/demo', withSites({ OA: { origin: 'https://oa.example.com' } }));
    expect(problems.join('\n')).toMatch(/host\.sites\.OA: 站点名要是小写短名/);
  });

  it('origin / loginUrl / session / timeout / authLoss / envelope 的错都点名到字段', () => {
    const problems = declarationProblemsOf(
      '@t/demo',
      withSites({
        oa: {
          origin: 'https://oa.example.com/oa',
          loginUrl: '/login',
          session: ' ',
          timeoutMs: 500,
          authLoss: { path: 'code', equals: 1, in: [1] },
          envelope: { dataPath: ' ' },
          pagination: { pageParam: ' ' },
          extra: true,
        },
      }),
    ).join('\n');

    expect(problems).toMatch(/host\.sites\.oa\.origin: .*只能是站点根/);
    expect(problems).toMatch(/host\.sites\.oa\.loginUrl 不是合法地址/);
    expect(problems).toMatch(/host\.sites\.oa\.session 不能为空/);
    expect(problems).toMatch(/host\.sites\.oa\.timeoutMs 要在 1000\.\.120000/);
    expect(problems).toMatch(/host\.sites\.oa\.authLoss 的 equals 与 in 只给一个/);
    expect(problems).toMatch(/host\.sites\.oa\.envelope\.dataPath 不能为空/);
    expect(problems).toMatch(/host\.sites\.oa\.pagination\.pageParam 不能为空/);
    expect(problems).toMatch(/host\.sites\.oa 里有不认的键 "extra"/);
  });

  it('没有 origin 的站点当场拒', () => {
    const problems = declarationProblemsOf('@t/demo', withSites({ oa: { loginUrl: 'https://oa.example.com/login' } }));
    expect(problems.join('\n')).toMatch(/host\.sites\.oa\.origin 没写/);
  });

  it('authLoss.in 不是数组时当场拒，不留给归一化去炸', () => {
    const problems = declarationProblemsOf(
      '@t/demo',
      withSites({ oa: { origin: 'https://oa.example.com', authLoss: { path: 'code', equals: 1, in: 'abc' } } }),
    );
    expect(problems.join('\n')).toMatch(/host\.sites\.oa\.authLoss\.in 要是数组/);
  });

  it('没有站点表的旧清单不受影响', () => {
    const read = readDeclaration('@t/demo', declared([]));

    expect(read.problems).toEqual([]);
    expect(read.manifest?.host.sites).toBeUndefined();
    expect(read.manifest?.host.origins).toBeUndefined();
  });

  it('空站点表不改变 origins 的旧语义', () => {
    const read = readDeclaration('@t/demo', withSites({}));

    expect(read.problems).toEqual([]);
    expect(read.manifest?.host.origins).toBeUndefined();
  });
});
