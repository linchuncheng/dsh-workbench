import { faultPromptOf, firstLineOf } from '@dsh-workbench/shared';
import type { PromptContext, PromptFacts, PromptHostFacts, PromptProblem, Translate } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';

export { faultPromptOf };
export type { PromptContext, PromptFacts, PromptHostFacts, PromptProblem };

export type GateDeployment = 'desktop' | 'web';

export interface GateFacts {
  readonly deployment: GateDeployment;
  readonly retried: number;
  readonly host: string;
}

export interface FallbackCard {
  readonly mode: 'fallback';
  readonly title: string;
  readonly facts: readonly string[];
  readonly hint?: string;
  readonly prompt: string;
}

export interface DeterministicDiyCard {
  readonly mode: 'deterministic';
  readonly why: string;
  readonly step: string;
  readonly command?: string;
}

export type DiyCard = DeterministicDiyCard | FallbackCard;

function deploymentTextOf(deployment: GateDeployment, t: Translate): string {
  return t(deployment === 'desktop' ? 'askAgent.deployment.desktop' : 'askAgent.deployment.web');
}

function hostFactsOf(snapshot: PreflightSnapshot, host: string): Pick<PromptFacts, 'host'> {
  const gap = snapshot.hostGap;
  const version = gap?.runtime ?? snapshot.hostFacts?.version;
  const verified = gap?.verified ?? snapshot.hostFacts?.verified;
  if (version === undefined || verified === undefined) return {};
  return { host: { label: host, version, verified } };
}

function evidenceFactsOf(snapshot: PreflightSnapshot): Pick<PromptFacts, 'context'> {
  const paths = snapshot.paths;
  return {
    context: {
      ...(snapshot.hostFacts?.profileDir === undefined ? {} : { configDir: snapshot.hostFacts.profileDir }),
      ...(paths === undefined ? {} : { logDir: `${paths.dshHome}/logs`, evidence: `${paths.workbenchRoot}/preflight.json` }),
    },
  };
}

function fallbackPromptOf(
  snapshot: PreflightSnapshot,
  gate: GateFacts,
  t: Translate,
  step: string,
  problem: PromptProblem,
): string {
  return faultPromptOf(
    {
      screen: t('env.title'),
      step,
      ...hostFactsOf(snapshot, gate.host),
      problem,
      context: {
        deployment: deploymentTextOf(gate.deployment, t),
        tried: gate.retried,
        ...evidenceFactsOf(snapshot).context,
      },
    },
    t,
  );
}

export function diyCardOf(snapshot: PreflightSnapshot, gate: GateFacts, t: Translate): DiyCard | undefined {
  const gap = snapshot.diyGap;
  if (gap === undefined) return undefined;
  if (gap.kind === 'older-dsh') {
    const hostGap = snapshot.hostGap;
    return {
      mode: 'deterministic',
      why:
        hostGap === undefined
          ? ''
          : t('env.diy.older.why', { host: gate.host, runtime: hostGap.runtime, verified: hostGap.verified }),
      step: t('env.diy.older.step', { host: gate.host }),
      ...(gate.deployment === 'desktop' || gap.command === undefined ? {} : { command: gap.command }),
    };
  }
  const step = t('env.step.diy');
  if (gap.kind === 'preset-missing') {
    return {
      mode: 'fallback',
      title: t('askAgent.title'),
      facts: [t('env.diy.presetMissing.why', { host: gate.host })],
      hint: t('env.diy.presetMissing.hint'),
      prompt: fallbackPromptOf(snapshot, gate, t, step, { why: gap.detail }),
    };
  }
  const rows = gap.rows.join('、');
  return {
    mode: 'fallback',
    title: t('askAgent.title'),
    facts: [t('env.diy.broken.why', { rows })],
    hint: t('env.diy.broken.hint', { host: gate.host }),
    prompt: fallbackPromptOf(snapshot, gate, t, step, {
      why: gap.detail,
      ...(rows === '' ? {} : { rows }),
    }),
  };
}

export function bridgeFallbackOf(
  snapshot: PreflightSnapshot,
  gate: GateFacts,
  t: Translate,
): FallbackCard | undefined {
  const issues = snapshot.bridgeIssues ?? [];
  if (!issues.includes('unknown')) return undefined;
  const step = snapshot.steps.find((item) => item.id === 'bridge');
  return {
    mode: 'fallback',
    title: t('askAgent.title'),
    facts: [t('env.bridge.unknown')],
    prompt: fallbackPromptOf(snapshot, gate, t, t('env.step.bridge'), { issue: firstLineOf(step?.detail) }),
  };
}
