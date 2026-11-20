{
  "name": "__NAME__",
  "version": "0.1.0",
  "private": true,
  "description": "__DESC__",
  "type": "module",
  "exports": {
    ".": "./dist/host.js",
    "./client": "./client.js"
  },
  "files": ["dist", "client.js", "DEVELOPING.md", "CHANGELOG.md"],
  "scripts": {
    "build": "dsh-wb-module build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "selfcheck": "dsh-wb-module build && dsh-wb-module design check && node scripts/smoke.mjs",
    "check": "dsh-wb-module check",
    "check:duplication": "jscpd src scripts",
    "duplication:report": "jscpd src scripts --reporters html,json --output coverage/duplication",
    "lint": "dsh-wb-module lint",
    "design": "dsh-wb-module design",
    "prepack": "dsh-wb-module build"
  },
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["@dsh-workbench/core"],
      "external": ["@dsh-workbench/core/client", "@deepseek-ai/dsh-client-ui-primitives"]
    },
    "workbench": {
      "apiVersion": 3,
      "unit": "__UNIT__",
      "title": { "zh": "目录概览", "en": "Directory overview" },
      "card": { "order": 90 },
      "tools": [
        { "name": "__UNIT___run", "writes": false, "key": "run" },
        { "name": "__UNIT___add_note", "writes": true, "key": "addNote" }
      ],
      "host": { "inject": [] }
    },
    "workbenchFaces": { "host": "src/host.ts", "client": "src/client.tsx" }
  },
  "dependencies": { "@dsh-workbench/shared": "__SHELL_RANGE__" },
  "peerDependencies": { "@dsh-workbench/core": "__SHELL_RANGE__", "react": "*" },
  "peerDependenciesMeta": { "react": { "optional": true } },
  "devDependencies": {
    "@deepseek-ai/dsh-client-ui-primitives": "__DSH_UI_VERSION__",
    "@dsh-workbench/core": "__SHELL_RANGE__",
    "@dsh-workbench/module-tools": "__SHELL_RANGE__",
    "@types/node": "^24.19.0",
    "@types/react": "^19.3.0",
    "jscpd": "5.4.2",
    "react": "^19.3.0",
    "typescript": "5.9",
    "vitest": "^5.0.2"
  }
}
