const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const files = require('../src/main/files');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-'));
const png = path.join(dir, 'a chart.png');
fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]));
fs.writeFileSync(path.join(dir, 'notes.xyz'), 'plain words');
fs.writeFileSync(path.join(dir, 'blob.xyz'), Buffer.from([1, 0, 2]));
fs.writeFileSync(path.join(dir, 'page.html'), '<p>hi</p>');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('clean: punctuation, line numbers, relative paths', () => {
  assert.equal(files.clean('`' + png + '`', dir), path.normalize(png));
  assert.equal(files.clean(`${png}:12:3`, dir), path.normalize(png));
  assert.equal(files.clean(`${png}.`, dir), path.normalize(png));
  assert.equal(files.clean('notes.xyz', dir), path.join(dir, 'notes.xyz'));
  assert.equal(files.clean('notes.xyz', null), null);
  assert.equal(files.clean('', dir), null);
});

test('clean: Git Bash and WSL paths on Windows', { skip: process.platform !== 'win32' }, () => {
  assert.equal(files.clean('/c/Users/x/a.png', null, 'win32'), 'C:\\Users\\x\\a.png');
  assert.equal(files.clean('/mnt/e/a.png', null, 'win32'), 'E:\\a.png');
});

test('info: kinds, sniffing text, folders are not files', () => {
  assert.equal(files.info(png).kind, 'image');
  assert.equal(files.info(path.join(dir, 'notes.xyz')).kind, 'text');
  assert.equal(files.info(path.join(dir, 'blob.xyz')).kind, 'other');
  assert.equal(files.info(dir), null);
  assert.equal(files.info(path.join(dir, 'gone.png')), null);
});

test('only resolved files are served; a page also gets its folder', () => {
  const other = path.join(dir, 'notes.xyz');
  assert.equal(files.allowed(other), false);
  files.allow(files.info(png));
  assert.equal(files.allowed(png), true);
  assert.equal(files.allowed(other), false);
  files.allow(files.info(path.join(dir, 'page.html')));
  assert.equal(files.allowed(other), true);
  assert.equal(files.allowed(path.join(path.dirname(dir), 'secret.txt')), false);
});

test('viewer urls round trip, spaces included', () => {
  const u = files.urlFor(png, 123);
  assert.match(u, /^basanite-file:\/\/local\//);
  assert.equal(files.fileFor(u), path.normalize(png));
  assert.equal(files.fileFor('https://example.com/a.png'), null);
});

test('file list: newest first, one row per file, pictures read count, others do not', () => {
  const l = new files.FileList();
  l.fromTools([{ name: 'Write', input: { file_path: png }, at: 1 }, { name: 'Read', input: { file_path: path.join(dir, 'x.js') }, at: 2 }]);
  assert.equal(l.size, 1);
  l.fromTools([{ name: 'Edit', input: { file_path: png }, at: 3 }]);
  assert.equal(l.size, 1);
  assert.equal(l.list()[0].verb, 'Edited');
  l.fromTools([{ name: 'Read', input: { file_path: path.join(dir, 'gone.png') }, at: 4 }]);
  assert.equal(l.list().length, 1, 'missing files drop out');
});

test('pathsIn finds pictures and pages in a reply, not code files', () => {
  assert.deepEqual(files.pathsIn('Saved to C:\\Users\\x\\shot.png.', 'win32'), ['C:\\Users\\x\\shot.png']);
  assert.deepEqual(files.pathsIn('see /Users/x/a.md and /Users/x/b.js', 'darwin'), ['/Users/x/a.md']);
  assert.deepEqual(files.pathsIn('no paths https://a.com/b.png here', 'darwin'), []);
});
