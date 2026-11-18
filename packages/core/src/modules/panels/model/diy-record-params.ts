import { objectSchemaOf } from './tool-registry-guard';

export const RECORD_PREPARE_PARAMS = {
  type: 'object',
  properties: {
    unit: { type: 'string', description: '本次录制名称（默认 page；给已装的 unit 则用它）。' },
    url: { type: 'string', description: '该页面（用户访问系统的入口，与已探明的读源同 domain）。' },
    doing: { type: 'string', description: '这次在做什么，如发布 / 提交（可选，默认「操作」）。' },
    expect: objectSchemaOf(
      {
        method: { type: 'string', description: '要捕获那条请求的方法，如 POST（不填则按"像写入的请求"挑）。' },
        urlContains: { type: 'string', description: 'URL 中必须包含的片段（不填则不筛选）。' },
      },
      { additionalProperties: false, description: '要捕获哪条请求。' },
    ),
  },
  required: ['url'],
  additionalProperties: false,
} as const;

export const RECORD_READ_PARAMS = {
  type: 'object',
  properties: {
    waitMs: {
      type: 'integer',
      description: '等他按「结束」多久（毫秒，默认 0 = 立即回，上限 15 分钟）。',
    },
  },
  additionalProperties: false,
} as const;

export const RECORD_STOP_PARAMS = {
  type: 'object',
  properties: {
    force: { type: 'boolean', description: '材料不全也结束' },
    forceWhy: { type: 'string', description: 'force 的理由' },
  },
  additionalProperties: false,
} as const;
