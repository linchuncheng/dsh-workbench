import { readFileSync } from 'node:fs';

export const FIXTURE = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));

export const envOf = () => ({
  DESKTOP_SMOKE_MARKET: FIXTURE.market,
  DESKTOP_SMOKE_MODULE: FIXTURE.module,
  DESKTOP_SMOKE_PLUGIN: FIXTURE.plugin,
  DESKTOP_SMOKE_UPDATE_FROM: FIXTURE.updateFrom,
});
