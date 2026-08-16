import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** @param {string} name */
export function loadFixture(name) {
  return readFileSync(join(root, name), 'utf8');
}
