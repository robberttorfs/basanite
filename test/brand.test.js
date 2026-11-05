// The product name and ids come from brand.js; package.json must agree with it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const brand = require('../src/shared/brand');
const pkg = require('../package.json');

test('brand: package.json name, productName and appId match brand.js', () => {
  assert.equal(pkg.name, brand.slug);
  assert.equal(pkg.productName, brand.name);
  assert.equal(pkg.build.productName, brand.name);
  assert.equal(pkg.build.appId, brand.appId, 'Windows notifications use brand.appId as the AppUserModelId');
});

test('build: the mac zip target exists so latest-mac.yml is written', () => {
  const targets = pkg.build.mac.target.map((t) => t.target);
  assert.ok(targets.includes('zip'));
  assert.ok(targets.includes('dmg'));
});
