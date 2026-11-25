export interface CommandFile {
  readonly content: string;
  readonly suffix?: string | undefined;
}

export interface CommandRequest {
  readonly argv: readonly string[];
  readonly timeoutMs?: number | undefined;
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly files?: readonly CommandFile[] | undefined;
  readonly appendFileArgs?: string | undefined;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly filePaths: readonly string[];
  readonly error?: string | undefined;
}

/** 运行一条 argv 命令，不经过 shell。 */
export interface CommandReader {
  /** files 先写成临时文件，按 appendFileArgs 追加到 argv，运行完清掉。 */
  run(request: CommandRequest): Promise<CommandResult>;
}

export const INSTALL_FAILURE_KINDS = ['permission', 'disk-full', 'auth', 'sandbox', 'unknown'] as const;

export type InstallFailureKind = (typeof INSTALL_FAILURE_KINDS)[number];

export type InstallFix =
  | { readonly kind: 'chown'; readonly path: string; readonly uid: number; readonly gid: number }
  | { readonly kind: 'chmod'; readonly path: string }
  | { readonly kind: 'space'; readonly path: string }
  | { readonly kind: 'handoff' };

export interface InstallFailure {
  readonly kind: InstallFailureKind;
  readonly command: string;
  readonly exitCode: number | null;
  readonly output: string;
  readonly summary?: string | undefined;
  readonly registry?: string | undefined;
  readonly path?: string | undefined;
  readonly mode?: string | undefined;
  readonly owner?: { readonly uid: number; readonly gid: number } | undefined;
  readonly current: { readonly uid: number; readonly gid: number };
  readonly fix: InstallFix;
}
