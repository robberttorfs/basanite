// Claude Code wraps pasted text in tags with a random id when it saves a prompt. People never
// typed those, so anything that shows a prompt takes them off first and keeps the text.
'use strict';

const TAG = /\n?<\/?pasted_content(?: id="[^"]*")?>\n?/g;
const unwrapPasted = (text) => String(text ?? '').replace(TAG, '\n').trim();

module.exports = { unwrapPasted };
