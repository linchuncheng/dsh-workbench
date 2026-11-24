import type { Translate } from './dsh-client.js';

export interface PromptHostFacts {
  readonly label: string;
  readonly version: string;
  readonly verified: string;
}

export interface PromptProblem {
  readonly why?: string;
  readonly rows?: string;
  readonly issue?: string;
  readonly reason?: string;
}

export interface PromptContext {
  readonly deployment?: string;
  readonly configDir?: string;
  readonly logDir?: string;
  readonly evidence?: string;
  readonly tried?: number;
}

export interface PromptFacts {
  readonly screen: string;
  readonly step?: string;
  readonly host?: PromptHostFacts;
  readonly problem?: PromptProblem;
  readonly context?: PromptContext;
}

/**
 * 取一段多行文本里第一行有内容的，给提示词与卡片当「原文首行」。
 * @param text - 可能为空或全是空行的原文。
 * @returns 第一行非空文本，没有就 `undefined`。
 */
export function firstLineOf(text: string | undefined): string | undefined {
  const line = (text ?? '')
    .split('\n')
    .map((one) => one.trim())
    .find((one) => one !== '');
  return line === undefined ? undefined : line;
}

/**
 * 把「哪里出的问题、看到什么、有什么证据」拼成一段可以直接粘给 agent 的提示词。
 * 空的整行省略；`step` 不给就只写屏幕名。
 * @param facts - 屏幕 / 步骤 / 版本对照 / 现象 / 现场上下文。
 * @param t - 文案函数，键在 askAgent.* 下。
 * @returns 多行提示词，最后一行是「先读证据再下结论」。
 */
export function faultPromptOf(facts: PromptFacts, t: Translate): string {
  const problem = facts.problem ?? {};
  const context = facts.context ?? {};
  const host = facts.host;
  const pick = (key: string, params: Record<string, string | number> | undefined): string[] =>
    params === undefined ? [] : [t(key, params)];
  const where =
    facts.step === undefined || facts.step.trim() === ''
      ? t('askAgent.prompt.whereOnly', { screen: facts.screen })
      : t('askAgent.prompt.where', { screen: facts.screen, step: facts.step });
  const lines = [
    t('askAgent.prompt.head'),
    where,
    ...pick('askAgent.prompt.why', problem.why === undefined ? undefined : { detail: problem.why }),
    ...pick('askAgent.prompt.rows', problem.rows === undefined ? undefined : { rows: problem.rows }),
    ...pick('askAgent.prompt.issue', problem.issue === undefined ? undefined : { issue: problem.issue }),
    ...pick('askAgent.prompt.reason', problem.reason === undefined ? undefined : { reason: problem.reason }),
    ...pick(
      'askAgent.prompt.host',
      host === undefined ? undefined : { host: host.label, version: host.version, verified: host.verified },
    ),
    ...pick(
      'askAgent.prompt.deployment',
      context.deployment === undefined ? undefined : { deployment: context.deployment },
    ),
    ...pick(
      'askAgent.prompt.configDir',
      context.configDir === undefined ? undefined : { configDir: context.configDir },
    ),
    ...pick('askAgent.prompt.logDir', context.logDir === undefined ? undefined : { dir: context.logDir }),
    ...pick(
      'askAgent.prompt.tried',
      context.tried === undefined || context.tried <= 0 ? undefined : { n: context.tried },
    ),
    ...pick('askAgent.prompt.evidence', context.evidence === undefined ? undefined : { files: context.evidence }),
    t('askAgent.prompt.ask'),
  ];
  return lines.join('\n');
}
