// Points the hero's download button at the build for this computer. Phones, Linux
// and anything unknown keep the plain "Download" that scrolls to every build.
(function () {
  'use strict';
  const a = document.getElementById('dl-main');
  if (!a) return;
  const ua = navigator.userAgent;
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.userAgentData && navigator.userAgentData.mobile);
  if (mobile) return;
  const label = a.querySelector('span');
  const pick = (href, text) => { a.href = href; label.textContent = text; };
  if (/Mac/i.test(plat)) {
    // Browsers don't tell Apple silicon from Intel reliably; Apple silicon is the safe bet
    // for any Mac sold since 2020, and the Intel link sits right under the button.
    pick(a.dataset.macArm, 'Download for Mac');
  } else if (/Win/i.test(plat)) {
    pick(a.dataset.win, 'Download for Windows');
    const ud = navigator.userAgentData;
    if (ud && ud.getHighEntropyValues) {
      ud.getHighEntropyValues(['architecture']).then((v) => {
        if (v.architecture === 'arm') pick(a.dataset.winArm, 'Download for Windows on ARM');
      }).catch(() => {});
    }
  }
})();
