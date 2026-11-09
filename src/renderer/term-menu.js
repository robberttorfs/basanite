/* exported HangarTermMenu */
'use strict';

// A held question in the terminal view, drawn the way Claude Code draws its own
// menu. Claude Code can't draw it itself: once its menu is up, the question can
// no longer be answered from the clean view. So a small second terminal sits over
// the real one, on the same character grid, and shares its answers with the card.

const HangarTermMenu = (() => {
  // Claude Code's own colours, read from its menu cell by cell (2.1.319).
  const ACCENT = '#b1b9f9', GREY = '#999999', RULE = '#888888', GREEN = '#4eba65', AMBER = '#ffc107';
  const CHAT_ANSWER = '(The user wants to talk about this before answering. Ask what they would like to clarify.)';
  const PREVIEW_COL = 34, PREVIEW_MIN = 40;

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(';');
  const paint = (text, { fg, bg, bold, italic, dim } = {}) => {
    if (!text) return '';
    const on = [bold && '1', dim && '2', italic && '3', fg && `38;2;${rgb(fg)}`, bg && `48;2;${rgb(bg)}`].filter(Boolean).join(';');
    return on ? `\x1b[${on}m${text}\x1b[0m` : text;
  };
  const grey = (t) => paint(t, { fg: GREY });
  const accent = (t, bold) => paint(t, { fg: ACCENT, bold });
  const green = (t) => paint(t, { fg: GREEN });

  function wrap(text, width) {
    const w = Math.max(8, width);
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (let word of para.split(' ')) {
        while (word.length > w) {
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, w));
          word = word.slice(w);
        }
        if (line && line.length + 1 + word.length > w) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
      }
      out.push(line);
    }
    return out;
  }

  /** What is on one tab, top to bottom: option numbers, then the fixed rows. */
  function rowsOf(q) {
    const list = q.options.map((_, i) => i);
    if (!isPreview(q)) list.push('type');
    if (q.multiSelect) list.push('next');
    list.push('chat');
    return list;
  }
  const isPreview = (q) => !q.multiSelect && q.options.some((o) => o.preview);
  const answered = (p) => p.skipped || p.labels.size > 0 || !!p.other.trim();

  function newModel(questions, picks, tab = 0) {
    return { questions, picks, tab, rows: questions.map(() => 0), reviewRow: 0, drafts: questions.map((_, i) => picks[i].other), caret: picks[Math.min(tab, picks.length - 1)].other.length, notes: questions.map(() => ''), editingNote: false };
  }

  function tabsLine(m, cols) {
    const n = m.questions.length;
    const seg = (text, on) => (on ? paint(` ${text} `, { fg: '#000000', bg: ACCENT }) : ` ${text} `);
    const title = (i) => `${answered(m.picks[i]) ? '☒' : '☐'} ${m.questions[i].header || `Q${i + 1}`}`;
    if (n === 1) return seg(title(0), true);
    const parts = m.questions.map((_, i) => ({ text: title(i), on: m.tab === i }));
    parts.push({ text: '✔ Submit', on: m.tab === n });
    let first = 0;
    const width = () => parts.slice(first).reduce((a, p) => a + p.text.length + 2, 4);
    while (width() > cols && first < m.tab) first++;
    return `${m.tab === 0 ? grey('←') : '←'} ${parts.slice(first).map((p) => seg(p.text, p.on)).join('')} ${m.tab === n ? grey('→') : '→'}`;
  }

  /** The text on the type-your-own row: what is typed, or the grey prompt. */
  function typedText(m, focused, full) {
    const text = m.drafts[m.tab];
    if (text) return text;
    const hint = full ? 'Type something.' : 'Type something';
    return focused ? paint(hint, { dim: true }) : grey(hint);
  }

  function optionRows(m, q, cols, out, cursor) {
    const p = m.picks[m.tab];
    const at = rowsOf(q)[m.rows[m.tab]];
    const marker = (on) => (on ? `${accent('❯')} ` : '  ');
    const multi = q.multiSelect;
    q.options.forEach((o, i) => {
      const on = at === i;
      const picked = p.labels.has(o.label);
      const box = multi ? `${picked ? green('[✔]') : '[ ]'} ` : '';
      const pad = multi ? 9 : 5;
      const words = wrap(o.label, cols - pad);
      const look = (t) => (on ? accent(t) : t);
      const label = !multi && picked ? `${words.map((w) => green(w)).join('')} ${green('✔')}` : look(words[0]);
      out.push(`${marker(on)}${grey(`${i + 1}. `)}${box}${label}`);
      for (const w of (!multi && picked ? [] : words.slice(1))) out.push(`${' '.repeat(pad)}${look(w)}`);
      if (o.description) for (const d of wrap(o.description, cols - pad)) out.push(`${' '.repeat(pad)}${grey(d)}`);
    });
    const n = q.options.length;
    const on = at === 'type';
    const hasText = !!m.drafts[m.tab].trim();
    const box = multi ? `${p.other.trim() || hasText ? green('[✔]') : '[ ]'} ` : '';
    const text = typedText(m, on, !multi);
    const chosen = !multi && p.other.trim() && p.other === m.drafts[m.tab];
    out.push(`${marker(on)}${grey(`${n + 1}.`)} ${box}${chosen ? `${green(text)} ${green('✔')}` : text}`);
    if (on) cursor.at = { x: 2 + `${n + 1}. `.length + (multi ? 4 : 0) + m.caret, y: out.length - 1 };
    if (multi) {
      const last = m.tab === m.questions.length - 1;
      const word = last ? 'Submit' : 'Next';
      out.push(at === 'next' ? `${accent('❯')}    ${accent(word, true)}` : `     ${paint(word, { bold: true })}`);
    }
    return n + 2;
  }

  function previewRows(m, q, cols, out, cursor) {
    const at = rowsOf(q)[m.rows[m.tab]];
    const p = m.picks[m.tab];
    const longest = Math.max(...q.options.map((o) => o.label.length));
    const left = Math.max(PREVIEW_COL, longest + 11);
    const shown = typeof at === 'number' ? q.options[at].preview : '';
    const room = Math.max(PREVIEW_MIN, cols - left - 4);
    const body = shown ? shown.split('\n').map((l) => l.slice(0, room)) : [];
    const inner = Math.min(room, Math.max(PREVIEW_MIN, ...body.map((l) => l.length)));
    const right = shown ? [
      grey(`┌${'─'.repeat(inner + 2)}┐`),
      ...body.map((l) => `${grey('│')} ${l}${' '.repeat(inner - l.length)} ${grey('│')}`),
      grey(`└${'─'.repeat(inner + 2)}┘`),
    ] : [];
    const noteRow = right.length + 1;
    const lines = Math.max(q.options.length, shown ? noteRow + 2 : 0);
    for (let y = 0; y < lines; y++) {
      const o = q.options[y];
      let start = ' '.repeat(left);
      if (o) {
        const on = at === y;
        const picked = p.labels.has(o.label);
        const name = picked ? `${green(o.label)} ${green('✔')}` : on ? accent(o.label, true) : o.label;
        start = `${on ? accent('❯') : ' '} ${grey(`${y + 1}.`)} ${name}${' '.repeat(Math.max(0, left - (5 + o.label.length + (picked ? 2 : 0))))}`;
      }
      if (shown && y === noteRow) {
        const note = m.notes[m.tab];
        const words = note || m.editingNote ? note : paint('press n to add notes', { fg: GREY, italic: true });
        out.push(`${start}${accent('Notes:')} ${words}`);
        if (m.editingNote) cursor.at = { x: left + 7 + note.length, y: out.length - 1 };
      } else out.push(`${start}${right[y] || ''}`.replace(/ +$/, ''));
    }
    return 0;
  }

  function review(m, out) {
    const missing = m.picks.some((p) => !answered(p));
    out.push(paint('Review your answers', titleLook(m)), '');
    if (missing) out.push(`${paint('⚠', { fg: AMBER })} ${paint('You have not answered all questions', { fg: AMBER })}`, '');
    m.questions.forEach((q, i) => {
      const p = m.picks[i];
      if (!answered(p) || p.skipped) return;
      const parts = q.options.filter((o) => p.labels.has(o.label)).map((o) => o.label);
      if (p.other.trim()) parts.push(p.other.trim());
      out.push(` ● ${q.question}`, `   ${green(`→ ${parts.join(', ')}`)}`);
    });
    out.push('', grey('Ready to submit your answers?'), '');
    ['Submit answers', 'Cancel'].forEach((t, i) => {
      const on = m.reviewRow === i;
      out.push(`${on ? `${accent('❯')} ` : '  '}${grey(`${i + 1}. `)}${on ? accent(t) : t}`);
    });
  }

  const titleLook = (m) => ({ fg: m.darkBg === false ? undefined : '#ffffff', bold: true });

  function footer(m, q) {
    const preview = isPreview(q);
    if (preview) return `Enter to select · ↑/↓ to navigate · n to add notes · Tab to switch questions · Esc to cancel`;
    if (m.questions.length === 1) return 'Enter to select · ↑/↓ to navigate · Esc to cancel';
    return 'Enter to select · Tab/Arrow keys to navigate · Esc to cancel';
  }

  function sessionRule(cols, title) {
    if (!title) return paint('─'.repeat(cols), { fg: RULE });
    return `${paint('─'.repeat(Math.max(0, cols - title.length - 3)), { fg: RULE })} ${paint(title, { fg: RULE })} ${paint('─', { fg: RULE })}`;
  }

  /** The whole menu as lines of terminal text, and where the text cursor goes, if anywhere. */
  function frame(m, cols, title) {
    const out = [grey('─'.repeat(cols)), tabsLine(m, cols), ''];
    const cursor = { at: null };
    if (m.tab === m.questions.length) review(m, out);
    else {
      const q = m.questions[m.tab];
      for (const l of wrap(q.question, cols)) out.push(paint(l, titleLook(m)));
      out.push('');
      const number = isPreview(q) ? previewRows(m, q, cols, out, cursor) : optionRows(m, q, cols, out, cursor);
      out.push(grey('─'.repeat(cols)));
      const on = rowsOf(q)[m.rows[m.tab]] === 'chat';
      const word = `${number ? `${number}. ` : ''}Chat about this`;
      out.push(on ? `${accent('❯')} ${accent(word)}` : `  ${word}`);
      out.push('', grey(footer(m, q).slice(0, cols)));
    }
    out.push(sessionRule(cols, title));
    return { lines: out, cursor: cursor.at };
  }

  /** Applies keys to the model. Returns what the caller must do: 'send', 'stop', 'draw' or ''. */
  function press(m, data, settled = true) {
    if (data.startsWith('\x1b[200~')) data = data.replace(/\x1b\[20[01]~/g, '').replace(/[\r\n]+/g, ' ');
    const n = m.questions.length;
    const q = m.questions[m.tab];
    const p = m.picks[m.tab];

    if (data === '\x03' || (data === '\x1b' && !m.editingNote)) return 'stop';

    const goTab = (i) => {
      m.tab = Math.max(0, Math.min(n, i));
      if (m.tab < n) m.caret = m.drafts[m.tab].length;
      return 'draw';
    };
    if (m.editingNote) {
      const note = m.notes[m.tab];
      if (data === '\r' || data === '\x1b') m.editingNote = false;
      else if (data === '\x7f' || data === '\b') m.notes[m.tab] = note.slice(0, -1);
      else if (data >= ' ' && !data.startsWith('\x1b')) m.notes[m.tab] = note + data;
      else return '';
      return 'draw';
    }
    // On the Chat row and in typed text, Claude Code's menu stays on its tab.
    const pinned = m.tab < n && (rowsOf(q)[m.rows[m.tab]] === 'chat' || (rowsOf(q)[m.rows[m.tab]] === 'type' && !!m.drafts[m.tab]));
    if (data === '\t') return pinned ? '' : goTab(m.tab + 1);
    if (data === '\x1b[Z') return pinned ? '' : goTab(m.tab - 1);

    if (m.tab === n) {
      if (data === '\x1b[D') return goTab(m.tab - 1);
      if (data === '\x1b[A') { m.reviewRow = 0; return 'draw'; }
      if (data === '\x1b[B') { m.reviewRow = 1; return 'draw'; }
      const choice = data === '\r' ? m.reviewRow : data === '1' ? 0 : data === '2' ? 1 : -1;
      if (choice < 0 || !settled) return '';
      return choice === 0 ? finish(m) : 'stop';
    }

    const rows = rowsOf(q);
    const kind = rows[m.rows[m.tab]];
    const next = () => {
      if (n === 1) return finish(m);
      return goTab(m.tab + 1);
    };

    /** Picks an option on a one-choice question, or ticks one on a many-choice one. */
    const choose = (i) => {
      const label = q.options[i].label;
      p.skipped = false;
      if (q.multiSelect) {
        if (p.labels.has(label)) p.labels.delete(label); else p.labels.add(label);
        return 'draw';
      }
      const note = m.notes[m.tab].trim();
      p.labels = new Set(note ? [] : [label]);
      p.other = note ? `${label}. Notes: ${note}` : '';
      m.drafts[m.tab] = p.other && !note ? p.other : '';
      return next();
    };

    if (kind === 'type') {
      const text = m.drafts[m.tab];
      if (data === '\x7f' || data === '\b') {
        if (m.caret > 0) { m.drafts[m.tab] = text.slice(0, m.caret - 1) + text.slice(m.caret); m.caret--; }
        return 'draw';
      }
      if (text && data === '\x1b[D') { m.caret = Math.max(0, m.caret - 1); return 'draw'; }
      if (text && data === '\x1b[C') { m.caret = Math.min(text.length, m.caret + 1); return 'draw'; }
      if (data.length >= 1 && data[0] >= ' ' && data !== '\x7f' && !data.startsWith('\x1b')) {
        m.drafts[m.tab] = text.slice(0, m.caret) + data + text.slice(m.caret);
        m.caret += data.length;
        return 'draw';
      }
    }

    switch (data) {
      case '\x1b[A': m.rows[m.tab] = m.rows[m.tab] > 0 ? m.rows[m.tab] - 1 : rows.length - 2; break;
      case '\x1b[B': m.rows[m.tab] = Math.min(rows.length - 1, m.rows[m.tab] + 1); break;
      case '\x1b[C': return kind === 'chat' ? '' : goTab(m.tab + 1);
      case '\x1b[D': return kind === 'chat' ? '' : goTab(m.tab - 1);
      case ' ':
        if (q.multiSelect && typeof kind === 'number') return settled ? choose(kind) : '';
        return '';
      case 'n':
        if (isPreview(q) && typeof kind === 'number') { m.editingNote = true; return 'draw'; }
        return '';
      case '\r':
        if (!settled) return '';
        if (typeof kind === 'number') return choose(kind);
        if (kind === 'next') return next();
        if (kind === 'chat') return chat(m);
        if (kind === 'type') {
          const text = m.drafts[m.tab].trim();
          if (!text) return '';
          p.other = text;
          p.skipped = false;
          if (q.multiSelect) return 'draw';
          p.labels = new Set();
          return next();
        }
        return '';
      default: {
        if (!/^[1-9]$/.test(data) || !settled) return '';
        const i = Number(data) - 1;
        if (i < q.options.length) {
          if (!q.multiSelect) m.rows[m.tab] = i;
          return choose(i);
        }
        const fixed = rows.filter((r) => r !== 'next').filter((r) => typeof r !== 'number');
        const target = isPreview(q) ? undefined : fixed[i - q.options.length];
        if (target === undefined) return '';
        m.rows[m.tab] = rows.indexOf(target);
        if (target === 'chat') return chat(m);
        m.caret = m.drafts[m.tab].length;
      }
    }
    return 'draw';
  }

  /** Anything left unanswered goes as skipped, as the card's Skip does. */
  function finish(m) {
    m.picks.forEach((p) => { if (!answered(p)) p.skipped = true; });
    return 'send';
  }

  function chat(m) {
    m.picks.forEach((p) => { if (!answered(p)) { p.labels = new Set(); p.other = CHAT_ANSWER; p.skipped = false; } });
    return 'send';
  }

  const SPINNER = /^\S\s?\S*…|PreToolUse hook/;

  /** One tile's menu. card() gives the question card (see ask.js), which holds the answers. */
  function create({ host, main, card }) {
    const box = document.createElement('div');
    box.className = 'term-menu';
    box.hidden = true;
    let term = null, model = null, id = null, title = '', watch = [], placed = '';

    const line = (y) => main.buffer.active.getLine(main.buffer.active.viewportY + y)?.translateToString(true) || '';

    /** Where Claude Code's menu would start: on the working line, or the rule above the prompt. */
    function startRow(height) {
      let start = main.rows - height;
      for (let y = main.rows - 1; y > 0; y--) {
        if (!line(y).startsWith('❯') || !/^─{3,}/.test(line(y - 1))) continue;
        const rule = line(y - 1);
        title = /─ (.+?) ─$/.exec(rule)?.[1] || '';
        start = y - 1;
        for (let up = 1; up <= 4 && y - 1 - up >= 0; up++) if (SPINNER.test(line(y - 1 - up))) { start = y - 1 - up; break; }
        if (start > 0 && !line(start - 1).trim()) start--; // Claude Code leaves no gap above its menu
        break;
      }
      return Math.max(0, Math.min(start, main.rows - height));
    }

    function draw() {
      if (!term || !model) return;
      const b = main.buffer.active;
      model.darkBg = !isLight(main.options.theme?.background);
      let f = frame(model, main.cols, title);
      const start = startRow(f.lines.length);
      f = frame(model, main.cols, title); // the title is only known once the prompt was found
      const rows = Math.max(1, main.rows - start);
      const lines = f.lines.slice(-rows);
      const screen = main.element.querySelector('.xterm-screen');
      const r = screen.getBoundingClientRect(), h = host.getBoundingClientRect();
      const cell = r.height / main.rows;
      const place = `${r.left - h.left}|${r.top - h.top + start * cell}|${r.width}|${rows * cell}`;
      if (place !== placed) {
        placed = place;
        const [left, top, width, height] = place.split('|');
        Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      }
      if (term.cols !== main.cols || term.rows !== rows) term.resize(main.cols, rows);
      const offset = f.lines.length - lines.length;
      const c = f.cursor && f.cursor.y >= offset ? `\x1b[${f.cursor.y - offset + 1};${f.cursor.x + 1}H\x1b[?25h` : '\x1b[?25l';
      const out = `\x1b[?25l\x1b[H${lines.map((l) => `${l}\x1b[K`).join('\r\n')}\x1b[J${c}`;
      term.write(out, () => { if (term) box.hidden = b.viewportY !== b.baseY; });
    }

    function isLight(hex) {
      if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return false;
      const [r, g, b] = rgb(hex).split(';').map(Number);
      return (r * 299 + g * 587 + b * 114) / 1000 > 128;
    }

    function open(question) {
      const c = card();
      const s = c?.state();
      if (!s || s.id !== question.id) return close();
      if (id === question.id && term) return draw();
      close();
      id = question.id;
      model = newModel(s.questions, s.picks, s.at);
      host.appendChild(box);
      const { cols: _c, rows: _r, linkHandler: _l, ...look } = main.options;
      term = new Terminal({ ...look, cols: main.cols, rows: 4, scrollback: 0, allowProposedApi: true, cursorBlink: false });
      term.loadAddon(new Unicode11Addon.Unicode11Addon());
      term.unicode.activeVersion = '11';
      term.open(box);
      try { const gl = new WebglAddon.WebglAddon(); gl.onContextLoss(() => gl.dispose()); term.loadAddon(gl); } catch {}
      term.onData(key);
      const again = () => requestAnimationFrame(draw);
      watch = [main.onWriteParsed(again), main.onScroll(again), main.onResize(again)];
      main.textarea?.addEventListener('focus', handBack);
      draw();
    }

    function hand() { if (term) term.focus(); }
    /** Keyboard stays on the menu: the real terminal hands it over once its own focus has settled. */
    function handBack() { setTimeout(hand, 0); }

    function close() {
      watch.forEach((d) => d.dispose());
      watch = [];
      main.textarea?.removeEventListener('focus', handBack);
      term?.dispose();
      term = null;
      model = null;
      id = null;
      placed = '';
      box.hidden = true;
      box.remove();
    }

    function key(data) {
      const c = card();
      if (!model || !c?.active()) return;
      const did = press(model, data, c.settled());
      if (model.tab < model.questions.length) c.setAt(model.tab);
      if (did === 'send') c.send();
      else if (did === 'stop') c.stop();
      else if (did === 'draw') draw();
    }

    return { open, close, key, active: () => !!term, focus: hand };
  }

  return { create, frame, press, newModel, rowsOf };
})();

if (typeof module !== 'undefined') module.exports = HangarTermMenu;
