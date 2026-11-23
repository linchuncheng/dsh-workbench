import { describe, expect, it } from 'vitest';
import { publishAuthorOf, publishRequestOf, releaseArgvOf } from '../publish-request';

describe('publishRequestOf：一次发布带着哪些参数', () => {
  it('全给时原样读出来；没给的是空串 / false', () => {
    const request = publishRequestOf({
      unit: 'demo',
      target: 'market',
      source: 'team',
      version: 'minor',
      license: 'MIT',
      changelogNote: '一条',
      changelogType: 'fixed',
      labels: ['发布编排', '构建状态'],
      category: '任务与协作',
      author: '陈康 <kang@example.com>',
      verify: true,
      resume: true,
      refresh: true,
    });

    expect(request).toEqual({
      target: 'market',
      source: 'team',
      version: 'minor',
      license: 'MIT',
      changelogNote: '一条',
      changelogType: 'fixed',
      labels: ['发布编排', '构建状态'],
      category: '任务与协作',
      author: '陈康 <kang@example.com>',
      verify: true,
      resume: true,
      refresh: true,
    });
    expect(publishRequestOf({ unit: 'demo' })).toEqual({
      target: '',
      source: '',
      version: '',
      license: '',
      changelogNote: '',
      changelogType: '',
      labels: [],
      category: '',
      author: '',
      verify: false,
      resume: false,
      refresh: false,
    });
  });

  it('标签：去重、trim；超过两个 / 空串 / 换行当场拒', () => {
    expect(publishRequestOf({ labels: [' 甲 ', '甲'] }).labels).toEqual(['甲']);
    expect(() => publishRequestOf({ labels: ['一', '二', '三'] })).toThrow(/最多两个/u);
    expect(() => publishRequestOf({ labels: [''] })).toThrow(/短词/u);
    expect(() => publishRequestOf({ labels: ['一\n二'] })).toThrow(/短词/u);
    expect(() => publishRequestOf({ labels: [1] })).toThrow(/短词/u);
  });
});

describe('releaseArgvOf：发布与预检共用一份命令拼装', () => {
  const request = publishRequestOf({
    unit: 'demo',
    target: 'team',
    source: 'team',
    version: 'patch',
    license: 'MIT',
    changelogNote: '一条',
    changelogType: 'added',
    labels: ['甲'],
    category: '分类',
    resume: true,
    refresh: true,
  });

  it('发布：--yes，把每个参数都带上', () => {
    const argv = releaseArgvOf('/bin/dsh-wb-module', '/w/module', request, 'Ada', 'publish');

    expect(argv.slice(0, 5)).toEqual(['/bin/dsh-wb-module', 'release', '--cwd', '/w/module', '--json']);
    const flags = [
      '--yes',
      '--resume',
      '--target',
      'team',
      '--index-source',
      '--version',
      'patch',
      '--license',
      '--author',
      'Ada',
      '--changelog-note',
      '--label',
      '--category',
      '--refresh',
    ];
    for (const part of flags) expect(argv).toContain(part);
    expect(argv).not.toContain('--preflight');
  });

  it('verify：换成 --verify，不传 --yes', () => {
    const argv = releaseArgvOf('/bin/dsh-wb-module', '/w/module', { ...request, verify: true }, '', 'publish');

    expect(argv).toContain('--verify');
    expect(argv).not.toContain('--yes');
    expect(argv).not.toContain('--author');
  });

  it('预检：换成 --preflight，同样不传 --yes', () => {
    const argv = releaseArgvOf('/bin/dsh-wb-module', '/w/module', request, 'Ada', 'preflight');

    expect(argv).toContain('--preflight');
    expect(argv).not.toContain('--yes');
    expect(argv).toContain('--author');
  });
});

describe('publishAuthorOf：这次发布用哪个署名', () => {
  const request = publishRequestOf({ unit: 'demo' });
  const none = () => null;
  const hint = async () => '推断的署名';

  it('参数里的署名最优先；verify / local 不推断', async () => {
    expect(await publishAuthorOf({ ...request, author: '点名的' }, none, hint, '/w', 'demo')).toBe('点名的');
    expect(await publishAuthorOf({ ...request, verify: true }, none, hint, '/w', 'demo')).toBe('');
    expect(await publishAuthorOf({ ...request, target: 'local' }, none, hint, '/w', 'demo')).toBe('');
  });

  it('模块自己写了署名：不推断、也不额外传 --author', async () => {
    const previewOf = () => ({
      name: '@demo/probe',
      version: '0.1.0',
      author: '模块里写的',
      changelog: { version: '0.1.0', missing: true },
    });

    expect(await publishAuthorOf(request, previewOf, hint, '/w', 'demo')).toBe('');
  });

  it('都没有才推断；推断不到就是空（由 release 报缺署名）', async () => {
    expect(await publishAuthorOf(request, () => null, hint, '/w', 'demo')).toBe('推断的署名');
    expect(await publishAuthorOf(request, () => null, async () => undefined, '/w', 'demo')).toBe('');
  });
});
