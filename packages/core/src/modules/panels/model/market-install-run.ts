import { join, resolve, sep } from 'node:path';
import {
  INSTALL_TIMEOUT_MS,
  diagnoseInstallFailure,
  installWriteProblem,
  PlanStepError,
  planStepText,
  productWrite,
  removePath,
  runPlan,
  storeMismatchIn,
} from '@dsh-workbench/shared/host';
import type { PluginPlanStep, Seam, SupplyPort } from '@dsh-workbench/shared/host';
import { installError } from './market-install-error';

export interface InstallRunDeps {
  readonly seam?: Seam | undefined;
  readonly supply: SupplyPort;
}

export interface InstallRunner {
  run(line: string, optional?: boolean): Promise<void>;
  runAll(steps: readonly PluginPlanStep[]): Promise<void>;
}

function dropTargetOf(line: string, root: string): string | undefined {
  const match = /--dir\s+'([^']+)'/.exec(line);
  if (match === null) return undefined;
  const dir = resolve(match[1] ?? '');
  const base = resolve(root);
  if (dir !== base && !dir.startsWith(`${base}${sep}`)) return undefined;
  return join(dir, 'node_modules');
}

function installFailureOf(error: PlanStepError, root: string): Error {
  return installError(
    diagnoseInstallFailure({
      command: planStepText(error.step),
      exitCode: error.exitCode,
      output: error.output,
      fallback: root,
    }),
  );
}

export function createInstallRunner(deps: InstallRunDeps): InstallRunner {
  function commandStep(line: string, optional: boolean): PluginPlanStep {
    return optional ? { kind: 'run', line, optional: true } : { kind: 'run', line };
  }

  async function runAll(steps: readonly PluginPlanStep[]): Promise<void> {
    const { seam, supply } = deps;
    if (seam === undefined) {
      throw new Error('本机没有 shell 服务，无法安装或卸载。');
    }
    const root = supply.modules.isolatedRoot();
    const attempt = (): Promise<void> =>
      runPlan(steps, {
        seam,
        intent: productWrite(),
        timeoutMs: INSTALL_TIMEOUT_MS,
        check: (step) => {
          if (step.kind !== 'run') return;
          const blocked = installWriteProblem({ command: step.line, fallback: root });
          if (blocked !== undefined) throw installError(blocked);
        },
      });
    try {
      await attempt();
    } catch (error) {
      if (!(error instanceof PlanStepError)) throw error;
      if (!storeMismatchIn(error.output)) throw installFailureOf(error, root);
      const drop = dropTargetOf(planStepText(error.step), root);
      if (drop === undefined) throw installFailureOf(error, root);
      try {
        removePath(drop);
      } catch {
        throw installFailureOf(error, root);
      }
      try {
        await attempt();
      } catch (retry) {
        if (!(retry instanceof PlanStepError)) throw retry;
        throw installFailureOf(retry, root);
      }
    }
  }

  async function run(line: string, optional = false): Promise<void> {
    await runAll([commandStep(line, optional)]);
  }

  return { run, runAll };
}
