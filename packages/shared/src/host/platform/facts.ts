import type { HostOs } from '../../contract/protocol/platform.js';

export function hostOsOf(platform: NodeJS.Platform = process.platform): HostOs {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') return platform;
  return 'other';
}
