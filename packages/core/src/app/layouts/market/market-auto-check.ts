import {
  moduleVersionsCheckedAt,
  moduleVersionsChecking,
  moduleVersionsValue,
  runModuleVersionsRead,
} from './use-module-versions';

export const AUTO_CHECK_BOOT_DELAY_MS = 60_000;
export const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const AUTO_CHECK_VISIBLE_GAP_MS = 10 * 60 * 1000;

export interface MarketAutoCheckDeps {
  readonly now: () => number;
  readonly after: (ms: number, run: () => void) => unknown;
  readonly cancel: (id: unknown) => void;
  readonly run: () => Promise<void>;
  readonly visible: () => boolean;
  readonly lastCheckedAt: () => number | null;
}

export interface MarketAutoCheck {
  start(): void;
  stop(): void;
  noteVisible(): void;
}

interface Armed {
  readonly id: unknown;
}

export function createMarketAutoCheck(deps: MarketAutoCheckDeps): MarketAutoCheck {
  let lastAt: number | null = null;
  let armed: Armed | null = null;
  let started = false;

  function disarm(): void {
    if (armed === null) return;
    deps.cancel(armed.id);
    armed = null;
  }

  function schedule(ms: number): void {
    disarm();
    armed = { id: deps.after(ms, fire) };
  }

  function check(): void {
    lastAt = deps.now();
    void deps.run().catch((error: unknown) => {
      console.warn('[dsh-workbench] 后台检查更新失败', error);
    });
    schedule(AUTO_CHECK_INTERVAL_MS);
  }

  function fire(): void {
    armed = null;
    if (!deps.visible()) return;
    check();
  }

  function lastCheckAt(): number | null {
    const recorded = deps.lastCheckedAt();
    if (recorded === null) return lastAt;
    return lastAt === null ? recorded : Math.max(recorded, lastAt);
  }

  function noteVisible(): void {
    if (!started || !deps.visible()) return;
    const last = lastCheckAt();
    if (last === null) {
      check();
      return;
    }
    const elapsed = deps.now() - last;
    if (elapsed >= AUTO_CHECK_VISIBLE_GAP_MS) {
      check();
      return;
    }
    if (armed === null) schedule(AUTO_CHECK_INTERVAL_MS - elapsed);
  }

  return {
    start() {
      if (started) return;
      started = true;
      schedule(AUTO_CHECK_BOOT_DELAY_MS);
    },
    stop() {
      started = false;
      disarm();
    },
    noteVisible,
  };
}

function autoCheckRun(): Promise<void> {
  if (moduleVersionsChecking(moduleVersionsValue())) return Promise.resolve();
  return runModuleVersionsRead(false);
}

function documentVisible(): boolean {
  return typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
}

export function startMarketAutoCheck(): () => void {
  const auto = createMarketAutoCheck({
    now: () => Date.now(),
    after: (ms, run) => globalThis.setTimeout(run, ms),
    cancel: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
    run: autoCheckRun,
    visible: documentVisible,
    lastCheckedAt: () => moduleVersionsCheckedAt(moduleVersionsValue()),
  });
  auto.start();
  if (typeof document === 'undefined') return () => auto.stop();
  const wake = (): void => auto.noteVisible();
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
  return () => {
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('focus', wake);
    window.removeEventListener('pageshow', wake);
    auto.stop();
  };
}
