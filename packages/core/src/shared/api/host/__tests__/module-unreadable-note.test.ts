import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '@dsh-workbench/shared/host';
import { noteUnreadableModules } from '../module-unreadable-note.js';

function recorderOf() {
  let at = 1_000;
  return createDiagRecorder({ clock: () => (at += 10), nextCorrId: () => 'c-1', level: 'info' });
}

describe('装上了但读不出来的模块：落一条诊断记录', () => {
  it('★ 每个包记一条，码与主体对得上', () => {
    const diag = recorderOf();
    noteUnreadableModules(diag, [{ pkg: '@x/broken', reason: '没有权限读 package.json' }]);

    const [record] = diag.recent({ code: 'MODULE_UNREADABLE' });
    expect(record).toMatchObject({ class: 'user', area: 'market', subject: { pkg: '@x/broken' } });
    expect(record?.detail?.['reason']).toBe('没有权限读 package.json');
  });

  it('★ 同一个包重复出现只记一次（轮询不刷屏）', () => {
    const diag = recorderOf();
    noteUnreadableModules(diag, [{ pkg: '@x/broken', reason: 'r' }]);
    noteUnreadableModules(diag, [{ pkg: '@x/broken', reason: 'r' }]);

    expect(diag.recent({ code: 'MODULE_UNREADABLE' })).toHaveLength(1);
  });

  it('没有读不出来的模块时不落记录（成功不留痕）', () => {
    const diag = recorderOf();
    noteUnreadableModules(diag, []);
    expect(diag.recent()).toHaveLength(0);
  });
});
