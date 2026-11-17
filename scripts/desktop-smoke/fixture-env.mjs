import { envOf } from './fixture.mjs';

for (const [key, value] of Object.entries(envOf())) process.stdout.write(`${key}=${value}\n`);
