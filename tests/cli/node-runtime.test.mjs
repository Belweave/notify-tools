import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const supported = ['22.23.4', '22.23.5', '22.24.0', '24.22.1', '24.23.0', '26.12.1', '26.13.0'];
const rejected = ['22.13.0', '22.23.3', '24.22.0', '26.12.0', '18.20.8', '20.20.0', '23.99.99', '25.0.0', '27.0.0', '28.0.0', '26.12.1-rc.1', '26.12', 'garbage', '026.12.1'];

test('runtime policy accepts patched supported lines and rejects vulnerable, EOL and prerelease versions', async () => {
  const { isSupportedNodeVersion, assertSupportedNode, NODE_ENGINE_RANGE } = await import('../../src/runtime/node.mjs');
  assert.equal(NODE_ENGINE_RANGE, '^22.23.4 || ^24.22.1 || ^26.12.1');
  for (const version of supported) {
    assert.equal(isSupportedNodeVersion(version), true, version);
    assert.doesNotThrow(() => assertSupportedNode(version));
  }
  for (const version of rejected) {
    assert.equal(isSupportedNodeVersion(version), false, version);
    assert.throws(() => assertSupportedNode(version), /Node\.js.*22\.23\.4.*24\.22\.1.*26\.12\.1/);
  }
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.engines.node, NODE_ENGINE_RANGE);
  const check = await readFile(new URL('../../.github/workflows/check.yml', import.meta.url), 'utf8');
  const release = await readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(check, /node: \['22\.23\.4', '24\.22\.1', '26\.12\.1'\]/);
  assert.match(release, /node-version: '22\.23\.4'/);
});

test('CLI and installer refuse vulnerable runtimes before help or filesystem changes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'notify node floor '));
  try {
    const preload = join(folder, 'node-version.mjs');
    for (const version of ['22.23.3', '24.22.0', '26.12.0', '25.0.0']) {
      await writeFile(preload, `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(version)} });`);
      for (const entry of ['bin/notify.mjs', 'scripts/install.mjs']) {
        const result = spawnSync(process.execPath, ['--import', preload, resolve(entry), '--help'], {
          encoding: 'utf8', timeout: 10000,
          env: { PATH: process.env.PATH, HOME: folder },
        });
        assert.notEqual(result.status, 0, `${entry} accepted ${version}`);
        assert.match(result.stderr, /Node\.js.*22\.23\.4.*24\.22\.1.*26\.12\.1/);
      }
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
