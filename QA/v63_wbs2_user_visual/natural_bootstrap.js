(function () {
  'use strict';
  const H = window.FLRPG_LIVE_HYBRID_SESSION_V02;
  if (!H) throw new Error('V63_NATURAL_HYBRID_API_MISSING');
  const params = new URLSearchParams(window.location.search);
  const parsed = Number(params.get('seed'));
  const number = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  const input = document.getElementById('v63SeedInput');
  input.value = String(number);
  let currentSeed = '';

  function showSeed() {
    const label = document.getElementById('heroSeedInfo');
    if (label) label.textContent = `현재 SEED: ${currentSeed} · 같은 SEED=동일 재현 · 새 SEED=다음 시드`;
  }
  function go(seed) {
    if (!Number.isSafeInteger(seed) || seed < 1) { input.reportValidity(); return; }
    window.location.assign(`natural.html?seed=${seed}`);
  }
  const originalCreate = H.createSession;
  H.createSession = function (opts) {
    currentSeed = `LIVE-V03-${number}-${opts.heroPlayerId}`;
    const session = originalCreate.call(this, { ...opts, seed: currentSeed });
    queueMicrotask(showSeed);
    return session;
  };

  document.getElementById('v63SeedGo').onclick = () => go(Number(input.value));
  document.getElementById('v63SeedNext').onclick = () => go(number + 1);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') go(Number(input.value)); });
  // step71 initializes this button synchronously after this bootstrap runs.
  queueMicrotask(() => {
    document.getElementById('heroNewSeed').onclick = () => go(number + 1);
    showSeed();
  });
})();
