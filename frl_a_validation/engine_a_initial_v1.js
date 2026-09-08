/* Independent V44 experiment. No FLR runtime imports. Units: metres / causal seconds. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AstraFootball = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DT = 0.05;
  const RESTORE = Symbol('private restore construction');
  const CLOCK_RATE = 5400 / 1320;
  const ROLES = Object.freeze(['GK', 'LB', 'LCB', 'RCB', 'RB', 'DM', 'LCM', 'RCM', 'LF', 'CF', 'RF']);
  const HOME = [[5, 34], [25, 9], [23, 25], [23, 43], [25, 59], [38, 34], [50, 23], [50, 45], [71, 8], [74, 34], [71, 60]];
  const DUTIES = Object.freeze(['GK', 'SUPPORT', 'RUN', 'CARRY', 'PRESS', 'MARK', 'COVER', 'RECOVERY', 'RECEIVE', 'RESTART']);
  const NOTABLE = new Set(['shot', 'goal', 'save', 'claim', 'tackle', 'loose', 'foul', 'block', 'corner', 'offside']);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const copy = value => JSON.parse(JSON.stringify(value));
  const round = n => Math.round(n * 1000) / 1000;
  function hashSeed(seed) {
    let n = 2166136261;
    for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n >>> 0 || 1;
  }
  // This is the only randomness source. Its entire evolving state is in MatchState.
  function random(s) {
    let x = s.rng.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    s.rng.state = x >>> 0;
    s.rng.draws++;
    return s.rng.state / 4294967296;
  }
  function direction(s, team) { return (team === 0 ? 1 : -1) * (s.half === 1 ? 1 : -1); }
  function local(s, team, x, y) { return direction(s, team) === 1 ? { x, y } : { x: 105 - x, y: 68 - y }; }
  function world(s, team, x, y) { return local(s, team, x, y); }
  function opponents(s, p) { return s.players.filter(q => q.team !== p.team); }
  function teammates(s, p) { return s.players.filter(q => q.team === p.team && q.id !== p.id); }
  function event(s, type, team, text, playerId = null, detail = {}) {
    const e = { id: s.events.length, tick: s.tick, time: round(s.time), clock: round(s.clock), half: s.half,
      type, team, text, playerId, notable: NOTABLE.has(type), ...detail };
    s.events.push(e);
    s.currentEvent = e.id;
    return e;
  }
  function makeStats() {
    return { goals: 0, shots: 0, shotsOnTarget: 0, saves: 0, claims: 0, passes: 0, completedPasses: 0,
      carries: 0, takeOns: 0, challenges: 0, retained: 0, defenderWins: 0, looseOutcomes: 0,
      fouls: 0, deflectionsOut: 0, blocks: 0, possessionTicks: 0, corners: 0, throwIns: 0,
      goalKicks: 0, freeKicks: 0, kickoffs: 0, offsides: 0 };
  }
  function createState(seed) {
    const s = { version: 'ASTRA-659-1', seed: String(seed), rng: { algorithm: 'xorshift32', state: hashSeed(seed), draws: 0 },
      tick: 0, time: 0, clock: 0, half: 1, phase: 'restart', paused: true, score: [0, 0],
      possession: null, lastPossession: null, transitionAt: 0, currentEvent: null, input: null,
      teams: [{ name: 'Red', formation: '4-1-2-3', roles: [...ROLES] }, { name: 'Blue', formation: '4-1-2-3', roles: [...ROLES] }],
      players: [], ball: { x: 52.5, y: 34, z: 0.15, vx: 0, vy: 0, vz: 0, owner: null,
        mode: 'dead', lastTouch: null, releasedAt: -100, flight: null },
      restart: null, events: [], history: [], stats: [makeStats(), makeStats()],
      diagnostics: { contacts: 0, markingSamples: 0, markingGlueTicks: 0, handoffs: 0,
        wideThreatSamples: 0, wideAbandonmentTicks: 0, massChaseTicks: 0, shapeSamples: 0,
        widths: [0, 0], depths: [0, 0], minWidth: [100, 100], maxDepth: [0, 0],
        ballTruthConflicts: 0, lowPressureChallenges: 0, playerDistance: Array(22).fill(0),
        maxStationarySeconds: Array(22).fill(0), stationarySeconds: Array(22).fill(0) } };
    for (let team = 0; team < 2; team++) for (let i = 0; i < 11; i++) {
      const pos = world(s, team, ...HOME[i]);
      s.players.push({ id: team * 11 + i, team, role: ROLES[i], slot: i, x: pos.x, y: pos.y, vx: 0, vy: 0,
        target: { ...pos }, duty: i === 0 ? 'GK' : 'SUPPORT', markId: null, pressId: null,
        decisionIn: 0.2 + random(s) * 0.5, challengeIn: 0, controlSince: -100, intent: null,
        attributes: { pace: 5.1 + random(s) * 1.6, control: 0.55 + random(s) * 0.4,
          passing: 0.55 + random(s) * 0.4, shooting: 0.5 + random(s) * 0.45,
          tackling: 0.5 + random(s) * 0.45, keeping: i === 0 ? 0.7 + random(s) * 0.25 : 0.1 } });
    }
    startRestart(s, 'kickoff', 0, { x: 52.5, y: 34 }, true);
    setTargets(s);
    integratePlayers(s);
    integrateBall(s);
    record(s);
    return s;
  }
  function startRestart(s, type, team, spot, reset = false) {
    s.phase = 'restart';
    s.possession = null;
    s.input = null;
    s.ball.owner = null;
    s.ball.mode = 'dead';
    s.ball.flight = null;
    s.ball.vx = s.ball.vy = s.ball.vz = 0;
    const taker = s.players.filter(p => p.team === team && (type === 'goalKick' ? p.role === 'GK' : p.role !== 'GK'))
      .sort((a, b) => (type === 'kickoff' ? (a.role === 'CF' ? -1 : b.role === 'CF' ? 1 : a.id - b.id) : distance(a, spot) - distance(b, spot)))[0];
    s.restart = { type, team, spot: { x: clamp(spot.x, 0.2, 104.8), y: clamp(spot.y, 0.2, 67.8) },
      takerId: taker.id, elapsed: 0, wait: type === 'kickoff' ? 2.5 : 1.5, reset };
    const key = { kickoff: 'kickoffs', goalKick: 'goalKicks', throwIn: 'throwIns', corner: 'corners', freeKick: 'freeKicks' }[type];
    if (key) s.stats[team][key]++;
    event(s, type, team, `${s.teams[team].name} ${type.replace(/([A-Z])/g, ' $1').toLowerCase()}`, taker.id);
  }
  function setPossession(s, p) {
    if (s.lastPossession !== p.team) { s.transitionAt = s.time; s.lastPossession = p.team; }
    s.possession = p.team;
    s.ball.owner = p.id;
    s.ball.mode = 'controlled';
    s.ball.flight = null;
    s.ball.lastTouch = p.id;
    s.ball.vx = s.ball.vy = s.ball.vz = 0;
    p.controlSince = s.time;
    p.intent = null;
    p.decisionIn = 0.2 + random(s) * 0.4;
  }
  function shapeTarget(s, p, attacking) {
    const b = local(s, p.team, s.ball.x, s.ball.y);
    const i = p.slot;
    if (i === 0) return world(s, p.team, attacking ? clamp(b.x * 0.15, 4, 15) : clamp(3 + b.x * 0.07, 2, 8),
      clamp(34 + (b.y - 34) * (attacking ? 0.16 : 0.23), 26, 42));
    const line = attacking ? clamp(b.x - 29, 21, 58) : clamp(b.x - 17, 12, 45);
    let x = i <= 4 ? line : i === 5 ? line + 12 : i <= 7 ? line + 23 : line + 36;
    if (attacking && (i === 1 || i === 4)) x += 5;
    if (attacking && i >= 8) x = Math.max(x, b.x + 10);
    let y = HOME[i][1];
    if (!attacking) y = 34 + (y - 34) * 0.8;
    y += (b.y - 34) * (i <= 4 ? 0.14 : 0.22);
    // Small support adjustments depend on current time, ball and role, never future events.
    if (attacking && i > 4) {
      x += Math.sin(s.time * 0.36 + i * 1.7) * 2.4;
      y += Math.sin(s.time * 0.27 + i) * 2;
    }
    return world(s, p.team, clamp(x, 4, 98), clamp(y, 4, 64));
  }
  function setTargets(s) {
    const owner = s.ball.owner === null ? null : s.players[s.ball.owner];
    const attackTeam = owner ? owner.team : s.possession ?? s.lastPossession;
    const play = s.phase === 'play';
    for (const p of s.players) {
      p.target = shapeTarget(s, p, p.team === attackTeam);
      p.duty = p.role === 'GK' ? 'GK' : p.team === attackTeam ? 'SUPPORT' : 'COVER';
      p.markId = null;
    }
    if (!play) {
      if (!s.restart) return;
      const r = s.restart;
      for (const p of s.players) {
        p.duty = 'RESTART';
        if (r.type === 'kickoff') {
          const h = HOME[p.slot];
          p.target = world(s, p.team, p.slot === 0 ? 5 : h[0] * 0.63, h[1]);
          if (p.team === r.team && p.role === 'CF') p.target = { x: 52.5 - direction(s, p.team) * 0.5, y: 34 };
          if (p.team === r.team && p.role === 'RCM') p.target = world(s, p.team, 47, 39);
        } else if (r.type === 'corner') {
          if (p.team === r.team && p.slot >= 7) p.target = world(s, p.team, 94 + (p.slot % 2) * 3, 27 + (p.slot - 7) * 4);
          if (p.team !== r.team && p.slot > 0 && p.slot <= 7) p.target = world(s, p.team, 6 + (p.slot % 3) * 3, 22 + p.slot * 3);
        }
        if (p.id === r.takerId) p.target = { ...r.spot };
        if (p.team !== r.team && p.role !== 'GK') {
          const d = distance(p.target, r.spot), radius = r.type === 'throwIn' ? 2.5 : 9.15;
          if (d < radius) {
            const dx = p.target.x - r.spot.x || -direction(s, r.team), dy = p.target.y - r.spot.y;
            const norm = Math.hypot(dx, dy);
            p.target = { x: clamp(r.spot.x + dx / norm * radius, 1, 104), y: clamp(r.spot.y + dy / norm * radius, 1, 67) };
          }
        }
      }
      return;
    }
    for (let team = 0; team < 2; team++) {
      const ours = s.players.filter(p => p.team === team && p.role !== 'GK');
      if (owner && owner.team !== team) {
        // Only one primary presser. Distance plus role/zone cost prevents arbitrary fullback excursions.
        const b = local(s, team, s.ball.x, s.ball.y);
        const ranked = ours.map(p => {
          const q = local(s, team, p.x, p.y);
          const wideCost = (p.role === 'LB' && b.y > 39) || (p.role === 'RB' && b.y < 29) ? 15 : 0;
          const cbCost = (p.role === 'LCB' || p.role === 'RCB') && distance(p, owner) > 6 ? 12 : 0;
          return { p, cost: distance(p, owner) + wideCost + cbCost + (q.x < b.x - 12 ? 4 : 0) };
        }).sort((a, b2) => a.cost - b2.cost || a.p.id - b2.p.id);
        const presser = ranked[0].p;
        if (presser.pressId !== owner.id) s.diagnostics.handoffs++;
        presser.pressId = owner.id;
        presser.duty = 'PRESS';
        presser.target = { x: clamp(owner.x + owner.vx * 0.16 - direction(s, owner.team) * 0.65, 0.5, 104.5),
          y: clamp(owner.y + owner.vy * 0.16, 0.5, 67.5) };
        for (const p of ours) {
          if (p === presser) continue;
          const q = local(s, team, p.x, p.y);
          if (q.x > b.x + 8 && s.time - s.transitionAt < 4) p.duty = 'RECOVERY';
          const threats = opponents(s, p).filter(o => o.role !== 'GK').map(o => ({ o, q: local(s, team, o.x, o.y) }))
            .filter(o => o.q.x < 65 && Math.abs(o.q.y - HOME[p.slot][1]) < (p.slot <= 4 ? 15 : 12));
          threats.sort((a, b2) => (a.q.x + Math.abs(a.q.y - HOME[p.slot][1]) * 0.7) - (b2.q.x + Math.abs(b2.q.y - HOME[p.slot][1]) * 0.7));
          if (threats.length && p.slot <= 7) {
            const threat = threats[0];
            const anchor = local(s, team, p.target.x, p.target.y);
            p.duty = 'MARK'; p.markId = threat.o.id;
            // Goal-side band, deliberately neither the opponent's position nor a fixed glued offset.
            p.target = world(s, team, clamp(Math.min(anchor.x + 3, threat.q.x - 2.8), 4, 65),
              clamp(anchor.y * 0.4 + threat.q.y * 0.6, 4, 64));
          }
        }
      } else if (owner && owner.team === team) {
        const o = local(s, team, owner.x, owner.y);
        for (const p of ours) {
          if (p.id === owner.id) {
            p.duty = 'CARRY';
            const close = opponents(s, p).filter(q => distance(q, p) < 5);
            let avoidY = 0;
            for (const q of close) avoidY += (p.y - q.y) / Math.max(1, distance(q, p)) * 2;
            const goalY = o.x > 77 ? (34 - o.y) * 0.25 : 0;
            const aim = world(s, team, clamp(o.x + 9, 1, 102), clamp(o.y + goalY, 3, 65));
            p.target = p.intent && p.intent.until > s.time ? { ...p.intent.aim }
              : { x: aim.x, y: clamp(aim.y + avoidY, 2, 66) };
            if (p.intent && p.intent.until <= s.time) p.intent = null;
          } else if (p.slot >= 8) {
            p.duty = 'RUN';
            const target = local(s, team, p.target.x, p.target.y);
            const defenders = s.players.filter(q => q.team !== team).map(q => local(s, team, q.x, q.y).x).sort((a, b) => b - a);
            // Active runs stay just onside until the pass is actually struck.
            target.x = Math.min(target.x, Math.max(o.x, defenders[1] - 0.8));
            if (o.x > 78) target.y = p.role === 'CF' ? 34 : p.role === 'LF' ? 22 : 46;
            p.target = world(s, team, target.x, target.y);
          }
        }
      } else if (s.ball.owner === null) {
        const ranked = ours.slice().sort((a, b) => distance(a, s.ball) - distance(b, s.ball));
        for (const p of ranked.slice(0, 2)) {
          p.duty = 'RECEIVE';
          p.target = { x: clamp(s.ball.x + s.ball.vx * 0.22, 1, 104), y: clamp(s.ball.y + s.ball.vy * 0.22, 1, 67) };
        }
      }
      const keeper = s.players[team * 11];
      const kb = local(s, team, s.ball.x, s.ball.y);
      if (kb.x < 18 && kb.y > 13 && kb.y < 55 && s.ball.owner === null) {
        keeper.target = { x: clamp(s.ball.x + s.ball.vx * 0.08, team === (s.half === 1 ? 0 : 1) ? 1 : 87, team === (s.half === 1 ? 0 : 1) ? 18 : 104),
          y: clamp(s.ball.y + s.ball.vy * 0.1, 23, 45) };
      }
    }
    if (s.ball.flight && s.ball.flight.type === 'pass') {
      const receiver = s.players[s.ball.flight.targetId];
      if (receiver) {
        receiver.duty = 'RECEIVE';
        receiver.target = { x: clamp(s.ball.x + s.ball.vx * 0.22, 1, 104), y: clamp(s.ball.y + s.ball.vy * 0.22, 1, 67) };
      }
    }
  }
  // The sole ongoing player-coordinate integrator, including explicit dead-ball formation resets.
  function integratePlayers(s) {
    const resetting = s.restart && s.restart.reset;
    const desired = s.players.map(p => {
      if (resetting) return { x: p.target.x, y: p.target.y, vx: 0, vy: 0, reset: true };
      let dx = p.target.x - p.x, dy = p.target.y - p.y;
      const dist = Math.hypot(dx, dy);
      const max = p.attributes.pace * (p.duty === 'CARRY' ? 0.73 : p.duty === 'SUPPORT' || p.duty === 'MARK' ? 0.78 : 1);
      let vx = dist > 0.1 ? dx / dist * Math.min(max, dist * 2.5) : 0;
      let vy = dist > 0.1 ? dy / dist * Math.min(max, dist * 2.5) : 0;
      for (const q of s.players) {
        if (q.id === p.id) continue;
        dx = p.x - q.x; dy = p.y - q.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.05 && d > 0.01) { vx += dx / d * (1.05 - d) * 3; vy += dy / d * (1.05 - d) * 3; }
      }
      const acceleration = 9 * DT, change = Math.hypot(vx - p.vx, vy - p.vy);
      const blend = change > acceleration ? acceleration / change : 1;
      vx = p.vx + (vx - p.vx) * blend; vy = p.vy + (vy - p.vy) * blend;
      const speed = Math.hypot(vx, vy);
      if (speed > max) { vx *= max / speed; vy *= max / speed; }
      return { x: clamp(p.x + vx * DT, 0.25, 104.75), y: clamp(p.y + vy * DT, 0.25, 67.75), vx, vy };
    });
    s.players.forEach((p, i) => {
      const n = desired[i], d = Math.hypot(n.x - p.x, n.y - p.y);
      if (!n.reset && s.phase === 'play') {
        s.diagnostics.playerDistance[i] += d;
        s.diagnostics.stationarySeconds[i] = d < 0.008 ? s.diagnostics.stationarySeconds[i] + DT : 0;
        s.diagnostics.maxStationarySeconds[i] = Math.max(s.diagnostics.maxStationarySeconds[i], s.diagnostics.stationarySeconds[i]);
      }
      p.x = n.x; p.y = n.y; p.vx = n.vx; p.vy = n.vy;
      p.decisionIn -= DT; p.challengeIn = Math.max(0, p.challengeIn - DT);
    });
    if (resetting) s.restart.reset = false;
  }
  function laneClearance(s, p, q) {
    const dx = q.x - p.x, dy = q.y - p.y, length2 = dx * dx + dy * dy;
    let clearance = 20;
    for (const o of opponents(s, p)) {
      const t = ((o.x - p.x) * dx + (o.y - p.y) * dy) / Math.max(0.1, length2);
      if (t > 0.06 && t < 1.02) clearance = Math.min(clearance, Math.hypot(o.x - p.x - t * dx, o.y - p.y - t * dy));
    }
    return clearance;
  }
  function passOptions(s, p, restart = false) {
    const pos = local(s, p.team, p.x, p.y);
    return teammates(s, p).map(q => {
      const d = distance(p, q), t = local(s, p.team, q.x, q.y);
      const space = Math.min(...opponents(s, p).map(o => distance(o, q)));
      const lane = laneClearance(s, p, q);
      const progress = t.x - pos.x;
      const central = pos.x > 77 ? (Math.abs(pos.y - 34) - Math.abs(t.y - 34)) * 0.11 : 0;
      const score = Math.min(progress, 22) * 0.12 + Math.min(space, 10) * 0.35 + Math.min(lane, 7) * 0.55
        - Math.abs(d - 16) * 0.09 + central - (q.role === 'GK' ? 1.8 : 0);
      return { q, d, lane, score };
    }).filter(o => o.d > 4 && o.d < (restart ? 55 : 40)).sort((a, b) => b.score - a.score || a.q.id - b.q.id);
  }
  function launch(s, p, type, target, loft = 0) {
    const b = s.ball;
    const pressure = Math.min(...opponents(s, p).map(q => distance(q, p)));
    let tx = target.x, ty = target.y;
    const accuracy = type === 'shot' ? p.attributes.shooting : p.attributes.passing;
    const spread = (1 - accuracy) * (type === 'shot' ? 7 : 3) + Math.max(0, 2.5 - pressure) * 0.35;
    tx += (random(s) - 0.5) * spread * (type === 'shot' ? 0 : 1);
    ty += (random(s) - 0.5) * spread;
    const dx = tx - b.x, dy = ty - b.y, length = Math.hypot(dx, dy);
    const speed = type === 'shot' ? 23 + p.attributes.shooting * 8 : clamp(10 + length * 0.36, 12, 23);
    b.vx = dx / Math.max(0.1, length) * speed;
    b.vy = dy / Math.max(0.1, length) * speed;
    b.vz = loft;
    b.owner = null; b.mode = 'flight'; b.lastTouch = p.id; b.releasedAt = s.time;
    b.flight = { type, team: p.team, kickerId: p.id, targetId: target.id ?? null, offsideIds: [] };
    p.decisionIn = 0.6;
    if (type === 'pass') {
      // Record current offside position at the kick, NOT a future infringement/result.
      const defenders = opponents(s, p).map(q => local(s, p.team, q.x, q.y).x).sort((a, b2) => b2 - a);
      const bx = local(s, p.team, b.x, b.y).x;
      b.flight.offsideIds = teammates(s, p).filter(q => { const x = local(s, p.team, q.x, q.y).x;
        return x > 52.5 && x > bx && x > defenders[1]; }).map(q => q.id);
      s.stats[p.team].passes++;
      event(s, 'pass', p.team, `${p.role} → ${target.role || 'space'}${loft > 0 ? ' · lofted pass' : ''}`, p.id, { targetId: target.id ?? null });
    } else {
      s.stats[p.team].shots++;
      const e = event(s, 'shot', p.team, `${p.role} shoots`, p.id);
      b.flight.shotEventId = e.id;
      b.flight.onTargetCounted = false;
    }
  }
  function act(s) {
    if (s.ball.owner === null || s.phase !== 'play') return;
    const p = s.players[s.ball.owner];
    if (s.input) {
      const input = s.input; s.input = null;
      if (input.playerId === p.id) {
        if (input.type === 'pass') launch(s, p, 'pass', s.players[input.targetId], input.loft || 0);
        if (input.type === 'shot') launch(s, p, 'shot', input.aim, input.loft);
        if (input.type === 'carry') { p.intent = { aim: { ...input.aim }, until: s.time + 0.5 }; p.target = { ...input.aim }; p.decisionIn = 0.5; }
        return;
      }
    }
    if (p.decisionIn > 0) return;
    const pos = local(s, p.team, p.x, p.y);
    const near = opponents(s, p).slice().sort((a, b) => distance(a, p) - distance(b, p))[0];
    const pressure = distance(p, near);
    const goal = world(s, p.team, 105, 34);
    const goalDistance = distance(p, goal), angle = Math.abs(pos.y - 34);
    const lane = laneClearance(s, p, goal);
    const options = passOptions(s, p), best = options[0];
    if (p.role !== 'GK' && goalDistance < 27 && angle < 19 && (lane > 1.5 || goalDistance < 12 || pressure < 2)) {
      // Aim is a physical action; whether it reaches the goal or keeper remains undecided.
      const keeper = s.players[(1 - p.team) * 11];
      const aimY = 34 + (keeper.y < 34 ? 1 : -1) * (1 + p.attributes.shooting * 1.5);
      launch(s, p, 'shot', { x: goal.x, y: aimY }, 3 + random(s) * 3);
      return;
    }
    const held = s.time - p.controlSince;
    const ahead = (near.x - p.x) * direction(s, p.team) > -0.5;
    const isolated = opponents(s, p).filter(q => distance(q, p) < 7).length === 1;
    if (p.role !== 'GK' && pressure > 1.8 && pressure < 4.5 && ahead && isolated
      && p.attributes.control > near.attributes.tackling && (!best || best.lane < 2.2 || best.score < 5)) {
      s.stats[p.team].takeOns++;
      event(s, 'takeOn', p.team, `${p.role} takes on ${near.role}`, p.id);
      p.decisionIn = 0.55;
      return;
    }
    if (best && (p.role === 'GK' || pressure < 4 || held > 2.8 || (best.score > 7 && held > 0.7) || pos.x > 94)) {
      const candidates = options.slice(0, 3);
      const weights = candidates.map(o => Math.exp((o.score - best.score) * 1.3));
      let r = random(s) * weights.reduce((a, b) => a + b, 0), chosen = candidates[0];
      for (let i = 0; i < candidates.length; i++) { r -= weights[i]; if (r <= 0) { chosen = candidates[i]; break; } }
      const cross = pos.x > 76 && angle > 17 && local(s, p.team, chosen.q.x, chosen.q.y).x > 83;
      const t = { ...chosen.q, x: chosen.q.x + chosen.q.vx * 0.25, y: chosen.q.y + chosen.q.vy * 0.25 };
      launch(s, p, 'pass', t, cross ? 5.5 + chosen.d * 0.1 : 0);
      return;
    }
    if (pressure < 3.5 && ahead) { s.stats[p.team].takeOns++; event(s, 'takeOn', p.team, `${p.role} takes on ${near.role}`, p.id); }
    else s.stats[p.team].carries++;
    p.decisionIn = 0.5 + random(s) * 0.6;
  }
  function challenge(s) {
    if (s.ball.owner === null || s.phase !== 'play') return;
    const p = s.players[s.ball.owner];
    if (s.time - p.controlSince < 0.25) return;
    const candidates = opponents(s, p).filter(q => q.role !== 'GK' && q.challengeIn === 0 && distance(q, p) < 1.45)
      .sort((a, b) => distance(a, p) - distance(b, p));
    if (!candidates.length) return;
    const q = candidates[0], d = distance(q, p);
    s.diagnostics.contacts++;
    s.stats[q.team].challenges++;
    if (d > 1.45) s.diagnostics.lowPressureChallenges++;
    q.challengeIn = 0.9 + random(s) * 0.6;
    const fromBehind = (q.x - p.x) * direction(s, p.team) < -0.45;
    const relativeSpeed = Math.hypot(q.vx - p.vx, q.vy - p.vy);
    const foul = 0.035 + (fromBehind ? 0.12 : 0) + Math.max(0, relativeSpeed - 5) * 0.018;
    const clean = clamp(0.28 + (q.attributes.tackling - p.attributes.control) * 0.35 + (1.45 - d) * 0.1 - (fromBehind ? 0.07 : 0), 0.12, 0.55);
    const r = random(s);
    if (r < foul) {
      s.stats[q.team].fouls++;
      event(s, 'foul', q.team, `${q.role} fouls ${p.role}`, q.id);
      startRestart(s, 'freeKick', p.team, { x: p.x, y: p.y });
    } else if (r < foul + clean) {
      s.stats[q.team].defenderWins++;
      event(s, 'tackle', q.team, `${q.role} wins the ball from ${p.role}`, q.id);
      setPossession(s, q);
      q.decisionIn = 0.4;
    } else if (r < foul + clean + 0.25) {
      s.stats[q.team].looseOutcomes++;
      event(s, 'loose', q.team, `${q.role} pokes it loose`, q.id);
      const angle = Math.atan2(p.y - q.y, p.x - q.x) + (random(s) - 0.5) * 2;
      s.ball.owner = null; s.ball.mode = 'loose'; s.ball.flight = null; s.possession = null;
      s.ball.vx = Math.cos(angle) * 6; s.ball.vy = Math.sin(angle) * 6; s.ball.vz = 0.7;
      s.ball.lastTouch = q.id; s.ball.releasedAt = s.time;
    } else {
      s.stats[q.team].retained++;
      event(s, 'retain', p.team, `${p.role} shields against ${q.role}`, p.id);
    }
  }
  function segmentClosest(ax, ay, bx, by, px, py) {
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(0.000001, dx * dx + dy * dy), 0, 1);
    return { t, distance: Math.hypot(px - ax - dx * t, py - ay - dy * t) };
  }
  function countOnTarget(s, flight) {
    if (flight && flight.type === 'shot' && !flight.onTargetCounted) {
      s.stats[flight.team].shotsOnTarget++;
      flight.onTargetCounted = true;
    }
  }
  function touchFreeBall(s, old) {
    const b = s.ball;
    if (s.time - b.releasedAt < 0.12) return false;
    const speed = Math.hypot(b.vx, b.vy);
    const hits = [];
    for (const p of s.players) {
      if (p.id === b.lastTouch && s.time - b.releasedAt < 0.45) continue;
      const own = local(s, p.team, p.x, p.y);
      const keeper = p.role === 'GK' && own.x < 16.5 && Math.abs(own.y - 34) < 20.16;
      const nearest = segmentClosest(old.x, old.y, b.x, b.y, p.x, p.y);
      const z = old.z + (b.z - old.z) * nearest.t;
      const reach = keeper ? 0.95 + p.attributes.keeping * 0.65 : 0.7;
      if (nearest.distance < reach && z < (keeper ? 2.5 : 1.55)) hits.push({ p, keeper, ...nearest, z });
    }
    hits.sort((a, c) => a.t - c.t || a.distance - c.distance || a.p.id - c.p.id);
    if (!hits.length) return false;
    const h = hits[0], p = h.p, flight = b.flight;
    // Contact location is resolved inside the sole ball integrator's call path.
    b.x = old.x + (b.x - old.x) * h.t; b.y = old.y + (b.y - old.y) * h.t; b.z = Math.max(0.15, h.z);
    if (flight && flight.type === 'pass' && flight.team === p.team && flight.offsideIds.includes(p.id)) {
      s.stats[p.team].offsides++;
      event(s, 'offside', p.team, `${p.role} involved from an offside position`, p.id);
      startRestart(s, 'freeKick', 1 - p.team, { x: p.x, y: p.y });
      return true;
    }
    if (h.keeper) {
      const shot = flight && flight.type === 'shot' && flight.team !== p.team;
      if (shot) { countOnTarget(s, flight); s.stats[p.team].saves++; }
      const difficulty = speed / 34 + h.distance / 3 + b.z / 7;
      const clean = random(s) < clamp(p.attributes.keeping + 0.35 - difficulty * 0.48, 0.15, 0.95);
      if (clean) {
        s.stats[p.team].claims++;
        event(s, shot ? 'save' : 'claim', p.team, `${p.role} ${shot ? 'saves and holds' : 'claims the ball'}`, p.id);
        setPossession(s, p); p.decisionIn = 0.7;
      } else {
        event(s, shot ? 'save' : 'block', p.team, `${p.role} parries`, p.id);
        const normal = { x: b.x - p.x, y: b.y - p.y };
        const n = Math.hypot(normal.x, normal.y) || 1;
        b.vx = normal.x / n * Math.max(4, speed * 0.45);
        b.vy = normal.y / n * Math.max(4, speed * 0.45) + (random(s) - 0.5) * 3;
        b.vz = 1.5; b.mode = 'loose'; b.owner = null; b.lastTouch = p.id; b.releasedAt = s.time;
        b.flight = null; s.possession = null;
      }
    } else if (flight && flight.type === 'shot' && flight.team !== p.team) {
      s.stats[p.team].blocks++;
      event(s, 'block', p.team, `${p.role} blocks the shot`, p.id);
      b.vx *= -0.3; b.vy = b.vy * 0.4 + (random(s) - 0.5) * 7; b.vz = 1.2;
      b.mode = 'loose'; b.flight = null; b.lastTouch = p.id; b.releasedAt = s.time; s.possession = null;
    } else {
      const control = p.attributes.control + 0.4 - speed / 48 - b.z * 0.2;
      if (random(s) < clamp(control, 0.18, 0.97)) {
        if (flight && flight.type === 'pass' && flight.team === p.team) s.stats[p.team].completedPasses++;
        else if (flight && flight.team !== p.team) event(s, 'tackle', p.team, `${p.role} intercepts`, p.id, { interception: true });
        setPossession(s, p);
      } else {
        b.vx *= 0.35; b.vy = b.vy * 0.35 + (random(s) - 0.5) * 3; b.vz = 0.5;
        b.mode = 'loose'; b.lastTouch = p.id; b.releasedAt = s.time; b.flight = null; s.possession = null;
        event(s, 'loose', p.team, `${p.role}: heavy first touch`, p.id);
      }
    }
    return true;
  }
  function boundary(s, old) {
    const b = s.ball;
    const crossings = [];
    if (b.x < 0) crossings.push({ t: (0 - old.x) / (b.x - old.x), axis: 'x', edge: 0 });
    if (b.x > 105) crossings.push({ t: (105 - old.x) / (b.x - old.x), axis: 'x', edge: 105 });
    if (b.y < 0) crossings.push({ t: (0 - old.y) / (b.y - old.y), axis: 'y', edge: 0 });
    if (b.y > 68) crossings.push({ t: (68 - old.y) / (b.y - old.y), axis: 'y', edge: 68 });
    crossings.sort((a, c) => a.t - c.t);
    if (!crossings.length) return false;
    const c = crossings[0], x = old.x + (b.x - old.x) * c.t, y = old.y + (b.y - old.y) * c.t;
    const z = old.z + (b.z - old.z) * c.t;
    const lastTeam = b.lastTouch === null ? 0 : s.players[b.lastTouch].team;
    if (c.axis === 'y') {
      startRestart(s, 'throwIn', 1 - lastTeam, { x, y: c.edge });
    } else {
      const attacking = direction(s, 0) === (c.edge === 105 ? 1 : -1) ? 0 : 1;
      if (Math.abs(y - 34) < 3.66 && z < 2.44) {
        countOnTarget(s, b.flight);
        s.score[attacking]++; s.stats[attacking].goals++;
        event(s, 'goal', attacking, `${s.teams[attacking].name} GOAL · ${s.score[0]}–${s.score[1]}`, b.lastTouch,
          { ownGoal: lastTeam !== attacking });
        startRestart(s, 'kickoff', 1 - attacking, { x: 52.5, y: 34 }, true);
      } else if (lastTeam !== attacking) {
        s.stats[lastTeam].deflectionsOut++;
        startRestart(s, 'corner', attacking, { x: c.edge, y: y < 34 ? 0 : 68 });
      } else {
        const spot = world(s, 1 - attacking, 5.5, 34);
        startRestart(s, 'goalKick', 1 - attacking, spot);
      }
    }
    return true;
  }
  // The only ball-coordinate integration path. Collision/boundary helpers belong to this path.
  function integrateBall(s) {
    const b = s.ball;
    if (s.phase !== 'play') {
      if (s.restart) { b.x = s.restart.spot.x; b.y = s.restart.spot.y; b.z = 0.15; }
      return;
    }
    if (b.owner !== null) {
      const p = s.players[b.owner], speed = Math.hypot(p.vx, p.vy);
      const old = { x: b.x, y: b.y, z: b.z };
      b.x = p.x + (speed > 0.4 ? p.vx / speed : direction(s, p.team)) * 0.55;
      b.y = p.y + (speed > 0.4 ? p.vy / speed : 0) * 0.55;
      b.z = 0.15;
      boundary(s, old);
      return;
    }
    const old = { x: b.x, y: b.y, z: b.z };
    b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
    b.vz -= 9.81 * DT;
    if (b.z < 0.15) { b.z = 0.15; b.vz = Math.abs(b.vz) > 1.4 ? -b.vz * 0.32 : 0; }
    const damping = b.z < 0.2 ? Math.exp(-0.52 * DT) : Math.exp(-0.07 * DT);
    b.vx *= damping; b.vy *= damping;
    // Clip the contact segment at the first field edge: no save/interception beyond the line.
    let edgeT = 1;
    for (const [axis, max] of [['x', 105], ['y', 68]]) {
      if (b[axis] < 0) edgeT = Math.min(edgeT, (0 - old[axis]) / (b[axis] - old[axis]));
      if (b[axis] > max) edgeT = Math.min(edgeT, (max - old[axis]) / (b[axis] - old[axis]));
    }
    const end = { x: b.x, y: b.y, z: b.z };
    if (edgeT < 1) { b.x = old.x + (b.x - old.x) * edgeT; b.y = old.y + (b.y - old.y) * edgeT; b.z = old.z + (b.z - old.z) * edgeT; }
    const touched = touchFreeBall(s, old);
    if (s.phase !== 'play' || touched) return;
    if (edgeT < 1) { b.x = end.x; b.y = end.y; b.z = end.z; }
    boundary(s, old);
  }
  function restartTick(s) {
    if (!s.restart) return;
    const r = s.restart, p = s.players[r.takerId];
    r.elapsed += DT;
    if (r.elapsed < r.wait || distance(p, r.spot) > 1) return;
    s.phase = 'play'; s.restart = null;
    setPossession(s, p);
    const pos = local(s, p.team, p.x, p.y);
    const options = passOptions(s, p, true);
    if (r.type === 'freeKick' && pos.x > 79 && Math.abs(pos.y - 34) < 16) {
      launch(s, p, 'shot', world(s, p.team, 105, 34 + (random(s) - 0.5) * 4), 5.5);
    } else if (options.length) {
      let target = options[0].q;
      if (r.type === 'kickoff') target = s.players[p.team * 11 + 7];
      if (r.type === 'corner') target = s.players[p.team * 11 + 9];
      launch(s, p, 'pass', target, r.type === 'corner' ? 9 : r.type === 'throwIn' ? 3 : 0);
      if (r.type === 'throwIn' || r.type === 'corner' || r.type === 'goalKick') s.ball.flight.offsideIds = [];
    }
  }
  function measure(s) {
    const d = s.diagnostics;
    if (s.phase !== 'play') return;
    if (s.ball.owner !== null) s.stats[s.players[s.ball.owner].team].possessionTicks++;
    if (s.ball.owner !== null && s.possession !== s.players[s.ball.owner].team) d.ballTruthConflicts++;
    for (const p of s.players) {
      if (p.duty === 'MARK' && p.markId !== null) {
        d.markingSamples++;
        const q = s.players[p.markId];
        if (distance(p.target, q) < 0.1) d.markingGlueTicks++;
      }
      if ((p.role === 'LB' || p.role === 'RB') && s.possession !== p.team) {
        const threats = opponents(s, p).filter(q => {
          const b = local(s, p.team, q.x, q.y);
          return b.x < 48 && (p.role === 'LB' ? b.y < 16 : b.y > 52);
        });
        if (threats.length) {
          d.wideThreatSamples++;
          const q = local(s, p.team, p.target.x, p.target.y);
          if (p.duty === 'PRESS' && (p.role === 'LB' ? q.y > 40 : q.y < 28)) d.wideAbandonmentTicks++;
        }
      }
    }
    if (s.tick % 20 !== 0) return;
    d.shapeSamples++;
    for (let team = 0; team < 2; team++) {
      const ps = s.players.filter(p => p.team === team && p.role !== 'GK');
      const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
      const width = Math.max(...ys) - Math.min(...ys), depth = Math.max(...xs) - Math.min(...xs);
      d.widths[team] += width; d.depths[team] += depth;
      d.minWidth[team] = Math.min(d.minWidth[team], width); d.maxDepth[team] = Math.max(d.maxDepth[team], depth);
      if (ps.filter(p => distance(p, s.ball) < 7).length >= 6) d.massChaseTicks++;
    }
  }
  function record(s) {
    // Append-only observations, never read by football decisions. No future samples.
    const frame = Object.freeze({ tick: s.tick, time: round(s.time), clock: round(s.clock), half: s.half, phase: s.phase,
      score: Object.freeze([...s.score]), possession: s.possession,
      ball: Object.freeze([s.ball.x, s.ball.y, s.ball.z]),
      players: Object.freeze(s.players.flatMap(p => [p.x, p.y, DUTIES.indexOf(p.duty)])), eventId: s.currentEvent });
    s.history.push(frame);
    return frame;
  }
  function tick(s) {
    if (s.phase === 'full-time') return false;
    s.tick++;
    s.time = s.tick * DT;
    if (s.phase === 'half-time') {
      s.restart.elapsed += DT;
      if (s.restart.elapsed >= 3) { s.phase = 'restart'; s.restart.elapsed = 0; }
    } else {
      s.clock = Math.min(s.half === 1 ? 2700 : 5400, s.clock + DT * CLOCK_RATE);
      if (s.half === 1 && s.clock >= 2700) {
        s.half = 2;
        startRestart(s, 'kickoff', 1, { x: 52.5, y: 34 }, true);
        s.phase = 'half-time'; s.restart.elapsed = 0;
        event(s, 'halfTime', null, 'Half time · teams change ends');
      } else if (s.half === 2 && s.clock >= 5400) {
        s.phase = 'full-time'; s.paused = true; s.restart = null; s.input = null;
        event(s, 'fullTime', null, `Full time · ${s.score[0]}–${s.score[1]}`);
        record(s); return true;
      }
    }
    setTargets(s);
    if (s.phase === 'play') act(s);
    integratePlayers(s);
    if (s.phase === 'play') challenge(s);
    integrateBall(s);
    if (s.phase === 'restart') restartTick(s);
    measure(s);
    record(s);
    return true;
  }
  class Match {
    #s;
    constructor(seed = 'astra-659') { this.#s = seed === RESTORE ? null : createState(seed); }
    static restore(serialized) {
      const data = typeof serialized === 'string' ? JSON.parse(serialized) : copy(serialized);
      if (data.version !== 'ASTRA-659-1' || data.players.length !== 22) throw new Error('Incompatible MatchState');
      const match = new Match(RESTORE);
      match.#s = data;
      for (const f of data.history) { Object.freeze(f.players); Object.freeze(f.ball); Object.freeze(f.score); Object.freeze(f); }
      return match;
    }
    pause() { this.#s.paused = true; }
    resume() { if (this.#s.phase !== 'full-time') this.#s.paused = false; }
    advance() { return this.#s.paused ? false : tick(this.#s); }
    step() { return this.#s.paused ? tick(this.#s) : false; }
    get paused() { return this.#s.paused; }
    get finished() { return this.#s.phase === 'full-time'; }
    get frame() { return this.#s.history[this.#s.history.length - 1]; }
    get previousFrame() { return this.#s.history[Math.max(0, this.#s.history.length - 2)]; }
    inspect() {
      const { history, events, ...current } = this.#s;
      return { ...copy(current), historyLength: history.length, eventCount: events.length };
    }
    eventsSince(id = 0) { return this.#s.events.slice(id).map(copy); }
    serialize() { return JSON.stringify(this.#s); }
    history() { return this.#s.history.slice(); }
    replay(eventId, before = 10, after = 2) {
      const e = this.#s.events[eventId];
      if (!e) return null;
      const from = Math.max(0, e.time - before), to = Math.min(this.#s.time, e.time + after);
      return Object.freeze({ event: Object.freeze(copy(e)), from, to,
        frames: Object.freeze(this.#s.history.filter(f => f.time >= from - 0.001 && f.time <= to + 0.001)) });
    }
    // One selected present-tense action, never a selected result. No RNG or movement here.
    // A future choice detector calls inspect -> pause -> submitAction -> resume.
    submitAction(action) {
      const s = this.#s;
      if (!s.paused || s.phase !== 'play' || s.ball.owner === null || !action || !Number.isInteger(action.playerId) || action.playerId !== s.ball.owner) return false;
      const p = s.players[action.playerId];
      if (action.type === 'pass') {
        const q = s.players[action.targetId];
        if (!q || q.team !== p.team || q.id === p.id) return false;
      } else if (action.type === 'shot' || action.type === 'carry') {
        if (!action.aim || !Number.isFinite(action.aim.x) || !Number.isFinite(action.aim.y)
          || action.aim.x < 0 || action.aim.x > 105 || action.aim.y < 0 || action.aim.y > 68) return false;
      } else return false;
      if (action.loft !== undefined && (!Number.isFinite(action.loft) || action.loft < 0 || action.loft > 12)) return false;
      s.input = { playerId: p.id, type: action.type, ...(action.type === 'pass' ? { targetId: action.targetId } : { aim: { ...action.aim } }), loft: action.loft ?? (action.type === 'shot' ? 4 : 0) };
      return true;
    }
  }
  return Object.freeze({ Match, createMatch: seed => new Match(seed), DT, CLOCK_RATE, ROLES, DUTIES,
    PITCH: Object.freeze({ length: 105, width: 68, goalWidth: 7.32 }), VERSION: 'ASTRA-659-1' });
});
