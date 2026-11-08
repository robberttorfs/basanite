const test = require('node:test');
const assert = require('node:assert/strict');
const { ChatFeed } = require('../src/main/chat');

const queued = (prompt, extra = {}) => JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command', prompt, commandMode: 'prompt', origin: { kind: 'human' }, delivery_id: `d-${prompt}`, ...extra } });
const you = (f) => f.items.filter((i) => i.k === 'you').map((i) => i.text);

test('clean view: a message sent while Claude works shows, in order', () => {
  const f = new ChatFeed();
  f.ingest(JSON.stringify({ type: 'user', message: { role: 'user', content: 'first' } }));
  f.ingest(JSON.stringify({ type: 'assistant', message: { id: 'a', content: [{ type: 'tool_use', id: 't', name: 'Read', input: {} }] } }));
  f.ingest(queued('second, sent mid-turn'));
  f.ingest(JSON.stringify({ type: 'assistant', message: { id: 'b', content: [{ type: 'text', text: 'reply' }] } }));
  assert.deepEqual(f.items.map((i) => i.k), ['you', 'tool', 'you', 'claude']);
  assert.deepEqual(you(f), ['first', 'second, sent mid-turn']);
});

test('clean view: the same queued message only shows once, with pictures keeping their text', () => {
  const f = new ChatFeed();
  f.ingest(queued('once'));
  f.ingest(queued('once'));
  f.ingest(queued([{ type: 'text', text: 'look at this' }, { type: 'image', source: {} }], { delivery_id: 'x' }));
  assert.deepEqual(you(f), ['once', 'look at this']);
});

test('clean view: queued entries that are not yours stay hidden', () => {
  const f = new ChatFeed();
  f.ingest(queued('automatic', { origin: { kind: 'task-notification' } }));
  f.ingest(queued('! ls', { commandMode: 'bash' }));
  f.ingest(queued('<task-notification>x</task-notification>'));
  f.ingest(JSON.stringify({ type: 'attachment', attachment: { type: 'date', content: 'today' } }));
  f.ingest(JSON.stringify({ type: 'attachment', isSidechain: true, attachment: { type: 'queued_command', prompt: 'sub', commandMode: 'prompt', origin: { kind: 'human' } } }));
  assert.deepEqual(you(f), []);
});
