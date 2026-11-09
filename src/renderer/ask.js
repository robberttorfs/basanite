/* exported HangarAsk */
'use strict';

// The question card: Claude's AskUserQuestion, answered in the clean view. Sits
// where the message box sits, so what Claude said just before stays readable.
// One click answers a one-choice question; number keys, arrows and Enter do too,
// and typing anything goes straight into Other.

const HangarAsk = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RECOMMENDED = /\s*\(recommended\)\s*$/i;
  const SETTLE_MS = 350; // a key or click meant for what was there before must not pick an answer
  const ICON = {
    stop: '<svg viewBox="0 0 16 16"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/></svg>',
    fold: '<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>',
    tick: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  };

  function create({ submit, stop, md }) {
    const el = document.createElement('div');
    el.className = 'qc';
    el.hidden = true;
    el.setAttribute('role', 'group');
    let q = null;        // { id, questions }
    let at = 0;          // the question on show
    let picks = [];      // per question: { labels: Set, other, skipped }
    let readyAt = 0;
    let folded = false;
    let sending = false;
    let previewOf = -1;

    const answered = (i) => { const p = picks[i]; return p.skipped || p.labels.size > 0 || !!p.other.trim(); };
    const cur = () => q.questions[at];
    const settled = () => Date.now() >= readyAt;
    const $ = (s) => el.querySelector(s);
    const opts = () => [...el.querySelectorAll('.qc-opt')];
    const otherBox = () => $('.qc-other textarea');

    /** The next other question without an answer, going round from this one; -1 when there is none. */
    function nextOpen() {
      for (let k = 1; k < picks.length; k++) {
        const i = (at + k) % picks.length;
        if (!answered(i)) return i;
      }
      return -1;
    }

    function draw() {
      const list = q.questions;
      const c = cur();
      const tabs = list.length > 1
        ? `<div class="qc-tabs" role="tablist">${list.map((x, i) => `<button type="button" class="qc-tab" role="tab" data-step="${i}" title="${esc(x.question)}"><span class="qc-tick">${ICON.tick}</span><span>${esc(x.header || `${i + 1}`)}</span></button>`).join('')}</div>`
        : (c.header ? `<span class="qc-tag">${esc(c.header)}</span>` : '');
      const options = c.options.map((o, i) => {
        const rec = RECOMMENDED.test(o.label);
        return `<button type="button" class="qc-opt" data-opt="${i}" role="${c.multiSelect ? 'checkbox' : 'radio'}">` +
          `<span class="qc-key">${i + 1}</span><span class="qc-txt"><span class="qc-label">${esc(o.label.replace(RECOMMENDED, ''))}${rec ? '<em>Recommended</em>' : ''}</span>` +
          `${o.description ? `<span class="qc-desc">${esc(o.description)}</span>` : ''}</span>` +
          `<span class="qc-mark${c.multiSelect ? ' sq' : ''}">${ICON.tick}</span></button>`;
      }).join('');
      el.innerHTML = `<div class="qc-head">${tabs}<span class="qc-title">${esc(c.question.replace(/\*\*|`/g, ''))}</span><span class="grow"></span>
          <button type="button" class="qc-icon" data-act="stop" title="Stop (Esc)" aria-label="Stop">${ICON.stop}</button>
          <button type="button" class="qc-icon qc-fold" data-act="fold" aria-label="Fold">${ICON.fold}</button></div>
        <div class="qc-main">
          <div class="qc-q">${md(c.question)}</div>
          <div class="qc-body">
            <div class="qc-opts" role="${c.multiSelect ? 'group' : 'radiogroup'}">${options}
              <label class="qc-other"><span class="qc-key">${c.options.length + 1}</span><textarea rows="1" placeholder="Other" aria-label="Other"></textarea><span class="qc-mark${c.multiSelect ? ' sq' : ''}">${ICON.tick}</span></label>
            </div>
            <pre class="qc-preview" hidden></pre>
          </div>
        </div>
        <div class="qc-foot"><button type="button" class="qc-link" data-act="skip">Skip</button>
          <button type="button" class="qc-link qc-skipall" data-act="skipall">Skip all</button><span class="grow"></span>
          <button type="button" class="qc-go" data-act="go"></button></div>`;
      otherBox().value = picks[at].other;
      growOther();
      const first = c.options.findIndex((o) => picks[at].labels.has(o.label));
      previewOf = first >= 0 ? first : c.options.findIndex((o) => o.preview);
      sync();
    }

    /** Everything that changes without rebuilding, so focus and typing are left alone. */
    function sync() {
      const c = cur();
      const p = picks[at];
      el.classList.toggle('folded', folded);
      $('.qc-fold').title = folded ? 'Unfold' : 'Fold';
      el.querySelectorAll('.qc-tab').forEach((t, i) => {
        t.classList.toggle('on', i === at);
        t.classList.toggle('done', answered(i));
        t.setAttribute('aria-selected', String(i === at));
      });
      opts().forEach((b, i) => {
        const on = p.labels.has(c.options[i].label);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      $('.qc-other').classList.toggle('on', !!p.other.trim());
      $('.qc-skipall').hidden = q.questions.length < 2;
      const go = $('.qc-go');
      const typed = !!p.other.trim();
      go.hidden = q.questions.length < 2 && !c.multiSelect && !typed;
      go.disabled = !answered(at);
      go.textContent = nextOpen() >= 0 ? 'Next' : 'Send';
      const pre = $('.qc-preview');
      const text = c.options[previewOf]?.preview || '';
      pre.hidden = !text;
      pre.textContent = text;
    }

    function growOther() {
      const b = otherBox();
      b.style.height = 'auto';
      b.style.height = `${Math.min(b.scrollHeight, 120)}px`;
    }

    function step(i) {
      if (i < 0 || i >= q.questions.length) return;
      at = i;
      draw();
      focus();
    }

    function send() {
      if (sending) return;
      sending = true;
      const hadFocus = el.contains(document.activeElement);
      el.hidden = true;
      const sentId = q.id;
      const out = q.questions.map((_, i) => ({ labels: [...picks[i].labels], other: picks[i].other.trim(), skipped: picks[i].skipped }));
      Promise.resolve(submit(sentId, out)).then((ok) => {
        // Refused and still open: the card comes back as it was.
        if (!ok && q?.id === sentId) { sending = false; el.hidden = false; onShown(false); focus(); }
      });
      onShown(hadFocus);
    }

    /** Moves on: to the next open question, or sends once all have an answer. */
    function advance() {
      const n = nextOpen();
      if (n >= 0) step(n); else send();
    }

    function pick(i) {
      if (!settled()) return;
      const c = cur();
      const p = picks[at];
      const label = c.options[i]?.label;
      if (label === undefined) return;
      p.skipped = false;
      if (c.multiSelect) {
        if (p.labels.has(label)) p.labels.delete(label); else p.labels.add(label);
        previewOf = i;
        sync();
        return;
      }
      p.labels = new Set([label]);
      p.other = '';
      otherBox().value = '';
      growOther();
      previewOf = i;
      sync();
      // One question: done. Several: on to the next, and the last one waits on Send, so a slip can be fixed.
      if (q.questions.length === 1) return send();
      const n = nextOpen();
      if (n >= 0) step(n); else $('.qc-go').focus();
    }

    function skip(all) {
      if (!settled()) return;
      const clear = (p) => { p.labels = new Set(); p.other = ''; p.skipped = true; };
      if (all) picks.forEach((p, i) => { if (!answered(i)) clear(p); });
      else clear(picks[at]);
      advance();
    }

    el.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-opt]');
      if (opt) return pick(Number(opt.dataset.opt));
      const tab = e.target.closest('[data-step]');
      if (tab) return step(Number(tab.dataset.step));
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'stop') stop();
      else if (act === 'fold') { folded = !folded; sync(); focus(); }
      else if (act === 'skip') skip(false);
      else if (act === 'skipall') skip(true);
      else if (act === 'go' && answered(at) && settled()) advance();
    });

    el.addEventListener('input', (e) => {
      if (!e.target.matches('.qc-other textarea')) return;
      const p = picks[at];
      p.other = e.target.value;
      p.skipped = false;
      if (!cur().multiSelect && p.other.trim()) p.labels = new Set();
      growOther();
      sync();
    });

    const showPreview = (e) => {
      const o = e.target.closest?.('[data-opt]');
      if (!o || Number(o.dataset.opt) === previewOf) return;
      previewOf = Number(o.dataset.opt);
      sync();
    };
    el.addEventListener('mouseover', showPreview);
    el.addEventListener('focusin', showPreview);

    /** Up and down walk the options and Other. */
    function walk(dir) {
      const list = [...opts(), otherBox()];
      const i = list.indexOf(document.activeElement);
      const to = list[i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + dir))];
      to?.focus();
    }

    el.addEventListener('keydown', (e) => {
      if (e.isComposing || folded) {
        if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); stop(); }
        return;
      }
      const typing = e.target.matches?.('.qc-other textarea');
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (answered(at) && settled()) advance();
        return;
      }
      if (typing) {
        const box = e.target;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (picks[at].other.trim() && settled()) advance();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          opts()[opts().length - 1]?.focus();
        } else if (e.key === 'ArrowUp' && box.selectionStart === 0) {
          e.preventDefault();
          walk(-1);
        } else if (e.key === 'ArrowDown' && box.selectionEnd === box.value.length) {
          // Nothing below it: stays put.
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); return; }
      // Enter picks the option in focus; with several allowed (Space or a number ticks) it moves on once one is ticked.
      if (e.key === 'Enter' && e.target.matches?.('.qc-opt')) {
        e.preventDefault();
        if (!cur().multiSelect || !answered(at)) pick(Number(e.target.dataset.opt));
        else if (settled()) advance();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); walk(e.key === 'ArrowDown' ? 1 : -1); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(at + (e.key === 'ArrowRight' ? 1 : -1)); return; }
      if (/^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        e.preventDefault();
        if (n < cur().options.length) { pick(n); return; }
        if (n === cur().options.length) otherBox().focus();
        return;
      }
      // Any other character starts an answer of your own.
      if (e.key.length === 1 && e.key !== ' ' && settled()) otherBox().focus();
    });

    let onShown = () => {};

    /** Keyboard into the card: what was last chosen, or the first option. */
    function focus() {
      if (!q || el.hidden) return;
      if (folded) { $('.qc-fold').focus({ preventScroll: true }); return; }
      const p = picks[at];
      if (p.other.trim()) { const b = otherBox(); b.focus({ preventScroll: true }); b.setSelectionRange(b.value.length, b.value.length); return; }
      const c = cur();
      const i = c.options.findIndex((o) => p.labels.has(o.label));
      opts()[Math.max(0, i)]?.focus({ preventScroll: true });
    }

    return {
      el,
      /** Shows a question, or hides the card for null. Asking again with the same id changes nothing. */
      set(next) {
        if (!next) {
          const had = !!q;
          q = null;
          sending = false;
          el.hidden = true;
          el.innerHTML = '';
          return had;
        }
        if (q?.id === next.id) return false;
        q = next;
        at = 0;
        picks = next.questions.map(() => ({ labels: new Set(), other: '', skipped: false }));
        readyAt = Date.now() + SETTLE_MS;
        folded = false;
        sending = false;
        el.hidden = false;
        draw();
        return true;
      },
      /** On screen and not yet sent. */
      active: () => !!q && !sending,
      focus,
      // For the terminal view's menu (term-menu.js), which works on these same answers.
      state: () => (q && !sending ? { id: q.id, questions: q.questions, picks, at } : null),
      settled,
      send,
      stop,
      setAt(i) { at = i; },
      /** Shows what the menu changed while the card was out of sight. */
      redraw() { if (q && !sending) draw(); },
      onShown(fn) { onShown = fn; },
    };
  }

  return { create };
})();
