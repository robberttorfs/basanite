/* exported HangarChat */
'use strict';

// The clean view: a tidy chat drawn from a session's transcript, with tool
// calls folded into one quiet line, and a message box that types into the
// real session. The terminal stays underneath and takes over for menus.

const HangarChat = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- a small, safe markdown renderer ----------

  // File paths become links to the viewer: anything path-like in a code span,
  // and in plain text only what has a folder in it.
  const EXT = 'png|jpe?g|gif|webp|bmp|ico|avif|svg|md|markdown|mdx|html?|pdf|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|flac|txt|log|json|jsonl|csv|tsv|ya?ml|toml|xml|diff|patch|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|css|scss|sh|ps1|sql|lua|php|vue|svelte';
  const CODE_FILE = new RegExp(String.raw`^(?:[A-Za-z]:[\\/].*|[~.]?/.*|\S+)\.(?:${EXT})(?::\d+){0,2}$`, 'i');
  const TEXT_FILE = new RegExp(String.raw`(?<![\w/\\.:])(?:(?:[A-Za-z]:[\\/]|~/|/)(?:[\w.@+-]+[\\/])*|(?:\.{1,2}/)?(?:[\w.@+-]+[\\/])+)[\w.@+-]+\.(?:${EXT})(?::\d+){0,2}(?![\w/\\])`, 'gi');
  const fileLink = (p, label = p) => `<a class="flink" data-file="${p}">${label}</a>`;
  // Outside tags and existing links only.
  const linkPaths = (html) => html.split(/(<a [^>]*>.*?<\/a>|<[^>]+>)/).map((x, i) => (i % 2 ? x : x.replace(TEXT_FILE, (m) => fileLink(m)))).join('');

  function inline(raw) {
    return raw.split(/(`[^`\n]+`)/).map((part, i) => {
      if (i % 2) {
        const code = part.slice(1, -1);
        return CODE_FILE.test(code.trim()) ? `<code>${fileLink(esc(code.trim()))}</code>` : `<code>${esc(code)}</code>`;
      }
      return linkPaths(esc(part)
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])\*([^*\s][^*\n]*)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
        .replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, alt, src) => (/^https?:/i.test(src) ? `<a href="${src}">${alt || src}</a>` : `<a class="flink pic" data-file="${src}">${alt || src}</a>`))
        .replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\[([^\]\n]+)\]\((?!#)([^)\s]+\.[A-Za-z0-9]{1,8})\)/g, '<a class="flink" data-file="$2">$1</a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2">$2</a>'));
    }).join('');
  }

  function md(text, opts = {}) {
    const lines = text.replace(/\r/g, '').split('\n');
    const out = [];
    let para = [];
    const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = /^\s*(```|~~~)(.*)$/.exec(line);
      if (fence) {
        flush();
        const code = [];
        while (++i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i]);
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        continue;
      }
      if (!line.trim()) { flush(); continue; }
      const head = /^(#{1,6})\s+(.*)$/.exec(line);
      if (head) { flush(); const tag = opts.headings ? `h${head[1].length}` : 'h4'; out.push(`<${tag}>${inline(head[2])}</${tag}>`); continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
      if (/^\s*\|/.test(line)) {
        flush();
        const rows = [];
        for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
          if (/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) continue;
          rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        }
        i--;
        out.push(`<div class="tbl"><table>${rows.map((r, ri) => `<tr>${r.map((c) => (ri ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join('')}</tr>`).join('')}</table></div>`);
        continue;
      }
      if (/^\s*>/.test(line)) {
        flush();
        const q = [];
        for (; i < lines.length && /^\s*>/.test(lines[i]); i++) q.push(lines[i].replace(/^\s*>\s?/, ''));
        i--;
        out.push(`<blockquote>${md(q.join('\n'), opts)}</blockquote>`);
        continue;
      }
      const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (li) {
        flush();
        const ordered = /\d/.test(li[2]);
        const items = [];
        for (; i < lines.length; i++) {
          const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          if (m) { items.push({ depth: Math.min(3, Math.floor(m[1].length / 2)), text: m[3] }); continue; }
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].text += ` ${lines[i].trim()}`; continue; }
          break;
        }
        i--;
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((it) => `<li${it.depth ? ` style="margin-left:${it.depth * 16}px"` : ''}>${inline(it.text)}</li>`).join('')}</${tag}>`);
        continue;
      }
      para.push(line);
    }
    flush();
    return out.join('');
  }

  // ---------- steps (tool calls) ----------

  const ICON_STEP = '<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>';

  function stepLabel(t) {
    return `<span class="sv">${esc(t.verb)}</span>${t.obj ? ` <span class="so">${esc(t.obj)}</span>` : ''}`;
  }

  function stepsSummary(steps) {
    const running = steps.find((s) => !s.done);
    const errors = steps.filter((s) => s.error).length;
    const shown = running ? [running] : steps.slice(-2).reverse();
    const rest = steps.length - shown.length;
    return `${running ? '<span class="spin"></span>' : `<span class="tick${errors ? ' err' : ''}"></span>`}` +
      `<span class="sl">${shown.map(stepLabel).join('<span class="sep">, </span>')}</span>` +
      `${rest > 0 ? `<span class="sm">+${rest}</span>` : ''}`;
  }

  // Claude Code writes attachments into the message as [Image #1]; show them as small tags.
  const youHtml = (text) => md(text).replace(/\[(Image #\d+|\d+ files?)\]/g, (_, t) => `<span class="ftag">${esc(t.replace('#', ''))}</span>`);

  // ---------- the view ----------

  function create({ send, interrupt, answer, takeFiles, fileDir, placeholder = 'Message Claude', empty = 'No messages yet.' }) {
    const el = document.createElement('div');
    el.className = 'chat';
    el.innerHTML = `<div class="feed" role="log" aria-live="polite"></div>
      <div class="busy" hidden><span class="spin"></span><span class="bt"></span></div>
      <form class="composer"><div class="atts" hidden></div><textarea rows="1" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}"></textarea>
        <button type="button" class="stop" hidden title="Stop (Esc)" aria-label="Stop"><svg viewBox="0 0 16 16"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/></svg></button>
        <button type="submit" class="go" title="Send (Enter)" aria-label="Send"><svg viewBox="0 0 16 16"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/></svg></button></form>`;
    const feed = el.querySelector('.feed');
    const box = el.querySelector('textarea');
    const busyEl = el.querySelector('.busy');
    const attsEl = el.querySelector('.atts');
    const composer = el.querySelector('.composer');
    // Sits where the message box sits. A draft in the box stays there for after.
    const ask = answer ? HangarAsk.create({ submit: answer, stop: interrupt, md }) : null;
    if (ask) {
      el.insertBefore(ask.el, composer);
      ask.onShown((hadFocus) => {
        composer.hidden = ask.active();
        if (hadFocus && !ask.active()) box.focus({ preventScroll: true });
      });
      // A click on the conversation (not a text selection) leaves the keyboard on the question.
      el.addEventListener('mouseup', () => {
        if (ask.active() && !ask.el.contains(document.activeElement) && !window.getSelection()?.toString()) ask.focus();
      });
    }
    let atts = [];                 // files waiting to go with the next message: { path, name, url }
    const items = new Map();       // n -> item, in arrival order
    const open = new Set();        // expanded step groups and steps
    let pending = null;            // the message just sent, until the transcript has it
    let raf = 0;
    let busy = false;

    const grow = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 180)}px`; };
    box.addEventListener('input', grow);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
      if (e.key === 'Escape' && busy && !box.value) { e.preventDefault(); e.stopPropagation(); interrupt(); }
    });
    el.querySelector('form').onsubmit = (e) => { e.preventDefault(); submit(); };
    // Pasting a picture or a copied file attaches it; plain text pastes as usual.
    box.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length || !takeFiles) return;
      e.preventDefault();
      takeFiles(files).then(attach);
    });
    attsEl.addEventListener('click', (e) => {
      const x = e.target.closest('[data-drop]');
      if (!x) return;
      const [gone] = atts.splice(Number(x.dataset.drop), 1);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      drawAtts();
      box.focus();
    });
    function attach(list) {
      if (!list?.length) return;
      atts.push(...list);
      drawAtts();
    }
    function drawAtts() {
      attsEl.hidden = !atts.length;
      attsEl.innerHTML = atts.map((a, i) => `<span class="att" title="${esc(a.name)}">${a.url ? `<img src="${esc(a.url)}" alt="">` : `<i>${esc(a.name)}</i>`}` +
        `<button type="button" class="x" data-drop="${i}" title="Remove" aria-label="Remove ${esc(a.name)}">×</button></span>`).join('');
    }
    el.querySelector('.stop').onclick = () => { interrupt(); box.focus(); };
    function submit() {
      const text = box.value.replace(/\s+$/, '');
      if (!text.trim() && !atts.length) return;
      const files = atts;
      send(text, files);
      atts = [];
      drawAtts();
      box.value = '';
      grow();
      const n = files.length;
      pending = { text: [n ? `[${n} ${n > 1 ? 'files' : 'file'}]` : '', text].filter(Boolean).join(' '), at: Date.now() };
      draw(true);
    }

    feed.addEventListener('click', (e) => {
      if (window.HangarViewer?.onFeedClick(e, fileDir?.())) return;
      const a = e.target.closest('a[href]');
      if (a) { e.preventDefault(); window.open(a.href); return; }
      const t = e.target.closest('[data-toggle]');
      if (!t || window.getSelection()?.toString()) return;
      const key = t.dataset.toggle;
      if (open.has(key)) open.delete(key); else open.add(key);
      draw();
    });

    function blocks() {
      const list = [...items.values()];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it.k === 'tool') {
          const steps = [];
          for (; i < list.length && list[i].k === 'tool'; i++) steps.push(list[i]);
          i--;
          const key = `g${steps[0].n}`;
          const isOpen = open.has(key);
          let html = `<div class="steps${isOpen ? ' open' : ''}"><button class="sh" data-toggle="${key}" aria-expanded="${isOpen}">${ICON_STEP}${stepsSummary(steps)}</button>`;
          if (isOpen && steps.length === 1) {
            const s = steps[0];
            html += `<pre class="sd">${esc(s.detail || '')}${s.result ? `\n\n<span class="sr">${esc(s.result)}</span>` : ''}</pre>`;
          } else if (isOpen) {
            html += '<div class="sb">' + steps.map((s) => {
              const sk = `s${s.n}`;
              const so = open.has(sk);
              return `<div class="step${s.error ? ' err' : ''}${so ? ' open' : ''}"><button class="st" data-toggle="${sk}">${s.done ? '' : '<span class="spin"></span>'}${stepLabel(s)}</button>` +
                (so ? `<pre class="sd">${esc(s.detail || '')}${s.result ? `\n\n<span class="sr">${esc(s.result)}</span>` : ''}</pre>` : '') + '</div>';
            }).join('') + '</div>';
          }
          out.push({ key, html: `${html}</div>` });
          continue;
        }
        if (it.k === 'ask') {
          // Unanswered it is on the card. Stopped or refused, the transcript says nothing worth showing.
          if (it.qa?.length) out.push({ key: `m${it.n}`, html: `<div class="asked">${it.qa.map((p) => `<div class="apair"><div class="aq">${esc(p.question)}</div><div class="aa${p.skipped ? ' skip' : ''}">${p.skipped ? 'Skipped' : esc(p.answer)}</div></div>`).join('')}</div>` });
          continue;
        }
        if (it.k === 'you') out.push({ key: `m${it.n}`, html: `<div class="msg you"><div class="bubble">${youHtml(it.text)}</div></div>` });
        else if (it.k === 'claude') out.push({ key: `m${it.n}`, html: `<div class="msg claude">${md(it.text)}</div>` });
        else if (it.k === 'note') out.push({ key: `m${it.n}`, html: `<div class="note">${esc(it.text)}</div>` });
        else if (it.k === 'divider') out.push({ key: `m${it.n}`, html: `<div class="divider"><span>${esc(it.text)}</span></div>` });
      }
      if (pending) out.push({ key: 'pending', html: `<div class="msg you pending"><div class="bubble">${youHtml(pending.text)}</div></div>` });
      if (!out.length) out.push({ key: 'empty', html: `<div class="empty-chat">${esc(empty)}</div>` });
      return out;
    }

    // Only blocks that changed are touched, so a selection or an open step survives updates.
    function draw(stick) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const atBottom = stick || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
        const next = blocks();
        const have = new Map([...feed.children].map((c) => [c.dataset.key, c]));
        let prev = null;
        for (const b of next) {
          let node = have.get(b.key);
          if (node && node._html !== b.html) { node.remove(); node = null; }
          if (!node) {
            const tmp = document.createElement('div');
            tmp.innerHTML = b.html;
            node = tmp.firstElementChild;
            node.dataset.key = b.key;
            node._html = b.html;
            if (node.classList.contains('claude')) window.HangarViewer?.thumbs(node, fileDir?.());
          }
          have.delete(b.key);
          const want = prev ? prev.nextSibling : feed.firstChild;
          if (want !== node) feed.insertBefore(node, want);
          prev = node;
        }
        for (const n of have.values()) n.remove();
        if (atBottom) feed.scrollTop = feed.scrollHeight;
      });
    }

    return {
      el,
      set(list, reset) {
        if (reset) { items.clear(); open.clear(); }
        for (const it of list) {
          items.set(it.n, it);
          if (pending && it.k === 'you') pending = null;
        }
        if (pending && Date.now() - pending.at > 15000) pending = null;
        draw(reset);
      },
      /** Working state: from the session status, or guessed from the feed for the overseer. */
      setBusy(on, label = 'Working') {
        busy = on;
        busyEl.hidden = !on;
        busyEl.querySelector('.bt').textContent = label;
        el.querySelector('.stop').hidden = !on;
      },
      guessBusy() {
        const last = [...items.values()].pop();
        return !!pending || last?.k === 'you' || (last?.k === 'tool' && !last.done);
      },
      focus() { if (ask?.active()) ask.focus(); else box.focus({ preventScroll: true }); },
      /** Shows or clears the question card. True when a new question just went up. */
      setQuestion(q) {
        if (!ask) return false;
        const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
        const hadFocus = ask.el.contains(document.activeElement);
        const changed = ask.set(q);
        composer.hidden = ask.active();
        if (ask.active()) busyEl.hidden = true;
        else if (hadFocus) box.focus({ preventScroll: true }); // Esc or an answer from elsewhere: back to the box
        if (changed && atBottom) feed.scrollTop = feed.scrollHeight;
        return changed && !!q;
      },
      attach,
      hasFocus() { return el.contains(document.activeElement); },
      scrollToEnd() { feed.scrollTop = feed.scrollHeight; },
    };
  }

  return { create, md };
})();
