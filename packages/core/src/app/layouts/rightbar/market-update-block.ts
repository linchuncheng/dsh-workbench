import type { ModuleUpdateBlock } from '@/kernel/contract/bundle-install';
import type { MarketHint } from './market-row-types';
import { hostRequirementParams } from '../host-requirement';

export function updateBlockHintOf(block: ModuleUpdateBlock): MarketHint {
  if (block.kind === 'needs-workbench') return { key: 'panels.market.updateNeedsWorkbench' };
  if (block.kind === 'unverified') return { key: 'panels.market.updateUnverified' };
  const params = hostRequirementParams(block.requirements, block.runtimeVersion);
  if (params === undefined) return { key: 'panels.market.updateIncompatible' };
  return { key: 'panels.market.needsHostVersion', params };
}
