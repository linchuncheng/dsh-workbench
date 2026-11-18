import { readFileSync } from 'node:fs';

export const FIXTURE = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));

export const envOf = () => ({
  DESKTOP_SMOKE_MARKET: FIXTURE.market,
  DESKTOP_SMOKE_MODULE: FIXTURE.module,
  DESKTOP_SMOKE_PLUGIN: FIXTURE.plugin,
  DESKTOP_SMOKE_UPDATE_FROM: FIXTURE.updateFrom,
  DESKTOP_SMOKE_DESKTOP_VERSION: FIXTURE.desktop.version,
  DESKTOP_SMOKE_DESKTOP_MAC_URL: FIXTURE.desktop.macosArm64.url,
  DESKTOP_SMOKE_DESKTOP_MAC_ETAG: FIXTURE.desktop.macosArm64.etag,
  DESKTOP_SMOKE_DESKTOP_WIN_URL: FIXTURE.desktop.windowsX64.url,
  DESKTOP_SMOKE_DESKTOP_WIN_ETAG: FIXTURE.desktop.windowsX64.etag,
  DESKTOP_SMOKE_CFT_VERSION: FIXTURE.chromeForTesting.version,
  DESKTOP_SMOKE_OPENCLI_TAG: FIXTURE.opencliExtension.tag,
  DESKTOP_SMOKE_OPENCLI_ASSET: FIXTURE.opencliExtension.asset,
});
