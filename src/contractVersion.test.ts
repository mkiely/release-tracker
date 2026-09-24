import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SYNC_CONTRACT_VERSION } from '@release-tracker/sync-contract';

/**
 * The exported constant and the spec's own `info.version` are two copies of one
 * fact, and they had already drifted — 0.17.0 against a spec at 0.19.0 — because
 * no code reads the constant, so nothing noticed. The version is how a service
 * says which contract it speaks, so a wrong one is worse than none.
 *
 * Read with a regex rather than a YAML parser on purpose: this is our own file,
 * the line is fixed-shape, and a parser would be a dependency bought to check one
 * string.
 */
describe('sync contract version', () => {
  const yaml = readFileSync(
    fileURLToPath(new URL('../packages/sync-contract/openapi.yaml', import.meta.url)),
    'utf8',
  );

  it("matches the spec's info.version", () => {
    const match = yaml.match(/^\s{2}version:\s*(\S+)\s*$/m);
    expect(match, 'openapi.yaml has no info.version line').not.toBeNull();
    expect(SYNC_CONTRACT_VERSION).toBe(match![1]);
  });

  it('is a plain semver triple, since services compare it', () => {
    expect(SYNC_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
