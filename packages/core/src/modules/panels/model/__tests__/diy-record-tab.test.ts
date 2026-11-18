import { describe, expect, it } from 'vitest';
import { evalPayloadOf, forgetRecordTab, recordEval, rememberRecordTab, retainedTabOf } from '../diy-record-tab';

describe('录制的 eval 指名目标页：页 id 只在这一场里活着', () => {
  it('★★ 记住页 id 之后，每条 eval 都带 --tab；清掉就退回不带', () => {
    rememberRecordTab('P1');
    expect(recordEval('1+1')).toEqual(['eval', '--tab', 'P1', evalPayloadOf('1+1')]);

    rememberRecordTab(undefined);
    expect(recordEval('1+1')).toEqual(['eval', evalPayloadOf('1+1')]);
  });

  it('★ 空白页 id 当没给（不拿一个空格去指名）', () => {
    rememberRecordTab('   ');
    expect(recordEval('1+1')).toEqual(['eval', evalPayloadOf('1+1')]);

    rememberRecordTab(' P2 ');
    expect(recordEval('1+1')).toEqual(['eval', '--tab', 'P2', evalPayloadOf('1+1')]);
  });

  it('★ 保留的窗口连站点一起记着：补录时认得出是不是同一站（清掉就一起没）', () => {
    rememberRecordTab('P3', 'https://site.example/form');
    expect(retainedTabOf()).toEqual({ tab: 'P3', site: 'https://site.example/form' });

    forgetRecordTab();
    expect(retainedTabOf()).toBeNull();
  });
});
