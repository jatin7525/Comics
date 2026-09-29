import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const siteFiles = ['index.html', 'app.js', 'theme.js', 'style.css'];

// Recreate only the generated deployment directory; publish site assets only.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of siteFiles) {
  await copyFile(path.join(root, file), path.join(output, file));
}
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
console.log('Astra Comics is ready to deploy from dist/');
