// hangarctl answer: picks an option in a question card or in Claude Code's own
// menu in the terminal (a permission prompt), the way the user would.
'use strict';

/**
 * What answering `choice` means for a tile whose held question is `question` (or null):
 *   { picks, text }  a held card with one question: pick that option
 *   { words }        a held card answered in words (as hangarctl send does)
 *   { key, text }    a terminal menu: press this one key, with no Enter after it
 * Throws when the choice can't be used.
 */
function plan(question, choice) {
  const c = String(choice ?? '').trim();
  if (!c) throw new Error('Give a choice: its number, or esc.');
  const qs = question?.questions;
  if (Array.isArray(qs) && qs.length) {
    if (qs.length === 1) {
      const opts = qs[0].options;
      let o = null;
      if (/^\d+$/.test(c)) {
        o = opts[Number(c) - 1];
        if (!o) throw new Error(`There is no option ${c}; it has ${opts.length}.`);
      } else {
        o = opts.find((x) => x.label.toLowerCase() === c.toLowerCase()) || null;
      }
      if (o) return { picks: [{ labels: [o.label], other: '', skipped: false }], text: o.label };
    }
    return { words: c };
  }
  if (/^esc$/i.test(c)) return { key: '\x1b', text: 'Esc' };
  if (/^[1-9]$/.test(c)) return { key: c, text: c };
  throw new Error('A menu in the terminal takes its number (1-9) or esc.');
}

module.exports = { plan };
