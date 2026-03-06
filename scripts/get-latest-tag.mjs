#!/usr/bin/env node
/**
 * Get the latest git tag (sorted by semver descending).
 * Outputs: tag=<value> to $GITHUB_OUTPUT for use in GitHub Actions.
 * Cross-platform (no shell pipe needed).
 */

import { execSync } from 'child_process';
import { appendFileSync } from 'fs';

try {
  execSync('git fetch --tags --force', { stdio: 'inherit' });
} catch {
  console.warn('Warning: git fetch --tags failed, using local tags');
}

let tag = 'v1.0.0';
try {
  const tags = execSync('git tag', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(t => /^v\d+/.test(t))
    .sort((a, b) => {
      const pa = a.replace(/^v/, '').split('.').map(Number);
      const pb = b.replace(/^v/, '').split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      }
      return 0;
    });
  if (tags[0]) tag = tags[0];
} catch {
  console.warn('Warning: git tag failed, defaulting to v1.0.0');
}
console.log(`Latest tag: ${tag}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
}
