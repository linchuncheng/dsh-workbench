export class WorkbenchDataError extends Error {
  readonly code: string;
  readonly detail?: string;
  readonly hint?: string;
  readonly project?: unknown;
  readonly helpUrl?: string;
  readonly failure?: unknown;
  readonly pendingBuilds?: readonly string[];

  constructor(
    code: string,
    message: string,
    extra: {
      detail?: string;
      hint?: string;
      project?: unknown;
      helpUrl?: string;
      failure?: unknown;
      pendingBuilds?: readonly string[];
    } = {},
  ) {
    super(message);
    this.name = 'WorkbenchDataError';
    this.code = code;
    if (extra.detail !== undefined) this.detail = extra.detail;
    if (extra.hint !== undefined) this.hint = extra.hint;
    if (extra.project !== undefined) this.project = extra.project;
    if (extra.helpUrl !== undefined) this.helpUrl = extra.helpUrl;
    if (extra.failure !== undefined) this.failure = extra.failure; if (extra.pendingBuilds !== undefined) this.pendingBuilds = extra.pendingBuilds;
  }
}
