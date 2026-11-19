import {
  acquireHostLease,
  now,
  PLUGIN_ID,
  readUpdateLease,
  updateLeaseActive,
  workbenchRoot,
  type DshHostContext,
} from '@dsh-workbench/shared/host';

const REINSTALL_WAIT_MS = 10 * 60_000 + 30_000;

export async function waitOutReinstall(log: (message: string) => void, deadline?: number): Promise<number> {
  const root = workbenchRoot();
  const end = deadline ?? now() + REINSTALL_WAIT_MS;
  if (now() >= end) return end;
  let warned = false;
  for (;;) {
    const lease = readUpdateLease(root);
    if (lease?.kind !== 'reinstall' || !updateLeaseActive(root)) return end;
    if (!warned) {
      log('另一个窗口正在重装依赖，等它结束再启动…');
      warned = true;
    }
    if (now() >= end) {
      log('依赖重装还没结束，先继续启动（可能短暂缺包）。');
      return end;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }
}

export interface HostLeaseInput {
  readonly profileDir: string | null;
  readonly profile: string;
  readonly version?: string | undefined;
  readonly onProblem: (message: string) => void;
}

export function holdHostLeaseEffect(ctx: DshHostContext, input: HostLeaseInput): void {
  ctx.effect(() => holdHostLease(input), `${PLUGIN_ID}: 宿主租约（按 profile 记录活着的窗口）`);
}

export function holdHostLease(input: HostLeaseInput): () => void {
  if (input.profileDir === null || input.profileDir === '') return () => {};
  let release: (() => void) | undefined;
  try {
    release = acquireHostLease({
      profileDir: input.profileDir,
      profile: input.profile,
      ...(input.version === undefined || input.version === '' ? {} : { version: input.version }),
    }).release;
  } catch (error) {
    input.onProblem(`宿主租约没写上（自更新会少一道闸）：${String(error)}`);
    return () => {};
  }
  return () => {
    try {
      release?.();
    } catch (error) {
      input.onProblem(`宿主租约未清除（下次更新会认为它仍在运行）：${String(error)}`);
    }
  };
}
