import { OPENCLI_PIN, quoteShellArgFor } from '@dsh-workbench/shared/host';

export interface InstallSmokeRun {
  readonly ok: boolean;
  readonly detail: string;
}

export interface InstallSmokeInput {
  readonly command: string;
  readonly dir: string;
  readonly run: (commandLine: string) => Promise<InstallSmokeRun>;
  readonly pin?: string | undefined;
  readonly platform?: NodeJS.Platform | undefined;
}

export function versionCommandLine(command: string, platform: NodeJS.Platform = process.platform): string {
  return `${quoteShellArgFor(command, platform)} --version`;
}

function versionOf(text: string): string | undefined {
  return /\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(text)?.[1];
}

export async function smokeInstalledCli(input: InstallSmokeInput): Promise<InstallSmokeRun> {
  const pin = input.pin ?? OPENCLI_PIN;
  const line = versionCommandLine(input.command, input.platform);
  const result = await input.run(line);
  const text = result.detail.trim();
  if (!result.ok) {
    return {
      ok: false,
      detail: `装到了 ${input.dir}，但 ${line} 没跑通：${text === '' ? '（没有输出）' : text}`,
    };
  }
  const version = versionOf(text);
  if (version !== pin) {
    return {
      ok: false,
      detail: `装到了 ${input.dir}，但 ${line} 回的是 ${version ?? text}，要 ${pin}`,
    };
  }
  return { ok: true, detail: text };
}
