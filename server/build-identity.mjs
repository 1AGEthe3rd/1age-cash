import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const dir = dirname(fileURLToPath(import.meta.url));
await build({stdin:{contents:"export { default } from 'keycloak-js';",resolveDir:dir,sourcefile:'identity-sdk-entry.js'},bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:dir+'/generated/keycloak.mjs',legalComments:'inline'});
