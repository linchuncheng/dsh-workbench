export const UPDATE_JOURNAL_STATES = ['prepared', 'carrying', 'flipping', 'manifest', 'committed'] as const;

export type UpdateJournalState = (typeof UPDATE_JOURNAL_STATES)[number];

export const UPDATE_JOURNAL_LINK_KINDS = ['symlink', 'dir', 'missing', 'other'] as const;

export type UpdateJournalLinkKind = (typeof UPDATE_JOURNAL_LINK_KINDS)[number];

export interface UpdateJournalLink {
  readonly pkg: string;
  readonly path: string;
  readonly kind: UpdateJournalLinkKind;
  readonly target?: string | undefined;
}

export interface UpdateJournalCarry {
  readonly pkg: string;
  readonly from: string;
  readonly to: string;
}

export interface UpdateJournalRecord {
  readonly schema: 1;
  readonly state: UpdateJournalState;
  readonly from: string;
  readonly to: string;
  readonly profileDir: string;
  readonly versionsDir: string;
  readonly versionDir: string;
  readonly manifestPath: string;
  readonly manifestText: string;
  readonly manifestDeps?: Readonly<Record<string, string | null>> | undefined;
  readonly links: readonly UpdateJournalLink[];
  readonly carry: readonly UpdateJournalCarry[];
  readonly cursor: number;
  readonly carried: number;
  readonly at: string;
  readonly updatedAt?: string | undefined;
}
