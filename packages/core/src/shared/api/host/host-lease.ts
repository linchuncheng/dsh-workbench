import {
  acquireHostLease,
  PLUGIN_ID,
  readUpdateLease,
  updateLeaseActive,
  workbenchRoot,
  type DshHostContext,
} from '@dsh-workbench/shared/host';

const REINSTALL_WAIT_MS = 10 * 60_000 + 30_000;

/**
 * 启动器正在重装依赖时，等它写完再让宿主加载模块；否则会从半装的 node_modules 里 require。
 * 只等启动器的重装锁（kind='reinstall'），不等 runner 的更新锁——runner 正等我们启动。
 */
export async function waitOutReinstall(log: (message: string) => void, deadline?: number): Promise<number> {
  const root = workbenchRoot();
  const end = deadline ?? Date.now() + REINSTALL_WAIT_MS;
  // 已经等过一轮上限：别再开新的等待窗口。
  if (Date.now() >= end) return end;
  let warned = false;
  for (;;) {
    const lease = readUpdateLease(root);
    if (lease?.kind !== 'reinstall' || !updateLeaseActive(root)) return end;
    if (!warned) {
      log('另一个窗口正在重装依赖，等它结束再启动…');
      warned = true;
    }
    if (Date.now() >= end) {
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
      input.onProblem(`宿主租约没删掉（下次更新会当它还在跑）：${String(error)}`);
    }
  };
}
