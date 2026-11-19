export const UNIT_PROP = { type: 'string', description: '模块标识；不填时使用当前工作区中唯一的模块。' };
export const SESSION_PROP = { type: 'string', description: '会话名；默认 workbench，一般不用填。' };

export function pageSchema(
  extra: Record<string, unknown> = {},
  required: readonly string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    properties: { unit: UNIT_PROP, ...extra, session: SESSION_PROP },
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: false,
  };
}
