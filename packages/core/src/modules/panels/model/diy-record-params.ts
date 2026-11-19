import { objectSchemaOf } from './tool-registry-guard';

export const RECORD_PREPARE_PARAMS = {
  type: 'object',
  properties: {
    unit: { type: 'string', description: '本次录制的名称（默认 page；给出已安装模块的模块标识则使用它）。' },
    url: { type: 'string', description: '要录制的页面地址：用户访问系统的入口，与已探明的数据来源同域。' },
    doing: { type: 'string', description: '本次要做的操作，如发布 / 提交（可选，默认「操作」）。' },
    expect: objectSchemaOf(
      {
        method: { type: 'string', description: '要捕获的请求方法，如 POST（不填时按写请求特征筛选）。' },
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
      description: '等待用户按「结束录制」的时长（毫秒；默认 0 = 立即返回，上限 15 分钟）。',
    },
  },
  additionalProperties: false,
} as const;

export const RECORD_STOP_PARAMS = {
  type: 'object',
  properties: {
    force: { type: 'boolean', description: '材料不全时也结束录制' },
    forceWhy: { type: 'string', description: '使用 force 的原因；会留痕。' },
  },
  additionalProperties: false,
} as const;
