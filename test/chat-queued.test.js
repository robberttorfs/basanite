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

const op = (operation, content) => JSON.stringify({ type: 'queue-operation', operation, ...(content === undefined ? {} : { content }) });

test('clean view: every queued message waits, in order, until it is delivered', () => {
  const f = new ChatFeed();
  f.ingest(op('enqueue', 'one'));
  f.ingest(op('enqueue', 'two'));
  assert.deepEqual(f.takeWaiting(), ['one', 'two']);
  assert.equal(f.takeWaiting(), null);
  assert.deepEqual(you(f), []);
  f.ingest(op('remove', 'one'));
  f.ingest(queued('one'));
  assert.deepEqual(f.waiting, ['two']);
  assert.deepEqual(you(f), ['one']);
});

test('clean view: dequeue, popAll and notifications keep the queue right', () => {
  const f = new ChatFeed();
  f.ingest(op('enqueue', '<task-notification>x</task-notification>'));
  assert.deepEqual(f.waiting, []);
  f.ingest(op('enqueue', 'a'));
  f.ingest(op('enqueue', 'b'));
  f.ingest(op('enqueue', 'c'));
  f.ingest(op('dequeue'));
  f.ingest(op('popAll', 'b'));
  assert.deepEqual(f.waiting, ['c']);
  f.follow('other.jsonl');
  f.follow('next.jsonl');
  assert.deepEqual(f.waiting, []);
});

test('clean view: a message that arrives as a user line leaves the queue', () => {
  const f = new ChatFeed();
  f.ingest(op('enqueue', 'hello'));
  f.ingest(JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } }));
  assert.deepEqual(f.waiting, []);
  assert.deepEqual(you(f), ['hello']);
});

const sig = (kind) => Buffer.from(`xx${kind}yy`).toString('base64');
const said = (id, block) => JSON.stringify({ type: 'assistant', message: { id, content: [block] } });

test('clean view: progress updates show, real thinking never does', () => {
  const f = new ChatFeed();
  f.ingest(said('a', { type: 'thinking', thinking: '', signature: sig('thinking') }));
  f.ingest(said('a', { type: 'thinking', thinking: 'private reasoning', signature: sig('thinking') }));
  f.ingest(said('a', { type: 'thinking', thinking: 'unsigned', signature: '' }));
  f.ingest(said('a', { type: 'thinking', thinking: 'Checking the tests.', signature: sig('narration') }));
  f.ingest(said('a', { type: 'tool_use', id: 't', name: 'Read', input: {} }));
  f.ingest(said('a', { type: 'thinking', thinking: 'Found it.', signature: sig('narration') }));
  assert.deepEqual(f.items.map((i) => [i.k, i.text]).filter(([k]) => k === 'claude'), [['claude', 'Checking the tests.'], ['claude', 'Found it.']]);
  assert.deepEqual(f.items.map((i) => i.k), ['claude', 'tool', 'claude']);
});
