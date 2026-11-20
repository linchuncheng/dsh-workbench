export const README_SOURCE_FILE = 'readme.json';

export const README_SHOTS_TITLE = '界面预览';

export const README_SECTION_KEYS = ['see', 'do', 'agent', 'data'] as const;

export type ReadmeSectionKey = (typeof README_SECTION_KEYS)[number];

export const README_SECTION_HEADINGS: Readonly<Record<ReadmeSectionKey, string>> = {
  see: '你会看到什么',
  do: '你能做什么',
  agent: 'agent 能做什么',
  data: '数据从哪来',
};

export const SHOT_KINDS = ['card', 'approval', 'state', 'other'] as const;

export type ReadmeShotKind = (typeof SHOT_KINDS)[number];

export interface ReadmeShot {
  readonly kind?: ReadmeShotKind;
  readonly caption: string;
  readonly ascii: string;
}

export function readmeShotLines(shots: readonly ReadmeShot[]): readonly string[] {
  return shots.flatMap((shot) => {
    const drawing = shot.ascii.replace(/\s+$/, '');
    if (drawing.trim() === '') return [];
    const caption = shot.caption.trim();
    return [...(caption === '' ? [] : [`**${caption}**`, '']), '```', drawing, '```', ''];
  });
}

export interface ReadmeConfigItem {
  readonly config: string;
  readonly text: string;
}

export interface ReadmeCapabilityItem {
  readonly capabilities: readonly string[];
  readonly text: string;
}

export interface ReadmeTroubleItem {
  readonly states: readonly string[];
  readonly text: string;
}

export interface ReadmeFaqItem {
  readonly q: string;
  readonly a: string;
}

export interface ReadmeSource {
  readonly title: string;
  readonly summary: string;
  readonly shotsTitle?: string;
  readonly shots: readonly ReadmeShot[];
  readonly see: readonly string[];
  readonly do: readonly (string | ReadmeConfigItem)[];
  readonly agent: readonly (string | ReadmeCapabilityItem)[];
  readonly data: readonly string[];
  readonly install?: string;
  readonly trouble: readonly (string | ReadmeTroubleItem)[];
  readonly faq?: readonly ReadmeFaqItem[];
}

export interface ReadmeDraft extends Partial<ReadmeSource> {
  readonly summary: string;
  readonly shots?: readonly ReadmeShot[];
  readonly see?: readonly string[];
  readonly do?: readonly string[];
  readonly agent?: readonly string[];
  readonly data?: readonly string[];
}

export const README_SOURCE_KEYS = [
  'title',
  'summary',
  'shotsTitle',
  'shots',
  'see',
  'do',
  'agent',
  'data',
  'install',
  'trouble',
  'faq',
] as const satisfies readonly (keyof ReadmeSource)[];

export const README_COPY_KEYS = [
  'title',
  'summary',
  'see',
  'do',
  'agent',
  'data',
  'trouble',
] as const satisfies readonly (keyof ReadmeSource)[];

export function readmeShotKindProblem(kind: unknown): string | undefined {
  if (kind === undefined || kind === null || kind === '') return undefined;
  return SHOT_KINDS.includes(kind as ReadmeShotKind)
    ? undefined
    : `kind 仅接受 ${SHOT_KINDS.join(' / ')}，收到「${String(kind)}」`;
}
