import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try {
  const template = await readFile('.env.example', 'utf8');
  const content = template
    .replace('LOCAL_R2_TOKEN=\n', `LOCAL_R2_TOKEN=${randomBytes(32).toString('hex')}\n`)
    .replace('RATE_LIMIT_SECRET=\n', `RATE_LIMIT_SECRET=${randomBytes(32).toString('hex')}\n`)
    .replace('SEED_PASSWORD=\n', `SEED_PASSWORD=Astra-${randomBytes(14).toString('base64url')}!\n`);
  await writeFile('.env.local', content, { flag: 'wx', mode: 0o600 });
  console.log('Created .env.local with generated local secrets. Existing environment files are never overwritten.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env.local already exists; preserved it.');
  else throw error;
}
