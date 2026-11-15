import type { ProcessHost } from '@dsh-workbench/shared/host';
import type { SelfUpdateInstallStep } from './self-update-steps.js';

export interface SelfUpdateCommandDeps {
  readonly processes: ProcessHost;
  readonly timeoutMs?: number | undefined;
}

export function runSelfUpdateCommand(
  step: SelfUpdateInstallStep,
  deps: SelfUpdateCommandDeps,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const done = (code: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (grace !== undefined) clearTimeout(grace);
      resolve({ code, output });
    };
    const child = deps.processes.spawn({
      file: step.file,
      args: [...step.args],
      env: step.env,
      cwd: step.cwd,
      detached: false,
      stdio: 'pipe',
      windowsHide: true,
      killTree: true,
    });
    child.stdout?.onData((chunk) => {
      output += chunk;
    });
    child.stderr?.onData((chunk) => {
      output += chunk;
    });
    child.onError((error) => {
      output += `${output === '' ? '' : '\n'}${String(error)}`;
      done(null);
    });
    child.onExit((event) => {
      done(event.code);
    });
    if (deps.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        try {
          if (child.killTree !== undefined) child.killTree('SIGTERM');
          else child.kill('SIGTERM');
        } catch {
          // 进程可能已经退出
        }
        grace = setTimeout(() => done(null), 2_000);
        grace.unref?.();
      }, deps.timeoutMs);
      timer.unref?.();
    }
  });
}

export function profileInstallArgs(head: string | undefined, profileDir: string): readonly string[] {
  const args = ['install', '--dir', profileDir, '--prefer-offline', '--config.confirm-modules-purge=false'];
  return head !== undefined && /\.[cm]?js$/.test(head) ? [head, ...args] : args;
}
