import type { AuthLoss } from '../../contract/data.js';
import { pathSegmentsProblem } from '../../contract/guards.js';

/**
 * 一条登录丢失结论：给模块先判断，再决定是否自己解析响应。
 */
export interface AuthLossNotice {
  readonly message: string;
  readonly loginUrl?: string;
}

export interface AuthLossProblem {
  readonly path: string;
  readonly problem: string;
}

const AUTH_WORDS = /登录|登陆|超时|会话|未授权|请重新|login|log in|session|expired|unauthorized|auth/i;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function primitiveValue(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * 认常见的登录丢失形状：401、`status:false` + 登录/超时文案、跳 `/login`（403 是没权限，不算登录丢失）。
 * `status:false` 单独出现不算，避免把业务错误误判成登录。
 * @param value 已解析的响应体。
 * @returns 命中时给消息与可选的登录地址；不命中 undefined。
 */
export function authLossOf(value: unknown): AuthLossNotice | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  const status = record['status'] ?? record['statusCode'];
  const numeric = typeof status === 'string' && status.trim() !== '' ? Number(status) : status;
  const message = textOf(
    record['message'] ?? record['msg'] ?? record['error'] ?? record['errorMessage'] ?? record['detail'],
  );
  const url = textOf(record['loginUrl'] ?? record['loginURL'] ?? record['url'] ?? record['redirect']);
  const loginUrl = /\/login(?:[?#]|$)/i.test(url) ? url : undefined;
  const needsLogin =
    record['status'] === false ||
    record['success'] === false ||
    record['loggedIn'] === false ||
    record['authenticated'] === false;
  if (numeric === 401) {
    return {
      message: message === '' ? `HTTP ${String(numeric)}` : message,
      ...(loginUrl === undefined ? {} : { loginUrl }),
    };
  }
  if (!needsLogin || !AUTH_WORDS.test(message)) return undefined;
  return { message, ...(loginUrl === undefined ? {} : { loginUrl }) };
}

/**
 * 查一条自定义登录丢失形状：配方与读取计划共用同一套规则。
 * @param at 报错时用的字段路径。
 * @param value 待查的形状。
 * @returns 每个问题带字段路径；空数组表示合法。
 */
export function authLossProblemsOf(at: string, value: unknown): readonly AuthLossProblem[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path: at, problem: `${at} 要是对象` }];
  }
  const record = value as Readonly<Record<string, unknown>>;
  const problems: AuthLossProblem[] = [];
  const unknown = Object.keys(record).filter((key) => !['path', 'equals', 'in', 'messagePath'].includes(key));
  if (unknown.length > 0) {
    problems.push({ path: at, problem: `${at} 里有不认的键 ${unknown.map((key) => JSON.stringify(key)).join(' / ')}` });
  }
  if (textOf(record['path']) === '') problems.push({ path: `${at}.path`, problem: 'authLoss.path 不能为空' });
  const pathProblem = pathSegmentsProblem(record['path'], `${at}.path`);
  if (pathProblem !== undefined) problems.push({ path: `${at}.path`, problem: pathProblem });
  const hasEquals = record['equals'] !== undefined;
  if (hasEquals && !primitiveValue(record['equals'])) {
    problems.push({ path: `${at}.equals`, problem: 'authLoss.equals 只支持字符串 / 数字 / 布尔 / null' });
  }
  if (record['in'] !== undefined && !Array.isArray(record['in'])) {
    problems.push({ path: `${at}.in`, problem: 'authLoss.in 要是数组' });
  }
  if (Array.isArray(record['in']) && record['in'].some((one) => !primitiveValue(one))) {
    problems.push({ path: `${at}.in`, problem: 'authLoss.in 的元素只支持字符串 / 数字 / 布尔 / null' });
  }
  const hasIn = Array.isArray(record['in']) && record['in'].length > 0;
  if (!hasEquals && !hasIn) problems.push({ path: at, problem: 'equals 或 in 至少给一个' });
  if (hasEquals && hasIn) problems.push({ path: at, problem: 'equals 与 in 只给一个' });
  if (record['messagePath'] !== undefined && textOf(record['messagePath']) === '') {
    problems.push({ path: `${at}.messagePath`, problem: 'authLoss.messagePath 不能为空' });
  }
  const messageProblem = pathSegmentsProblem(record['messagePath'], `${at}.messagePath`);
  if (messageProblem !== undefined) problems.push({ path: `${at}.messagePath`, problem: messageProblem });
  return problems;
}

/**
 * 生成页面脚本里的登录丢失判定片段：依赖脚本里已有的 `pick`。
 * 不写 `authLoss` 时也生成一个恒返回 null 的函数，调用点不用分支。
 * @param authLoss 站点或计划上的形状。
 * @returns 可直接拼进脚本的行。
 */
export function authLossScriptLines(authLoss: AuthLoss | undefined): string[] {
  const normalized =
    authLoss === undefined
      ? undefined
      : {
          ...authLoss,
          path: authLoss.path.trim(),
          ...(authLoss.messagePath === undefined ? {} : { messagePath: authLoss.messagePath.trim() }),
        };
  return [
    `  const authLoss = ${normalized === undefined ? 'null' : JSON.stringify(normalized)};`,
    '  const authLostOf = (value) => {',
    '    if (authLoss === null) return null;',
    '    const got = pick(value, authLoss.path);',
    '    const hit = Array.isArray(authLoss.in) && authLoss.in.length > 0 ? authLoss.in.indexOf(got) >= 0 : got === authLoss.equals;',
    '    if (!hit) return null;',
    '    const message = authLoss.messagePath === undefined ? null : pick(value, authLoss.messagePath);',
    '    return typeof message === "string" && message !== "" ? message : "需要登录";',
    '  };',
  ];
}
