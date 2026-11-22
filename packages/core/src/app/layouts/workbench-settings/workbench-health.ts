export interface AdapterSetHealth {
  readonly configured: string | null;
  readonly id: string;
  readonly version: string;
  readonly usesDefaults: boolean;
  readonly failure: string | null;
  readonly detail: string | null;
  readonly messageKey: string | null;
}

export interface WorkbenchIdentity {
  readonly profile: string | null;
  readonly version: string;
}

export interface WorkbenchHealthSnapshot {
  readonly adapterSet?: AdapterSetHealth;
  readonly workbench?: WorkbenchIdentity;
}
