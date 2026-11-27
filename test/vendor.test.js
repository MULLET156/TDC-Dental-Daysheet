'use strict';
// CONTRACT §7: vendor/opendental-core is a copy of a released version and is never edited.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dir = path.join(__dirname, '..', 'vendor', 'opendental-core');
test('vendored core matches its CHECKSUMS', () => {
  assert.match(fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim(), /^\d+\.\d+\.\d+/);
  const lines = fs.readFileSync(path.join(dir, 'CHECKSUMS'), 'utf8').trim().split(/\r?\n/);
  assert.ok(lines.length > 3);
  for (const l of lines) {
    const [sum, name] = l.split(/\s+/);
    const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
    assert.strictEqual(got, sum, `${name} was changed; re-run node scripts/sync-core.js instead of editing it`);
  }
});

test('zero dependencies', () => {
  const pkg = require('../package.json');
  assert.ok(!pkg.dependencies && !pkg.devDependencies);
});
