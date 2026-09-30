(function () {
  'use strict';
  const W = window;
  const E = W.FLRPG_CONTINUOUS_CORE;
  const P = W.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
  const H = W.FLRPG_LIVE_HYBRID_SESSION_V02;
  if (!E || !P || !H) throw new Error('V63_FOCUS_APIS_MISSING');

  const team = new URLSearchParams(W.location.search).get('team') === 'AWAY' ? 'AWAY' : 'HOME';
  const prefix = team === 'HOME' ? 'H' : 'A';
  const heroId = `${prefix}-ST`;
  const select = document.getElementById('heroPlayer');
  if (team === 'AWAY') select.add(new Option('AWAY ST · 집중 확인', heroId));
  select.value = heroId;
  select.disabled = true;

  const originalCreate = H.createSession;
  H.createSession = function (opts) {
    return originalCreate.call(this, { ...opts, heroTeam: team, heroRole: 'ST', heroPlayerId: heroId });
  };

  let placed = false;
  const originalInspect = P.inspect;
  P.inspect = function (session) {
    if (!placed && session.m?._resolutionLease) {
      const m = session.m;
      const at = (x, y) => team === 'HOME' ? { x, y } : { x: 105 - x, y: 68 - y };
      const hero = m.playersById[heroId];
      const target = m.playersById[`${prefix}-LCM`];
      const second = m.playersById[`${prefix}-RW`];
      if (!hero || !target || !second) throw new Error('V63_FOCUS_PLAYERS_MISSING');
      placed = true;
      m.restart = null;
      m.setPieceLive = null;
      m.phase = 'OPEN_PLAY';
      for (const player of m.players) {
        Object.assign(player, { ...at(player.team === team ? 5 : 100, 5), vx: 0, vy: 0,
          nextThink: m.time, lockTargetUntil: 0 });
      }
      Object.assign(hero, at(40, 34));
      Object.assign(target, { ...at(56, 34), vx: team === 'HOME' ? 4 : -4,
        tacticalTask: 'ST_RELEASE_RUN', runUntil: m.time + 10, runType: 'RELEASE' });
      Object.assign(second, at(48, 44));
      for (const player of m.players) { player.tx = player.x; player.ty = player.y; }
      E.choiceActionBridge().setControlled(m, hero, true);
      hero.nextThink = m.time;
      hero.controlledSince = m.time - 1;
    }
    return originalInspect.apply(this, arguments);
  };
})();
