import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const buildDirectory = resolve('dist');

function isSecretFile(name) {
  return name === '.dev.vars' || name === '.env' || name === '.env.local' || name.startsWith('.env.');
}

function isStaleDeploymentArchive(name) {
  return /^site-[a-f0-9]+\.tar\.gz$/i.test(name);
}

async function scrub(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await scrub(entryPath);
      return;
    }
    if (isSecretFile(entry.name) || isStaleDeploymentArchive(entry.name)) await rm(entryPath, { force: true });
  }));
}

try {
  await scrub(buildDirectory);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
