/* global hangar, state, h, esc, $, openPop, closePop, HangarThemes, HangarLook, HangarSettings, HangarCommands */
// Theme Studio: describe a look to Claude, or set any colour by hand, with a live preview of the
// app. While drawing, only the preview's own CSS variables change, at most once per frame.
'use strict';

const HangarStudio = (() => {
  const T = HangarThemes;
  const GROUPS = [
    ['Window', 'ui', [['bg', 'Window'], ['panel', 'Bars and panels'], ['tile', 'Session tiles'], ['pop', 'Menus and dialogs'], ['line', 'Borders'], ['hover', 'Hover']]],
    ['Text', 'ui', [['text', 'Main text'], ['muted', 'Secondary text'], ['faint', 'Faint text']]],
    ['Highlights', 'ui', [['accent', 'Accent'], ['working', 'Working'], ['needs', 'Needs you'], ['done', 'Done'], ['error', 'Error'], ['idle', 'Idle'], ['ov', 'Overseer'], ['ovBg', 'Overseer panel']]],
    ['Terminal', 'term', [['background', 'Background'], ['foreground', 'Text'], ['cursor', 'Cursor'], ['selectionBackground', 'Selection']]],
  ];
  const IDEAS = ['Warm and calm, like old paper', 'Deep blue at night', 'Black with green text', 'Soft pastels, easy on the eyes'];
  const clone = (t) => ({ name: t.name, base: t.base, id: t.preset ? null : t.id, ui: { ...t.ui }, term: { ...t.term } });

  let el = null, draft = null, undo = [], messages = [], tab = 'chat', busy = 0, tryOn = false, preview = null, frame = 0;

  function previewHtml() {
    const line = (c, s) => `<span style="color:var(--t-${c})">${s}</span>`;
    return `<div class="tp-bar"><span class="tp-ic"></span><span class="tp-pill on">Client</span><span class="tp-pill">Side project</span>
        <span class="tp-sum"><i class="tp-d needs"></i>1 needs you</span><span class="tp-sum"><i class="tp-d work"></i>2 working</span><span class="tp-sum"><i class="tp-ck">✓</i>1 done</span>
        <span class="grow"></span><span class="tp-btn prim">+ New</span><span class="tp-btn ov">Overseer</span></div>
      <div class="tp-grid">
        <div class="tp-tile"><div class="tp-head"><i class="tp-d work"></i><b>api</b><span class="tp-mode">Plan</span><em>Working</em></div>
          <pre class="tp-term"><span style="color:var(--t-foreground)">&gt; add pagination to orders</span>

${line('green', '●')} <span style="color:var(--t-foreground)">Read(routes/orders.js)</span>
  ${line('brightBlack', '⎿ Read 63 lines')}
${line('green', '●')} <span style="color:var(--t-foreground)">Update(routes/orders.js)</span>
  <span class="tp-add">+ const limit = 25;</span>
  <span class="tp-del">- const limit = 100;</span>
${line('yellow', '✻')} ${line('cyan', 'Working…')} <span class="tp-cur"></span></pre></div>
        <div class="tp-tile needs"><div class="tp-head"><i class="tp-d needs"></i><b>storefront</b><em class="n">Needs you</em></div>
          <pre class="tp-term"><span style="color:var(--t-white)">Do you want to make this edit?</span>
${line('blue', '❯ 1. Yes')}
<span style="color:var(--t-foreground)">  2. Yes, allow all edits</span>
<span style="color:var(--t-foreground)">  3. No</span>

${line('brightBlack', 'Esc to cancel')}</pre></div>
        <div class="tp-tile"><div class="tp-head"><span class="tp-ck">✓</span><b>docs</b><em class="d">Done</em></div>
          <pre class="tp-term">${['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((c) => line(c, c)).join(' ')}
${['brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan'].map((c) => line(c, c.slice(6).toLowerCase())).join(' ')}
<span class="tp-sel">selected text</span> <span style="color:var(--t-foreground)">normal text</span></pre></div>
        <div class="tp-tile tp-menuwrap"><div class="tp-pop"><div class="tp-it h">New session</div><div class="tp-it">Overview</div><div class="tp-it">Workspaces</div><div class="tp-sep"></div><div class="tp-it faint">Settings</div></div>
          <div class="tp-ovp"><b>Overseer</b><p class="tp-mut">Anything waiting on me?</p><p>storefront needs an answer.</p></div></div>
      </div>`;
  }
  /** Colours reach the preview through its own variables only. */
  function paintPreview() {
    frame = 0;
    if (!preview || !draft) return;
    const s = preview.style;
    for (const k of T.UI_KEYS) s.setProperty(`--p-${k}`, draft.ui[k]);
    for (const k of T.TERM_KEYS) s.setProperty(`--t-${k}`, draft.term[k]);
    if (tryOn) HangarLook.preview(fullDraft());
    drawWarnings();
  }
  const queuePaint = () => { if (!frame) frame = requestAnimationFrame(paintPreview); };
  const fullDraft = () => ({ ...draft, id: draft.id || 'trial' });

  function drawWarnings() {
    const w = el && $('.ts-warn', el);
    if (!w) return;
    const bad = [];
    if (T.contrast(draft.ui.text, draft.ui.bg) < 4.5) bad.push('Main text is hard to read on the window colour.');
    if (T.contrast(draft.term.foreground, draft.term.background) < 4.5) bad.push('Terminal text is hard to read on its background.');
    if (T.contrast(draft.ui.needs, draft.ui.tile) < 3) bad.push('"Needs you" doesn\'t stand out on the tiles.');
    w.textContent = bad[0] || '';
    w.hidden = !bad.length;
  }

  function colourRow(group, key, label) {
    const r = h('label', 'ce');
    r.innerHTML = `<input type="color" aria-label="${esc(label)}" value="${draft[group][key]}"><span class="ce-l">${esc(label)}</span><input class="ce-h" value="${draft[group][key]}" maxlength="7" spellcheck="false" aria-label="${esc(label)} hex">`;
    const [pick, text] = r.querySelectorAll('input');
    const set = (v) => { draft[group][key] = v.toLowerCase(); queuePaint(); };
    pick.addEventListener('pointerdown', pushUndo);
    pick.oninput = () => { text.value = pick.value; set(pick.value); };
    text.onchange = () => { const v = text.value.trim(); if (T.isHex(v)) { pushUndo(); pick.value = v; set(v); } else text.value = draft[group][key]; };
    return r;
  }
  function drawColours(box) {
    box.innerHTML = '';
    for (const [title, group, rows] of GROUPS) {
      box.appendChild(h('h4', '', esc(title)));
      const g = h('div', 'ce-grid');
      rows.forEach(([k, l]) => g.appendChild(colourRow(group, k, l)));
      box.appendChild(g);
    }
    box.appendChild(h('h4', '', 'Terminal colours'));
    const a = h('div', 'ce-ansi');
    T.ANSI.forEach((n) => {
      const s = h('label', 'ce-sw', `<input type="color" title="${esc(n)}" aria-label="${esc(n)}" value="${draft.term[n]}">`);
      const inp = $('input', s);
      inp.addEventListener('pointerdown', pushUndo);
      inp.oninput = () => { draft.term[n] = inp.value; queuePaint(); };
      a.appendChild(s);
    });
    box.appendChild(a);
    box.appendChild(h('p', 'ts-small', 'Top row: normal colours. Bottom row: bright versions.'));
    const reb = h('button', 'btn small', 'Rebuild the rest from window, text and accent');
    reb.onclick = () => {
      pushUndo();
      const n = T.fromSeed({ base: draft.base, bg: draft.ui.bg, text: draft.ui.text, accent: draft.ui.accent, name: draft.name });
      draft.ui = n.ui; draft.term = n.term;
      drawColours(box); paintPreview();
    };
    box.appendChild(reb);
  }

  const MAX_UNDO = 40;
  function pushUndo() { undo.push(JSON.stringify(draft)); if (undo.length > MAX_UNDO) undo.shift(); syncUndo(); }
  function syncUndo() { const b = el && $('[data-undo]', el); if (b) b.disabled = !undo.length; }
  function doUndo() {
    const prev = undo.pop();
    if (!prev) return;
    draft = JSON.parse(prev);
    $('[data-name]', el).value = draft.name;
    if (tab === 'colours') drawColours($('.ts-pane', el));
    paintPreview(); syncUndo();
  }

  function msg(role, text) {
    messages.push({ role, text });
    const f = $('.ts-feed', el);
    if (!f) return;
    $('.ts-ideas', el)?.remove();
    f.appendChild(h('div', `ts-m ${role}`, esc(text)));
    f.scrollTop = f.scrollHeight;
  }
  async function send(text) {
    const q = text.trim();
    if (!q || busy) return;
    msg('you', q);
    const box = $('.ts-in', el), go = $('.ts-go', el);
    box.value = '';
    const ticket = ++busy;
    go.disabled = true;
    const wait = h('div', 'ts-m wait', '<span class="spin"></span>Choosing colours…');
    const feed = $('.ts-feed', el);
    feed.appendChild(wait); feed.scrollTop = feed.scrollHeight;
    const model = $('[data-model]', el).value;
    const r = await hangar.themeGenerate({ current: T.toSeed(draft), history: messages.slice(0, -1), message: q, model });
    if (!el || busy !== ticket) return;
    busy = 0;
    wait.remove();
    go.disabled = false;
    box.focus();
    if (r.error) { msg('err', r.error); return; }
    pushUndo();
    const keep = draft.id;
    draft = { ...r.theme, id: keep };
    $('[data-name]', el).value = draft.name;
    msg('claude', r.say || 'Done.');
    const m = $('.ts-meter', el);
    if (m) m.textContent = `Last reply: ${r.tokens.toLocaleString()} tokens`;
    paintPreview();
  }
  function drawChat(pane) {
    pane.innerHTML = '<div class="ts-feed" aria-live="polite"></div>';
    const f = $('.ts-feed', pane);
    if (messages.length) for (const m of messages) f.appendChild(h('div', `ts-m ${m.role}`, esc(m.text)));
    else {
      const ideas = h('div', 'ts-ideas', '<p>Describe the look you want, or start from one of these.</p>');
      IDEAS.forEach((t) => { const b = h('button', 'ts-idea', esc(t)); b.onclick = () => send(t); ideas.appendChild(b); });
      f.appendChild(ideas);
    }
    const c = h('div', 'ts-comp');
    c.innerHTML = `<textarea class="ts-in" rows="4" maxlength="800" placeholder="Make the background darker, use teal as the accent…" aria-label="Describe your theme"></textarea>
      <div class="ts-row"><select class="st-select" data-model aria-label="Model"><option value="haiku">Haiku: fastest</option><option value="sonnet">Sonnet: more careful</option></select><span class="ts-meter"></span><div class="grow"></div><button class="btn small primary ts-go">Send</button></div>`;
    pane.appendChild(c);
    const box = $('.ts-in', c);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(box.value); } });
    $('.ts-go', c).onclick = () => send(box.value);
    box.focus();
    f.scrollTop = f.scrollHeight;
  }
  function showTab(t) {
    tab = t;
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const pane = $('.ts-pane', el);
    pane.classList.toggle('colours', t === 'colours');
    if (t === 'chat') drawChat(pane); else drawColours(pane);
  }

  const STEPS = [
    ['Describe it', 'Tell Claude the look you want, in your own words. Each message changes the theme and you can keep refining it.'],
    ['Fine-tune it', 'Open Colours to set anything by hand: the window, menus, status colours and all the terminal colours.'],
    ['See it and save it', 'The preview updates as you go. Turn on "Try on the whole app" to see it for real, then save it. Your theme appears in Settings.'],
  ];
  function guide() {
    let i = 0;
    const g = h('div', 'ts-guide');
    const draw = () => {
      g.innerHTML = `<div class="tg-card" role="dialog" aria-label="Theme Studio guide"><div class="tg-step">${i + 1} of ${STEPS.length}</div><h3>${esc(STEPS[i][0])}</h3><p>${esc(STEPS[i][1])}</p><div class="tg-row"><button class="btn small" data-skip>${i < STEPS.length - 1 ? 'Skip' : 'Close'}</button><div class="grow"></div>${i < STEPS.length - 1 ? '<button class="btn small primary" data-next>Next</button>' : '<button class="btn small primary" data-skip>Start</button>'}</div></div>`;
      g.querySelectorAll('[data-skip]').forEach((b) => { b.onclick = done; });
      const n = $('[data-next]', g);
      if (n) n.onclick = () => { i++; draw(); };
      $('.btn.primary', g)?.focus();
    };
    function done() { g.remove(); hangar.setSettings({ themeGuideSeen: true }); $('.ts-in', el)?.focus(); }
    el.appendChild(g);
    draw();
  }

  function finish(toSettings) {
    if (tryOn) HangarLook.preview(null);
    tryOn = false; busy = 0;
    cancelAnimationFrame(frame); frame = 0;
    if (toSettings) setTimeout(() => HangarSettings.open('appearance'), 0);
  }
  function open({ theme, tab: first = 'chat', fresh = false }) {
    closePop?.();
    draft = clone(theme);
    if (fresh) { draft.id = null; draft.name = theme.preset ? `My ${theme.name}` : `${theme.name} copy`; }
    undo = []; messages = []; tryOn = false; busy = 0;
    el = h('div', 'pop modal studio');
    el.setAttribute('aria-label', 'Theme Studio');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<header class="ts-head"><button class="btn icon small" data-back aria-label="Back to settings" title="Back"><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg></button><b>Theme Studio</b>
        <input class="field ts-name" data-name aria-label="Theme name" maxlength="40" spellcheck="false" value="${esc(draft.name)}"><div class="grow"></div>
        <button class="btn small" data-guide aria-label="How this works">Guide</button></header>
      <div class="ts-body"><div class="ts-left"><div class="seg ts-tabs"><button data-tab="chat">Describe</button><button data-tab="colours">Colours</button></div><div class="ts-pane"></div></div>
      <div class="ts-right"><div class="tp"></div><p class="ts-warn" role="status" hidden></p></div></div>
      <footer class="ts-foot"><label class="ts-try"><span class="st-switch"><input type="checkbox" data-try><i></i></span>Try on the whole app</label><button class="btn small" data-undo disabled>Undo</button><div class="grow"></div><button class="btn small" data-cancel>Cancel</button><button class="btn small primary" data-save>Save theme</button></footer>`;
    preview = $('.tp', el);
    preview.innerHTML = previewHtml();
    openPop(el, null, { onClose: () => { const had = el; el = null; preview = null; if (had) finish(false); } });
    paintPreview();
    showTab(first);
    syncUndo();
    const back = () => { const e = el; el = null; preview = null; finish(true); if (e) closePop(); };
    $('[data-back]', el).onclick = back;
    $('[data-cancel]', el).onclick = back;
    $('[data-guide]', el).onclick = guide;
    $('[data-undo]', el).onclick = doUndo;
    $('[data-name]', el).oninput = (e) => { draft.name = e.target.value; };
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
    $('[data-try]', el).onchange = (e) => { tryOn = e.target.checked; HangarLook.preview(tryOn ? fullDraft() : null); };
    $('[data-save]', el).onclick = async (e) => {
      e.target.disabled = true;
      const saved = await hangar.themeSave({ ...draft, name: draft.name.trim() || 'My theme' });
      hangar.setSettings({ theme: saved.id });
      back();
    };
    if (!state.settings.themeGuideSeen) guide();
  }
  return { open };
})();
window.HangarStudio = HangarStudio;
