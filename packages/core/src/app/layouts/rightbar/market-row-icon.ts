import { createElement as h } from 'react';
import { IconBrandMarkColor, IconCommand, IconEnv, IconNpm, IconOpencli } from '@dsh-workbench/shared';
import { PluginArtworkDefault } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketRow } from './market-row-types';
import type { SharedRow } from './market-rows';

export type PackageKind = 'module' | 'plugin' | 'lib' | 'workbench' | 'command' | 'env';

const SIZE = 28;

const COMMAND_SIZE = 32;

const ARTWORK = 36;

export function packageIcon(kind: PackageKind) {
  switch (kind) {
    case 'module':
      return h(PluginArtworkDefault, { size: ARTWORK });
    case 'plugin':
      return h(IconOpencli, { size: SIZE });
    case 'lib':
      return h(IconNpm, { size: SIZE });
    case 'workbench':
      return h(IconBrandMarkColor, { size: SIZE });
    case 'command':
      return h(IconCommand, { size: COMMAND_SIZE });
    case 'env':
      return h(IconEnv, { size: SIZE });
  }
}

export function marketRowKind(row: MarketRow): PackageKind {
  if (row.workbench === true) return 'workbench';
  if (row.plugin === true) return 'plugin';
  return 'module';
}

export function sharedRowKind(row: SharedRow): PackageKind {
  return row.kind === 'extension' ? 'plugin' : 'lib';
}

export type PackageIcon = ReturnType<typeof packageIcon>;
