import { describe, expect, it } from 'vitest';
import { materialsOf, materialsTextOf } from '../diy-record-materials';
import type { RecordCall, RecordSnapRead } from '../diy-record-text';

const call = (method: string, body = '', response = '{"ok":true}', status = 200): RecordCall => ({
  key: '',
  method,
  url: 'https://x.test/api/issues',
  body,
  status,
  ct: 'application/json',
  response,
  at: 1,
  source: 'hook',
});

const snap = (fields: number, required: readonly string[], truncated = false): RecordSnapRead => ({
  href: 'https://x.test/form',
  title: '新建',
  bytes: 1024,
  truncated,
  at: 1,
  fields,
  required,
});

describe('素材体检：缺什么就说缺什么，别让 agent 自己猜', () => {
  it('★★ 三样齐（入参 / 出参 / 必填）⇒ 什么都不缺', () => {
    const read = materialsOf([call('POST', '{"name":"a"}'), call('GET')], snap(12, ['name', 'owner']));

    expect(read.missing).toEqual([]);
    expect(read.hasRequest).toBe(true);
    expect(read.hasResponse).toBe(true);
  });

  it('★★ 出参还没回来 ⇒ 缺出参；快照也没有 ⇒ 连必填一起缺', () => {
    const read = materialsOf([call('POST', '{"name":"a"}', '', 0)], null);

    expect(read.missing).toEqual(['出参', '必填信息']);
  });

  it('★ 只有读接口 ⇒ 说清是「没有写请求」这一个根', () => {
    const read = materialsOf([call('GET'), call('GET')], snap(3, ['name']));

    expect(read.missing).toEqual(['写请求']);
    expect(materialsTextOf(read)[0]).toContain('未识别到写请求');
  });

  it('★ 截断的 HTML 要提醒细节以截图为准', () => {
    const text = materialsTextOf(materialsOf([call('POST', '{"a":1}')], snap(40, ['a'], true))).join('\n');

    expect(text).toContain('40 个字段');
    expect(text).toContain('必填 1（a）');
    expect(text).toContain('HTML 被截断');
  });
});

describe('一套全是 POST 的系统：靠打分认写，不靠 method', () => {
  const post = (path: string, body = '', response = '{"ok":true}'): RecordCall => ({
    key: '',
    method: 'POST',
    url: `https://x.test${path}`,
    body,
    status: 200,
    ct: 'application/json',
    response,
    at: 1,
    source: 'hook',
  });

  it('★★★ 保存带 body、回包给 id ⇒ 认成写；分页壳的 list 不算', () => {
    const read = materialsOf(
      [
        post('/api/issue/save', '{"name":"a"}', '{"code":0,"data":{"id":42}}'),
        post('/api/issue/list', '{"page":1,"pageSize":20}', '{"rows":[]}'),
      ],
      snap(10, ['name']),
    );

    expect(read.writes).toHaveLength(1);
    expect(read.writes[0]?.url).toContain('/save');
    expect(read.missing).toEqual([]);
    expect(materialsTextOf(read).join('\n')).toContain('未计为写：POST /api/issue/list');
  });

  it('★★ prepare 时说的目标 urlContains ⇒ 一条命令就定下来，不用猜', () => {
    const read = materialsOf(
      [post('/api/flow/commit', '{"a":1}'), post('/api/flow/query', '{"page":1}')],
      snap(10, ['a']),
      { method: 'POST', urlContains: '/flow/commit' },
    );

    expect(read.writes[0]?.url).toContain('/flow/commit');
    expect(read.candidates[0]?.why.join('')).toContain('匹配');
  });

  it('★ 认不出写 ⇒ 明说让他指明，不假装', () => {
    const read = materialsOf([post('/api/a/list', '{"page":1}'), post('/api/b/list', '')], snap(10, ['a']));

    expect(read.writes).toEqual([]);
    expect(materialsTextOf(read)[0]).toContain('urlContains');
  });
});
