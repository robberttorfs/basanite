// A small shell-command reader for the mode guards. It splits a command line into
// simple commands (on ; && || | & newlines, $( ) and backticks), each with its
// words and its redirections. Text inside quotes stays inside one word, so a
// quoted pattern like "a > b" or "git push" is an argument, never a command or a
// redirection. Heredoc bodies are kept on the command that opened them.
// Flavours: 'sh' (bash, zsh, sh) and 'ps' (PowerShell, cmd: backslash is a plain
// path character, backtick is the escape).
'use strict';

/**
 * @returns {{ words: { text: string, quoted: boolean }[], redirects: { op: string, target: string|null }[], heredoc: string }[]}
 */
function parse(cmd, flavour = 'sh') {
  const s = String(cmd || '');
  const ps = flavour === 'ps';
  const segs = [];
  let seg = newSeg();
  let word = null; // { text, quoted }
  let pending = null; // 'redirect' | 'heredoc' | 'input'
  let heredocs = []; // { seg, delim } waiting for the next newline
  let i = 0;

  function newSeg() { return { words: [], redirects: [], heredoc: '' }; }
  function startWord() { if (!word) word = { text: '', quoted: false }; }
  function endWord() {
    if (!word) return;
    const w = word; word = null;
    if (pending === 'redirect') { seg.redirects[seg.redirects.length - 1].target = w.text; pending = null; return; }
    if (pending === 'heredoc') { heredocs.push({ seg, delim: w.text }); pending = null; return; }
    if (pending === 'input') { pending = null; return; }
    seg.words.push(w);
  }
  function endSeg() {
    endWord();
    if (pending === 'redirect') pending = null;
    if (seg.words.length || seg.redirects.length || seg.heredoc) segs.push(seg);
    seg = newSeg();
  }
  function readHeredocs() {
    // i points just past a newline: read each waiting body up to its delimiter line.
    for (const h of heredocs) {
      let body = '';
      while (i < s.length) {
        let nl = s.indexOf('\n', i); if (nl < 0) nl = s.length;
        const line = s.slice(i, nl).replace(/\r$/, '');
        i = nl + 1;
        if (line.replace(/^\t+/, '').trim() === h.delim) break;
        body += line + '\n';
      }
      h.seg.heredoc += body;
    }
    heredocs = [];
  }

  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '\n') { endSeg(); i++; if (heredocs.length) readHeredocs(); continue; }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; continue; }
    if (c === '#' && !word) { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === "'") {
      startWord(); word.quoted = true;
      const end = s.indexOf("'", i + 1);
      const stop = end < 0 ? s.length : end;
      word.text += s.slice(i + 1, stop); i = stop + 1; continue;
    }
    if (c === '"') {
      startWord(); word.quoted = true; i++;
      while (i < s.length && s[i] !== '"') {
        if (!ps && s[i] === '\\' && i + 1 < s.length && '$`"\\\n'.includes(s[i + 1])) { word.text += s[i + 1]; i += 2; continue; }
        if (ps && s[i] === '`' && i + 1 < s.length) { word.text += s[i + 1]; i += 2; continue; }
        word.text += s[i++];
      }
      i++; continue;
    }
    if ((!ps && c === '\\') || (ps && c === '`')) {
      startWord();
      if (n === '\n') { i += 2; continue; } // line continuation
      if (n !== undefined) word.text += n;
      i += 2; continue;
    }
    if (!ps && c === '`') { endSeg(); i++; continue; }
    if (c === '$' && n === '(' && s[i + 2] === '(') {
      // Arithmetic $(( ... )): one opaque word, so a > inside is a comparison.
      startWord(); word.quoted = true;
      let depth = 0; let j = i + 1;
      for (; j < s.length; j++) { if (s[j] === '(') depth++; else if (s[j] === ')' && --depth === 0) break; }
      word.text += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '$' && n === '(') { endSeg(); i += 2; continue; }
    if (c === '(' || c === ')') { endSeg(); i++; continue; }
    if (c === ';') { endSeg(); i += (n === ';' ? 2 : 1); continue; }
    if (c === '|') { endSeg(); i += (n === '|' || n === '&' ? 2 : 1); continue; }
    if (c === '&') {
      if (n === '>') { // &> and &>>
        endWord(); const op = s[i + 2] === '>' ? '&>>' : '&>';
        seg.redirects.push({ op, target: null }); pending = 'redirect'; i += op.length; continue;
      }
      endSeg(); i += (n === '&' ? 2 : 1); continue;
    }
    if (c === '>') {
      // A number or * stuck to the front is the stream (2>, *>), not a word.
      if (word && !word.quoted && /^(\d+|\*)$/.test(word.text)) word = null; else endWord();
      if (n === '(') { endSeg(); i += 2; continue; } // >( ... ) process substitution
      let op = '>';
      if (n === '>') op = '>>'; else if (n === '|') op = '>|'; else if (n === '&') op = '>&';
      seg.redirects.push({ op, target: null }); pending = 'redirect'; i += op.length; continue;
    }
    if (c === '<') {
      if (word && !word.quoted && /^\d+$/.test(word.text)) word = null; else endWord();
      if (n === '(') { endSeg(); i += 2; continue; }
      if (n === '<' && s[i + 2] === '<') { pending = 'input'; i += 3; continue; } // here-string
      if (n === '<') { pending = 'heredoc'; i += (s[i + 2] === '-' ? 3 : 2); continue; }
      pending = 'input'; i += (n === '&' ? 2 : 1); continue;
    }
    startWord(); word.text += c; i++;
  }
  endSeg();
  return segs;
}

module.exports = { parse };
