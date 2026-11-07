/* global hangar, h, $, esc, openPop, closePop */
// The warning when the claude command can't be found: at launch and when starting a session.
// The command comes from the official guide, which also covers anything that goes wrong.
'use strict';

(function (root) {
  const GUIDE = 'https://code.claude.com/docs/en/quickstart';
  const install = (platform) => (platform === 'win'
    ? { where: 'Open PowerShell and run', command: 'irm https://claude.ai/install.ps1 | iex' }
    : { where: 'Open a terminal and run', command: 'curl -fsSL https://claude.ai/install.sh | bash' });
  const pure = { GUIDE, install };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  function warn() {
    const how = install(/^Win/.test(navigator.platform) ? 'win' : 'unix');
    const el = h('div', 'pop modal missing-pop');
    el.setAttribute('aria-label', "Claude Code isn't installed");
    el.innerHTML = `<h3>Claude Code isn't installed</h3>
      <p>Basanite runs Claude Code in every session, and can't find the <code>claude</code> command on this computer.</p>
      <ol>
        <li>${esc(how.where)}:
          <div class="mp-cmd"><code>${esc(how.command)}</code><button class="btn small" data-copy>Copy</button></div></li>
        <li>Close Basanite and open it again.</li>
      </ol>
      <p class="mp-faint">Already installed? Check that <code>claude</code> works in a new terminal. The guide can help if it doesn't.</p>
      <div class="row end"><button class="btn" data-close>Close</button><button class="btn primary" data-guide>Open install guide</button></div>`;
    const copy = $('[data-copy]', el);
    copy.onclick = () => { navigator.clipboard.writeText(how.command); copy.textContent = 'Copied'; };
    $('[data-guide]', el).onclick = () => window.open(GUIDE);
    $('[data-close]', el).onclick = () => closePop();
    openPop(el, null);
    $('[data-guide]', el).focus();
  }

  hangar.onClaudeMissing(() => warn());
  root.HangarClaudeCheck = { ...pure, warn, atLaunch: () => hangar.claudeMissing().then((missing) => { if (missing) warn(); return missing; }) };
})(typeof window !== 'undefined' ? window : globalThis);
