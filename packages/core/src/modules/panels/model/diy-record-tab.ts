import { BROWSER_RECORD_SESSION, type Seam } from '@dsh-workbench/shared/host';
import { formSnapOf, writeFormFields, writeFormHtml, type FormSnap } from '@/shared/api/host/diy-form-file';
import { actBrowser } from './diy-browser-act';
import type { Wire } from './diy-browser';
import { RECORD_SNAP_SCRIPT } from './diy-record-read-scripts';
import { evalPayloadOf } from './diy-eval';

export { evalPayloadOf };

let recordTab: string | undefined;
let recordSite: string | undefined;

export const trimmedNameOf = (value: string | undefined): string | undefined =>
  value !== undefined && value.trim() !== '' ? value.trim() : undefined;

export function rememberRecordTab(page: string | undefined, site?: string): void {
  recordTab = trimmedNameOf(page);
  recordSite = trimmedNameOf(site);
}

export function recordedTabOf(): string | undefined {
  return recordTab;
}

export interface RetainedTab {
  readonly tab: string;
  readonly site: string;
}

export function retainedTabOf(): RetainedTab | null {
  return recordTab === undefined ? null : { tab: recordTab, site: recordSite ?? '' };
}

export function forgetRecordTab(): void {
  recordTab = undefined;
  recordSite = undefined;
}

interface FormSnapView {
  readonly href: string;
  readonly title: string;
  readonly bytes: number;
  readonly truncated: boolean;
  readonly at: number;
  readonly fields: number;
  readonly required: readonly string[];
}

interface TakenSnap extends FormSnap {
  readonly html: string;
}

const snapOfPayload = (payload: Record<string, unknown> | undefined): TakenSnap | null => {
  if (payload === undefined || payload['ok'] === false) return null;
  const html = payload['html'];
  if (typeof html !== 'string' || html.trim() === '') return null;
  const rows = Array.isArray(payload['fields']) ? (payload['fields'] as FormSnap['fields']) : [];
  return { ...formSnapOf(payload, rows), html };
};

export async function takeSnapOf(
  seam: Seam,
  command: string,
  captureFile: string,
  wire?: Wire,
): Promise<boolean> {
  try {
    const step = await actBrowser(seam, command, BROWSER_RECORD_SESSION, recordEval(RECORD_SNAP_SCRIPT), undefined, wire);
    const snap = snapOfPayload(step.payload);
    if (!step.ok || snap === null) return false;
    const written = writeFormHtml(captureFile, snap.html);
    writeFormFields(captureFile, snap);
    return written !== '';
  } catch {
    return false;
  }
}

export const saveSnapFile = takeSnapOf;

export function snapViewOf(snap: FormSnap | null): FormSnapView | null {
  if (snap === null) return null;
  return {
    href: snap.href,
    title: snap.title,
    bytes: snap.bytes,
    truncated: snap.truncated,
    at: snap.at,
    fields: snap.fields.length,
    required: snap.fields.filter((one) => one.required).map((one) => one.name),
  };
}

export function recordEval(script: string): readonly string[] {
  const tab = recordTab;
  const payload = evalPayloadOf(script);
  return tab === undefined ? ['eval', payload] : ['eval', '--tab', tab, payload];
}
