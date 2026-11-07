const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { unwrapPasted } = require('../src/shared/pasted');
const { ChatFeed } = require('../src/main/chat');
const { readLog } = require('../src/main/log');

const paste = '<pasted_content id="b8c7">\nline one\nline two\n</pasted_content id="b8c7">';
const transcript = (...contents) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-paste-')), 't.jsonl');
  for (const content of contents) fs.appendFileSync(f, JSON.stringify({ type: 'user', message: { content } }) + '\n');
  return f;
};

test('pasted: the tags go, the text stays', () => {
  assert.equal(unwrapPasted(paste), 'line one\nline two');
  assert.equal(unwrapPasted(`typed first\n\n${paste}`), 'typed first\n\nline one\nline two');
  assert.equal(unwrapPasted('a <b> tag stays'), 'a <b> tag stays');
});

test('pasted: the clean view shows pasted text without tags, even a message that is only a paste', () => {
  const feed = new ChatFeed();
  feed.follow(transcript(paste, `look\n\n${paste}`));
  assert.deepEqual(feed.poll().map((i) => i.text), ['line one\nline two', 'look\n\nline one\nline two']);
});

test('pasted: a session log keeps a message that is only a paste', () => {
  const log = readLog(transcript(paste), 4);
  assert.ok(log.includes('USER: line one'), log);
  assert.ok(!log.includes('pasted_content'), log);
});
