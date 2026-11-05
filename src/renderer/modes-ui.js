/* global hangar, HangarCommands, state, tiles, $, h, esc, ICON, SWATCHES, SHIFT_MOD, openPop, closePop, arrowNav, flash,
   askInline, toggleOverseer, modeById, tileNotice, dragDepth: writable */
// Modes 2.0 in the window: the mode picker (modes plus stackable add-ons), the mode
// library and editor, Until done's goal form, mode files (export, import, drop) and
// the one-click Review / Simplify commands. app.js keeps thin wrappers that call in here.
'use strict';

(() => {
  // Same stroke style as ICON in app.js.
  const MI = {
    list: '<svg viewBox="0 0 16 16"><path d="M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01"/></svg>',
    map: '<svg viewBox="0 0 16 16"><path d="M2.5 4l3.5-1.5 4 1.5 3.5-1.5v9.5L10 13.5 6 12l-3.5 1.5zM6 2.5V12M10 4v9.5"/></svg>',
    hammer: '<svg viewBox="0 0 16 16"><path d="M9 3.5l3.5 3.5-1.5 1.5L7.5 5zM8.2 6.8l-5 5 1.5 1.5 5-5M9 3.5L10.5 2"/></svg>',
    moon: '<svg viewBox="0 0 16 16"><path d="M12.5 10A5 5 0 0 1 6 3.5a5 5 0 1 0 6.5 6.5z"/></svg>',
    eye: '<svg viewBox="0 0 16 16"><path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.8"/></svg>',
    shield: '<svg viewBox="0 0 16 16"><path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/></svg>',
    target: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5"/><path d="M8 8h.01"/></svg>',
    flask: '<svg viewBox="0 0 16 16"><path d="M6 2.5h4M6.5 2.5v4L3 12.5a1 1 0 0 0 .9 1.5h8.2a1 1 0 0 0 .9-1.5L9.5 6.5v-4M4.6 10h6.8"/></svg>',
    bug: '<svg viewBox="0 0 16 16"><rect x="5" y="5" width="6" height="8" rx="3"/><path d="M8 7.5V13M5 8.5H2.5M13.5 8.5H11M5.5 11.5l-2 1.5M10.5 11.5l2 1.5M6 5.5L4.5 3.5M10 5.5l1.5-2"/></svg>',
    doc: '<svg viewBox="0 0 16 16"><path d="M4 2h5.5L12.5 5v9H4zM9.5 2v3h3M6 8h4.5M6 10.5h4.5"/></svg>',
    steps: '<svg viewBox="0 0 16 16"><path d="M2.5 13h3.5V9.5h3.5V6H13V2.5"/></svg>',
    loop: '<svg viewBox="0 0 16 16"><path d="M12.5 6.5A4.8 4.8 0 0 0 3.6 6M3.5 9.5a4.8 4.8 0 0 0 8.9.5M12.8 3.5v3h-3M3.2 12.5v-3h3"/></svg>',
    crew: '<svg viewBox="0 0 16 16"><circle cx="5.5" cy="6" r="2"/><circle cx="11" cy="6.5" r="1.6"/><path d="M2 13c.4-2.2 1.8-3.4 3.5-3.4S8.6 10.8 9 13M9.6 10.2c.4-.3.9-.5 1.4-.5 1.4 0 2.4 1 2.8 3.3"/></svg>',
    check: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>',
    commit: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.5"/><path d="M1.5 8h4M10.5 8h4"/></svg>',
    quiet: '<svg viewBox="0 0 16 16"><path d="M3 6.5h2.5L9 3.5v9L5.5 9.5H3zM11.5 6.5l3 3M14.5 6.5l-3 3"/></svg>',
    dot: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/></svg>',
    back: '<svg viewBox="0 0 16 16"><path d="M9.5 3.5L5 8l4.5 4.5"/></svg>',
    file: '<svg viewBox="0 0 16 16"><path d="M8 2.5v7M5 6.5l3 3 3-3M3 11.5v2h10v-2"/></svg>',
  };
  const ICON_NAMES = Object.keys(MI).filter((k) => !['back', 'file', 'dot'].includes(k));
  const icon = (m) => MI[m?.icon] || MI.dot;
  const GUARD_LABEL = { '': 'None', readonly: 'Read-only', risky: 'Block pushes and deploys' };
  const COST_WORD = ['No extra tokens', 'Some tokens', 'More tokens', 'Many tokens'];
  const est = (text) => Math.ceil(String(text || '').length / 4);

  const all = () => state.modes || [];
  const isAddon = (m) => m?.kind === 'addon';
  const modesOnly = (withHidden) => all().filter((m) => !isAddon(m) && (withHidden || !m.hidden));
  const addons = (withHidden) => all().filter((m) => isAddon(m) && (withHidden || !m.hidden));
  // Shelf: the seven most-used, in order; everything else sits under More.
  const shelf = (list) => list.filter((m) => m.shelf).sort((a, b) => a.shelf - b.shelf);
  const rest = (list) => list.filter((m) => !m.shelf);
  const snapOf = (id) => state.tiles.find((t) => t.id === id);

  /** Token cost as 0 to 3 dots: filled and hollow, so it reads without colour. */
  function dots(n, cls = '') {
    n = Math.max(0, Math.min(3, Number(n) || 0));
    return `<span class="tdots ${cls}" role="img" aria-label="${COST_WORD[n]}" title="${COST_WORD[n]}">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  // ---------- the chip on the tile ----------

  function drawChip(chip, snap) {
    const m = snap.mode?.id ? snap.mode : null;
    const ons = snap.mode?.addons || [];
    const pending = (m && !m.applied) || ons.some((a) => !a.applied);
    chip.className = `mode-chip${m || ons.length ? ' set' : ''}${pending ? ' pending' : ''}`;
    chip.style.setProperty('--mc', m?.color || 'var(--muted)');
    chip.innerHTML = `${m ? `${m.guard ? `<span class="mc-guard">${MI.shield}</span>` : ''}${esc(m.name)}` : ons.length ? '' : 'Mode'}` +
      (ons.length ? `<span class="mc-addons">${ons.map((a) => `<span class="mc-a" title="${esc(a.name)}">${icon(a)}</span>`).join('')}</span>` : '');
    const names = [m && `${m.name} mode`, ...ons.map((a) => a.name)].filter(Boolean).join(', ');
    chip.title = names ? `${names} (${SHIFT_MOD}M)` : `Mode (${SHIFT_MOD}M)`;
    chip.setAttribute('aria-label', names ? `Mode: ${names}` : 'Mode');
  }

  // ---------- picking ----------

  /** Puts a session in a mode. Until done asks for its goal first, when there is a tile to anchor to. */
  function pick(id, modeId, anchorEl) {
    const m = modeById(modeId);
    if (m?.goal && tiles.has(id)) return openGoal(id, anchorEl);
    hangar.setMode(id, modeId || null);
  }

  function openGoal(id, anchorEl) {
    const t = tiles.get(id);
    const m = all().find((x) => x.goal);
    if (!t || !m) return;
    anchorEl = anchorEl || $('.mode-chip', t.el);
    const el = h('div', 'pop goal-pop');
    el.innerHTML = `<h3><span class="mi" style="--c:${m.color}">${icon(m)}</span>${esc(m.name)}</h3>
      <label>Done when<input class="field" name="cond" maxlength="3800" placeholder="npm test passes"></label>
      <label>Max turns<input class="field" name="turns" type="number" min="1" max="200" value="20"></label>
      <div class="gp-cost">${dots(m.cost)}<span>Each turn uses tokens</span></div>
      <div class="row end"><button class="btn small" data-no>Cancel</button><button class="btn small primary" data-go>Start</button></div>`;
    openPop(el, anchorEl, { alignLeft: true });
    const cond = $('[name=cond]', el), turns = $('[name=turns]', el);
    const go = async () => {
      if (!cond.value.trim()) { cond.focus(); return; }
      closePop();
      await hangar.setGoal(id, cond.value, Number(turns.value) || 20);
    };
    $('[data-go]', el).onclick = go;
    $('[data-no]', el).onclick = () => closePop();
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); go(); } });
    cond.focus();
  }

  function openPicker(id, anchorEl) {
    const snap = snapOf(id);
    if (!snap || snap.kind === 'shell') return;
    anchorEl = anchorEl || $('.mode-chip', tiles.get(id).el);
    const cur = snap.mode?.id || null;
    const on = new Set((snap.mode?.addons || []).map((a) => a.id));
    const el = h('div', 'pop menu modes-menu mm2');
    const DEFAULT_HINT = 'Claude gets the mode with your next message.';
    const hint = h('p', 'hint mm-desc', DEFAULT_HINT);
    const row = (m) => {
      const b = h('button', `item${m && rest(modesOnly()).includes(m) ? ' mm-rest' : ''}`,
        `<span class="mi" style="--c:${m ? m.color : 'var(--faint)'}">${m ? icon(m) : ''}</span><span class="mn">${esc(m ? m.name : 'No mode')}</span>` +
        `${m ? dots(m.cost) : ''}<span class="ck">${(m?.id || null) === cur ? ICON.check : ''}</span>`);
      b.dataset.desc = m ? m.description || '' : '';
      b.onclick = () => { closePop(); pick(id, m ? m.id : null, anchorEl); };
      return b;
    };
    const list = modesOnly();
    for (const m of shelf(list)) el.appendChild(row(m));
    const more = rest(list);
    if (more.length) {
      const showMore = more.some((m) => m.id === cur);
      const tog = h('button', 'item mm-more', `<span class="mi"></span><span class="mn">More</span><span class="chev">›</span>`);
      tog.setAttribute('aria-expanded', String(showMore));
      el.appendChild(tog);
      const box = h('div', 'mm-rest-box');
      box.hidden = !showMore;
      for (const m of more) box.appendChild(row(m));
      el.appendChild(box);
      tog.onclick = () => { box.hidden = !box.hidden; tog.setAttribute('aria-expanded', String(!box.hidden)); };
    }
    el.appendChild(row(null));

    const ads = addons();
    if (ads.length) {
      el.appendChild(h('div', 'sep'));
      const bar = h('div', 'mm-addons');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Add-ons');
      for (const a of ads) {
        const b = h('button', `item mm-addon${on.has(a.id) ? ' on' : ''}`, `<span class="mi" style="--c:${a.color}">${icon(a)}</span><span class="mn">${esc(a.name)}</span>`);
        b.setAttribute('aria-pressed', String(on.has(a.id)));
        b.style.setProperty('--c', a.color);
        b.dataset.desc = a.description || '';
        b.onclick = () => {
          const now = !on.has(a.id);
          if (now) on.add(a.id); else on.delete(a.id);
          b.classList.toggle('on', now);
          b.setAttribute('aria-pressed', String(now));
          hangar.setAddon(id, a.id, now);
        };
        bar.appendChild(b);
      }
      el.appendChild(bar);
    }
    el.appendChild(h('div', 'sep'));
    for (const [label, run] of [['Make a mode from this session', () => modeFromSession(id)], ['Edit modes', () => openLibrary()]]) {
      const b = h('button', 'item', esc(label));
      b.onclick = () => { closePop(); run(); };
      el.appendChild(b);
    }
    el.appendChild(hint);
    // The description shows in a fixed footer, so rows never change height under the mouse.
    const show = (b) => { hint.textContent = b?.dataset?.desc || DEFAULT_HINT; };
    el.querySelectorAll('.item').forEach((b) => {
      b.addEventListener('mouseenter', () => show(b));
      b.addEventListener('focus', () => show(b));
    });
    el.addEventListener('mouseleave', () => show(el.contains(document.activeElement) ? document.activeElement : null));
    openPop(el, anchorEl, { alignLeft: true, onKey: arrowNav(el) });
    ([...el.querySelectorAll('.item')].find((b) => b.querySelector('.ck svg')) || el.querySelector('.item')).focus();
  }

  function modeFromSession(id) {
    const n = state.tiles.findIndex((t) => t.id === id) + 1;
    const snap = state.tiles[n - 1];
    if (!snap) return;
    toggleOverseer(true, `Make a new Hangar mode from session ${n} ("${snap.name}"). Read its log and capture how I told it to work (rules, style, when to stop or ask), not the task itself. Show me the draft in a few lines, then save it with hangarctl mode-save once I agree.`);
  }

  // ---------- library and editor ----------

  let refresh = null;
  const blank = (kind = 'mode') => ({ kind, name: '', color: SWATCHES[all().length % SWATCHES.length], icon: kind === 'addon' ? 'check' : 'dot', cost: 1, guard: null, description: '', instructions: '', exitPhrases: [], exitTo: null, builtin: false });

  function openLibrary(selectId) {
    const el = h('div', 'pop modal modes-editor ml');
    openPop(el, null, { onClose: () => { refresh = null; } });
    let view = selectId ? 'edit' : 'grid';
    let current = selectId || null;
    let dirty = false;
    let draft = null;

    const card = (m) => {
      const b = h('button', `ml-card${isAddon(m) ? ' small' : ''}${m.hidden ? ' hidden-mode' : ''}`,
        `<span class="mi" style="--c:${m.color}">${icon(m)}</span><span class="mn">${esc(m.name)}</span>` +
        `${m.guard ? `<span class="ml-guard" title="${esc(GUARD_LABEL[m.guard])}">${MI.shield}</span>` : ''}${dots(m.cost)}` +
        `${m.hidden ? '<span class="tag">hidden</span>' : !m.builtin ? '<span class="tag">yours</span>' : m.edited ? '<span class="tag">edited</span>' : ''}`);
      b.type = 'button';
      b.style.setProperty('--c', m.color);
      b.title = m.description || m.name;
      b.onclick = () => { current = m.id; draft = null; dirty = false; view = 'edit'; draw(); };
      return b;
    };

    const drawGrid = () => {
      el.innerHTML = `<div class="me-head"><h3>Modes</h3><div class="grow"></div>
          <button class="btn small" data-import title="Import a mode file">${MI.file}Import</button>
          <button class="btn small" data-ask title="Ask the overseer">${ICON.spark}Ask the overseer</button>
          <button class="btn small" data-new>New mode</button></div>
        <div class="ml-body"><div class="ml-grid" data-shelf></div>
          <details class="ml-more"><summary>More</summary><div class="ml-grid" data-rest></div></details>
          <div class="ml-label">Add-ons</div><div class="ml-grid small" data-addons></div></div>`;
      const ms = modesOnly(true);
      shelf(ms).forEach((m) => $('[data-shelf]', el).appendChild(card(m)));
      rest(ms).forEach((m) => $('[data-rest]', el).appendChild(card(m)));
      addons(true).forEach((m) => $('[data-addons]', el).appendChild(card(m)));
      const det = $('.ml-more', el);
      try { det.open = localStorage.getItem('hangar.modes.more') === '1'; } catch {}
      det.ontoggle = () => { try { localStorage.setItem('hangar.modes.more', det.open ? '1' : '0'); } catch {} };
      $('[data-new]', el).onclick = () => { current = null; draft = blank(); dirty = true; view = 'edit'; draw(); $('[name=name]', el)?.focus(); };
      $('[data-import]', el).onclick = () => importMode();
      $('[data-ask]', el).onclick = () => { closePop(); toggleOverseer(true, 'Help me create a new Hangar mode. Ask me what the mode is for, then draft it and save it with hangarctl mode-save once I agree.'); };
      el.querySelector('.ml-card')?.focus();
    };

    const drawEdit = () => {
      const m = draft || modeById(current) || blank();
      const addon = isAddon(m);
      let color = m.color, ic = m.icon || 'dot', cost = m.cost ?? 1;
      el.innerHTML = `<div class="me-head"><button class="btn icon small" data-back aria-label="All modes">${MI.back}</button>
          <h3>${esc(m.id ? m.name : addon ? 'New add-on' : 'New mode')}</h3><div class="grow"></div>
          ${m.id ? `<button class="btn small" data-export title="Save as a file">${MI.file}Export</button>` : ''}</div>
        <form class="me-form" autocomplete="off">
          <div class="two">
            <label>Name<input class="field" name="name" maxlength="24" required></label>
            ${!m.id ? `<label>Kind<select class="field" name="kind"><option value="mode">Mode</option><option value="addon">Add-on</option></select></label>` : ''}
          </div>
          <label>Colour</label><div class="sw-slot"></div>
          <label>Icon</label><div class="ml-icons" role="radiogroup" aria-label="Icon"></div>
          <label>Shown in the menu<input class="field" name="description" maxlength="120" placeholder="One short line"></label>
          <label><span class="ml-row">Instructions for Claude<span class="grow"></span><span class="ml-est" aria-live="polite"></span></span>
            <textarea class="field mono" name="instructions" rows="9" placeholder="- One rule per line"></textarea></label>
          <div class="two">
            <label>Token cost<div class="ml-cost" role="radiogroup" aria-label="Token cost">${[0, 1, 2, 3].map((n) => `<button type="button" role="radio" data-cost="${n}" aria-label="${COST_WORD[n]}">${dots(n)}</button>`).join('')}</div></label>
            ${addon ? '' : `<label>Guard<select class="field" name="guard">${Object.entries(GUARD_LABEL).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>`}
          </div>
          ${addon ? '' : `<details class="me-more"${(m.exitPhrases || []).length || m.exitTo || m.tokenWarn ? ' open' : ''}><summary>More options</summary>
            <label>Ends when your whole message is<input class="field" name="exit" placeholder="start, go"></label>
            <div class="two">
              <label>Then switch to<select class="field" name="exitTo"><option value="">No mode</option>${modesOnly().filter((x) => x.id !== m.id).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
              <label>Warn me after (k tokens)<input class="field" name="tokenWarn" type="number" min="0" step="50" placeholder="off"></label>
            </div>
          </details>`}
          <div class="me-foot">
            ${m.id && m.builtin && (m.edited || m.hidden) ? '<button type="button" class="btn small" data-reset>Restore original</button>' : ''}
            ${m.id && !m.hidden ? `<button type="button" class="btn small danger" data-del>${m.builtin ? 'Hide' : 'Delete'}</button>` : ''}
            <div class="grow"></div>
            <button type="submit" class="btn primary">Save</button>
          </div>
        </form>`;
      const form = $('form', el);
      const F = form.elements;
      F.name.value = m.name;
      if (F.kind) F.kind.value = m.kind || 'mode';
      F.description.value = m.description || '';
      F.instructions.value = m.instructions || '';
      if (F.guard) F.guard.value = m.guard || '';
      if (F.exit) F.exit.value = (m.exitPhrases || []).join(', ');
      if (F.exitTo) F.exitTo.value = m.exitTo || '';
      if (F.tokenWarn) F.tokenWarn.value = m.tokenWarn || '';
      $('.sw-slot', form).replaceWith(swatches(color, (c) => { color = c; dirty = true; drawIcons(); }));
      const icons = $('.ml-icons', form);
      const drawIcons = () => {
        icons.innerHTML = '';
        for (const n of ICON_NAMES) {
          const b = h('button', `mi-btn${n === ic ? ' sel' : ''}`, MI[n]);
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(n === ic));
          b.setAttribute('aria-label', n);
          b.style.setProperty('--c', color);
          b.onclick = () => { ic = n; dirty = true; drawIcons(); };
          icons.appendChild(b);
        }
      };
      drawIcons();
      const drawCost = () => form.querySelectorAll('[data-cost]').forEach((b) => {
        const sel = Number(b.dataset.cost) === cost;
        b.classList.toggle('on', sel);
        b.setAttribute('aria-checked', String(sel));
      });
      form.querySelectorAll('[data-cost]').forEach((b) => { b.onclick = () => { cost = Number(b.dataset.cost); dirty = true; drawCost(); }; });
      drawCost();
      // Live size of what Claude receives, so modes stay short.
      const estEl = $('.ml-est', form);
      const drawEst = () => { const n = est(F.instructions.value); estEl.textContent = `~${n} tokens`; estEl.classList.toggle('warn', n > 400); };
      drawEst();
      F.instructions.addEventListener('input', drawEst);
      if (F.kind) F.kind.onchange = () => { draft = { ...collect(), kind: F.kind.value, id: null }; drawEdit(); };
      form.oninput = () => { dirty = true; };
      const collect = () => ({
        id: m.id, kind: F.kind ? F.kind.value : m.kind, name: F.name.value, color, icon: ic, cost,
        guard: F.guard ? F.guard.value || null : null, description: F.description.value, instructions: F.instructions.value,
        exitPhrases: F.exit ? F.exit.value : [], exitTo: F.exitTo ? F.exitTo.value || null : null,
        tokenWarn: F.tokenWarn ? Number(F.tokenWarn.value) || null : null,
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const saved = await hangar.saveMode(collect());
        current = saved.id; draft = null; dirty = false;
        flash(form, 'Saved');
      };
      const del = $('[data-del]', form);
      if (del) del.onclick = async () => {
        if (!m.builtin && !(await askInline(form, `Delete ${m.name}?`, 'Delete', true))) return;
        hangar.deleteMode(m.id);
        dirty = false;
        if (!m.builtin) { view = 'grid'; current = null; }
      };
      const rs = $('[data-reset]', form);
      if (rs) rs.onclick = async () => { await hangar.resetMode(m.id); dirty = false; };
      const ex = $('[data-export]', el);
      if (ex) ex.onclick = async () => { const p = await hangar.exportMode(m.id); if (p) flash(form, 'Exported'); };
      $('[data-back]', el).onclick = async () => {
        if (dirty && !(await askInline(form, 'Discard your changes?', 'Discard', true))) return;
        dirty = false; draft = null; view = 'grid'; draw();
      };
    };

    const draw = () => (view === 'grid' ? drawGrid() : drawEdit());
    // Re-render only when the modes themselves change (a save, an import, the overseer adding one).
    let seen = JSON.stringify(all());
    refresh = () => {
      const now = JSON.stringify(all());
      if (now === seen) return;
      seen = now;
      if (view === 'grid' || !dirty) draw();
    };
    draw();
  }

  function swatches(current, onPick) {
    const row = h('div', 'swatches');
    for (const c of SWATCHES) {
      const b = h('button', `sw${c === current ? ' sel' : ''}`);
      b.type = 'button';
      b.style.setProperty('--c', c);
      b.setAttribute('aria-label', `Colour ${c}`);
      b.onclick = () => { row.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); onPick(c); };
      row.appendChild(b);
    }
    return row;
  }

  // ---------- mode files ----------

  async function importMode(file) {
    const r = await hangar.importMode(file);
    if (!r) return;
    if (r.error) { notice(r.error); return; }
    openLibrary(r.mode.id);
  }
  function notice(text) {
    const id = state.tiles[0]?.id;
    if (id) tileNotice(id, esc(text)); else console.warn(text);
  }

  // A .hangar-mode.json dropped anywhere on the window is imported, not opened as a folder.
  const MODE_FILE = /\.hangar-mode\.json$/i;
  window.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => MODE_FILE.test(f.name));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    try { dragDepth = 0; } catch {}
    document.body.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
    for (const f of files) importMode(hangar.pathForFile(f));
  }, true);

  // ---------- one-click Review / Simplify (Claude Code's own commands) ----------

  const canRun = (snap) => !!snap && snap.kind !== 'shell' && snap.status !== 'exited' && snap.status !== 'starting';
  const RUNS = [
    { id: 'session.code-review', which: 'review', label: 'Review changes', cost: 2, aliases: ['code review', '/code-review'] },
    { id: 'session.simplify', which: 'simplify', label: 'Simplify changes', cost: 2, aliases: ['/simplify', 'clean up'] },
  ];
  /** Rows for the tile's ⋯ menu. */
  function moreItems(snap) {
    if (!canRun(snap)) return [];
    return RUNS.map((r) => ({ html: `${esc(r.label)}<span class="kb">${dots(r.cost)}</span>`, run: () => hangar.runCommand(snap.id, r.which) }));
  }

  // ---------- command registry ----------

  const C = HangarCommands;
  const claude = (cx) => !!cx.snap && cx.snap.kind !== 'shell';
  C.register(RUNS.map((r) => ({
    id: r.id, label: r.label, group: 'Actions', aliases: r.aliases, context: '●'.repeat(r.cost) + '○'.repeat(3 - r.cost),
    menu: { menu: 'Session', section: 'after' }, when: (cx) => canRun(cx.snap), run: (cx) => hangar.runCommand(cx.id, r.which),
  })));
  // One entry per mode (Until done asks for its goal), then add-on switches. Replaces app-commands' list.
  C.provide('modes', () => [
    ...modesOnly().map((m) => ({
      id: `mode.set:${m.id}`, label: m.name, group: 'Modes', aliases: ['mode', `mode ${m.name}`], color: m.color, isMode: true,
      menu: { menu: 'Modes', section: 'list' }, when: claude,
      run: (cx) => pick(cx.id, m.id),
      // ⌘↩ puts every Claude session in this mode.
      secondary: () => { for (const t of state.tiles) if (t.kind !== 'shell') pick(t.id, m.goal ? null : m.id); },
    })),
    { id: 'mode.none', label: 'No mode', group: 'Modes', menu: { menu: 'Modes', section: 'list' }, when: claude, run: (cx) => hangar.setMode(cx.id, null) },
    ...addons().map((a) => ({
      id: `addon.toggle:${a.id}`, group: 'Modes', aliases: ['add-on', 'addon', `add-on ${a.name}`], color: a.color,
      label: a.name, menu: { menu: 'Modes', section: 'addons' }, when: claude,
      context: 'Add-on',
      run: (cx) => { const on = (cx.snap?.mode?.addons || []).some((x) => x.id === a.id); hangar.setAddon(cx.id, a.id, !on); },
    })),
    { id: 'mode.edit', label: 'Edit modes…', group: 'Modes', aliases: ['mode library'], menu: { menu: 'Modes', section: 'edit' }, run: () => openLibrary() },
    { id: 'mode.import', label: 'Import mode…', group: 'Modes', aliases: ['mode file', 'open mode'], menu: { menu: 'Modes', section: 'edit' }, run: () => importMode() },
  ]);

  window.HangarModes = { drawChip, pick, openPicker, openLibrary, openGoal, modeFromSession, moreItems, importMode, refresh: () => refresh?.(), dots, icon };
})();
