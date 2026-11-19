import { describe, expect, it } from 'vitest';
import { hostSurface, profileNameOf } from '../host-surface.js';

describe('hostSurface', () => {
  it('文件管理器按宿主能力给语义值', () => {
    expect(hostSurface({ platform: 'darwin' }).capabilities.fileManager).toBe('finder');
    expect(hostSurface({ platform: 'win32' }).capabilities.fileManager).toBe('explorer');
    expect(hostSurface({ platform: 'linux' }).capabilities.fileManager).toBe('none');
  });

  it('profile 名从路径尾段归一', () => {
    expect(profileNameOf('/home/me/.dsh/Workbench')).toBe('workbench');
    expect(profileNameOf('C:\\dsh\\desktop')).toBe('desktop');
    expect(profileNameOf('other')).toBe('other');
  });
});
