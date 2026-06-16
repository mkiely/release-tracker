// Stage the flattened contract for packaging. Runs as `prepack` so the tarball
// carries `sync-contract/openapi.yaml` at top level (vs. the repo's nested
// `packages/sync-contract/`), giving work-truck a short, stable codegen path.
// The prebuilt `dist/` is produced separately (env-neutral `npm run build`) — this
// only handles the contract asset.

import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const src = new URL('packages/sync-contract/openapi.yaml', root);
const destDir = new URL('sync-contract/', root);
const dest = new URL('openapi.yaml', destDir);

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log(`[stage-tarball] ${fileURLToPath(src)} -> ${fileURLToPath(dest)}`);
