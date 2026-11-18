import type { Seam } from '@dsh-workbench/shared/host';
import { opencliResultOf } from '@dsh-workbench/adapter-runtime';
import { activateAppCommand, bringBackCommand, frontAppCommand, frontAppOf, noWrite } from '@dsh-workbench/shared/host';
import { currentHostOs } from './platform.js';

const TIMEOUT_MS = 5000;

async function runFrontApp(
  seam: Seam,
  command: string | undefined,
): Promise<{ readonly stdout: string; readonly ok: boolean } | undefined> {
  if (command === undefined) return undefined;
  const result = await seam
    .run({ command, intent: noWrite(), retry: 'safe', timeoutMs: TIMEOUT_MS, bestEffort: true })
    .catch(() => undefined);
  if (result === undefined || result.timedOut) return undefined;
  return { stdout: result.stdout, ok: result.exitCode === 0 };
}

export async function frontAppNow(seam: Seam, platform = currentHostOs()): Promise<string | undefined> {
  const run = await runFrontApp(seam, frontAppCommand(platform));
  return run === undefined ? undefined : frontAppOf(run.stdout, platform);
}

const BROWSER_NAMES: Readonly<Record<string, readonly string[]>> = {
  'darwin': ['Google Chrome', 'Chromium', 'Microsoft Edge', 'Brave Browser'],
  'win32': ['Google Chrome', 'Microsoft Edge'],
  'linux': ['google-chrome', 'chromium'],
};

export async function raiseBrowser(seam: Seam, platform = currentHostOs()): Promise<boolean> {
  for (const name of BROWSER_NAMES[platform] ?? []) {
    const command = activateAppCommand(name, platform);
    if (command === undefined) return false;
    const run = await runFrontApp(seam, command);
    if (run?.ok === true) return true;
  }
  return false;
}

export async function bringBackWindow(
  seam: Seam,
  app: string,
  platform = currentHostOs(),
): Promise<boolean> {
  const run = await runFrontApp(seam, bringBackCommand(app, platform));
  return run?.ok === true;
}

export interface FocusedChromeTab {
  readonly windowId: number;
  readonly tabId: number;
}

let focusedTab: FocusedChromeTab | undefined;

const BROWSER_APP = /chrome|chromium|edge|brave|vivaldi/i;

export function isBrowserApp(app: string): boolean {
  return BROWSER_APP.test(app);
}

async function chromeCall(seam: Seam, command: string, method: string, args: string): Promise<unknown> {
  const result = await seam
    .run({
      argv: [command, 'browser', '--session', 'workbench-probe', 'chrome', 'call', method, args],
      intent: noWrite(),
      timeoutMs: 10_000,
      bestEffort: true,
    })
    .catch(() => undefined);
  if (result === undefined || result.timedOut || result.exitCode !== 0) return undefined;
  try {
    const data = opencliResultOf(result.stdout);
    return typeof data === 'object' && data !== null ? data : undefined;
  } catch {
    return undefined;
  }
}

function numberField(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === 'number' && Number.isInteger(found) ? found : undefined;
}

async function captureFocusedTab(seam: Seam, command: string): Promise<void> {
  const windows = await chromeCall(seam, command, 'windows.getAll', '[]');
  if (!Array.isArray(windows)) return;
  const focused = windows.find((one) => {
    if (typeof one !== 'object' || one === null) return false;
    return (one as Record<string, unknown>)['focused'] === true;
  });
  const windowId = numberField(focused, 'id');
  if (windowId === undefined) return;
  const tabs = await chromeCall(seam, command, 'tabs.query', JSON.stringify([{ windowId, active: true }]));
  if (!Array.isArray(tabs) || tabs.length === 0) return;
  const tabId = numberField(tabs[0], 'id');
  if (tabId === undefined) return;
  focusedTab = { windowId, tabId };
}

export async function rememberFrontApp(
  seam: Seam,
  command: string,
  platform = currentHostOs(),
): Promise<string | undefined> {
  const app = await frontAppNow(seam, platform);
  if (app !== undefined && isBrowserApp(app)) await captureFocusedTab(seam, command);
  return app;
}

export async function restoreFocus(
  seam: Seam,
  command: string,
  app: string,
  platform = currentHostOs(),
): Promise<boolean> {
  const saved = focusedTab;
  if (saved !== undefined && isBrowserApp(app)) {
    const activated = await chromeCall(seam, command, 'tabs.update', JSON.stringify([saved.tabId, { active: true }]));
    const raised = await chromeCall(
      seam,
      command,
      'windows.update',
      JSON.stringify([saved.windowId, { focused: true }]),
    );
    if (activated !== undefined || raised !== undefined) return true;
  }
  return bringBackWindow(seam, app, platform);
}
