import { readFileSync } from 'node:fs';
import { writeTextFile } from '@dsh-workbench/shared/host';

export interface FormField {
  readonly name: string;
  readonly label: string;
  readonly kind: string;
  readonly required: boolean;
  readonly filled: boolean;
  readonly value: string;
  readonly options: readonly string[];
}

export interface FormSnap {
  readonly href: string;
  readonly title: string;
  readonly at: number;
  readonly bytes: number;
  readonly truncated: boolean;
  readonly fields: readonly FormField[];
}

const base = (captureFile: string): string => captureFile.replace(/\.jsonl$/, '');

export const formSnapOf = (box: Record<string, unknown>, fields: readonly FormField[]): FormSnap => ({
  href: String(box['href'] ?? ''),
  title: String(box['title'] ?? ''),
  at: typeof box['at'] === 'number' ? box['at'] : 0,
  bytes: typeof box['bytes'] === 'number' ? box['bytes'] : 0,
  truncated: box['truncated'] === true,
  fields,
});

export function writeFormHtml(captureFile: string, html: string): string {
  const file = `${base(captureFile)}-form.html`;
  try {
    writeTextFile(file, html);
    return file;
  } catch {
    return '';
  }
}

export function writeFormFields(captureFile: string, snap: FormSnap): string {
  const file = `${base(captureFile)}-form.json`;
  try {
    writeTextFile(file, JSON.stringify(snap));
    return file;
  } catch {
    return '';
  }
}

export function readFormSnap(captureFile: string): FormSnap | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(`${base(captureFile)}-form.json`, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const box = parsed as Record<string, unknown>;
    const fields = Array.isArray(box['fields']) ? (box['fields'] as FormField[]) : [];
    return formSnapOf(box, fields);
  } catch {
    return null;
  }
}
