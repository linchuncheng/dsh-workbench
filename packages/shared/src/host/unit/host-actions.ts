import type { HostActions } from '../adapters/port-types.js';
import { configSyncAction, configSyncHandler } from '../profile/config-sync.js';
import { profileCreateAction, profileCreateHandler } from '../profile/profile-create.js';

export function createHostActions(): HostActions {
  return { configSyncAction, configSyncHandler, profileCreateAction, profileCreateHandler };
}
