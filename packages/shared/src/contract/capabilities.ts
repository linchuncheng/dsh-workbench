export interface RuntimeCapabilities {
  readonly console: boolean;
  readonly pluginMarket: boolean;
  readonly browserBridge: boolean;
}

export interface RuntimeText {
  readonly zh: string;
  readonly en: string;
}

export interface RuntimeTerms {
  readonly plugin: RuntimeText;
  readonly pluginOf: RuntimeText;
  readonly pluginThing: RuntimeText;
  readonly pluginArea: RuntimeText;
}

export interface RuntimeBridgeFix {
  readonly text: RuntimeText;
  readonly link?: { readonly label: RuntimeText; readonly href: string };
}

export interface RuntimeProfile {
  readonly label: string;
  readonly terms: RuntimeTerms;
  readonly installHint: RuntimeText;
  readonly diagnose: Readonly<Partial<Record<'exec' | 'login' | 'bridge', RuntimeText>>>;
  readonly bridge?: Readonly<Partial<Record<string, RuntimeBridgeFix>>>;
}

export interface RuntimeBridgeStatus {
  readonly extension?: string;
  readonly connectivityMs?: number;
  readonly stale?: boolean;
  readonly connected?: boolean;
}

export interface RuntimeStatus {
  readonly command: string;
  readonly source: 'env' | 'isolated' | 'path';
  readonly isolated: string | null;
  readonly version?: string;
  readonly ready?: boolean;
  readonly note?: RuntimeText;
  readonly bridge?: RuntimeBridgeStatus;
}
