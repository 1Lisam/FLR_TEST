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
      responsibilityVacancies: [],
      diagnostics: { contacts: 0, markingSamples: 0, markingGlueTicks: 0, handoffs: 0,
        wideThreatSamples: 0, wideAbandonmentTicks: 0, massChaseTicks: 0, shapeSamples: 0,
        widths: [0, 0], depths: [0, 0], minWidth: [100, 100], maxDepth: [0, 0],
        ballTruthConflicts: 0, lowPressureChallenges: 0, playerDistance: Array(22).fill(0),
        maxStationarySeconds: Array(22).fill(0), stationarySeconds: Array(22).fill(0) } };
    for (let team = 0; team < 2; team++) for (let i = 0; i < 11; i++) {
      const pos = world(s, team, ...HOME[i]);
      s.players.push({ id: team * 11 + i, team, role: ROLES[i], slot: i, x: pos.x, y: pos.y, vx: 0, vy: 0,
        target: { ...pos }, duty: i === 0 ? 'GK' : 'SUPPORT', markId: null, pressId: null,
        // A present-tense explanation for a defender's target.  It is deliberately
        // state, rather than a second movement system or a future tactical plan.
        defensiveContext: null,
        // One current responsibility contract per player.  It is serialized
        // MatchState, never a parallel tactical simulation or future plan.
        responsibility: { version: 0, epoch: 0, kind: i === 0 ? 'GK' : 'INITIAL', subjectId: null,
          acquiredAt: 0, releaseReason: 'INITIAL', pressPhase: null, handoff: null, region: null },
        facingRadians: team === 0 ? 0 : Math.PI,
        facingSource: i === 0 ? 'HOME_GOAL' : 'MOVEMENT',
        // Rendering may smooth only a stable defensive display angle.  The
        // authoritative facingRadians/source above always remains current.
        renderFacingRadians: team === 0 ? 0 : Math.PI,
        renderFacingSource: i === 0 ? 'HOME_GOAL' : 'MOVEMENT',
        // A short-lived, current action direction.  This is MatchState authority
        // for a completed/selected action, never a visual-only renderer hint.
        facingIntent: null,
        decisionIn: 0.2 + random(s) * 0.5, challengeIn: 0, controlSince: -100, intent: null,
        // Present-tense movement intent is serialized state, not a future plan.
        // It prevents the shared 20 Hz tactical sample from becoming a shared 20 Hz motor command.
        movementIntent: null,
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
    // Dead-ball setup has no live press/mark/claim authority.  Clear it at the
    // transition instead of allowing a prior open-play projection to survive
    // until a later target sample.
    for (const p of s.players) invalidateCurrentContract(s, p, 'RESTART_SETUP');
    const taker = s.players.filter(p => p.team === team && (type === 'goalKick' ? p.role === 'GK' : p.role !== 'GK'))
      .sort((a, b) => (type === 'kickoff' ? (a.role === 'CF' ? -1 : b.role === 'CF' ? 1 : a.id - b.id) : distance(a, spot) - distance(b, spot)))[0];
    s.restart = { type, team, spot: { x: clamp(spot.x, 0.2, 104.8), y: clamp(spot.y, 0.2, 67.8) },
      takerId: taker.id, elapsed: 0, wait: type === 'kickoff' ? 2.5 : 1.5, reset };
    const key = { kickoff: 'kickoffs', goalKick: 'goalKicks', throwIn: 'throwIns', corner: 'corners', freeKick: 'freeKicks' }[type];
    if (key) s.stats[team][key]++;
    event(s, type, team, `${s.teams[team].name} ${type.replace(/([A-Z])/g, ' $1').toLowerCase()}`, taker.id);
  }
  function setPossession(s, p, arrival = null) {
    if (s.lastPossession !== p.team) { s.transitionAt = s.time; s.lastPossession = p.team; }
    s.possession = p.team;
    s.ball.owner = p.id;
    s.ball.mode = 'controlled';
    s.ball.flight = null;
    s.ball.lastTouch = p.id;
    s.ball.vx = s.ball.vy = s.ball.vz = 0;
    p.controlSince = s.time;
    p.intent = null;
    p.facingIntent = null;
    // Possession invalidates a prior defensive body contract immediately.  The
    // next current target refines this on the same/next authoritative tick.
    if (arrival && Math.hypot(arrival.dx, arrival.dy) > .04) {
      p.facingIntent = { source: 'RECEIVE', dx: arrival.dx, dy: arrival.dy, until: s.time + .16 };
      setFacing(p, arrival.dx, arrival.dy, 'RECEIVE');
    } else setFacing(p, direction(s, p.team), 0, 'POSSESSION_TRANSITION');
    p.decisionIn = 0.2 + random(s) * 0.4;
    for (const q of s.players) if (q.id !== p.id) invalidateCurrentContract(s, q, 'POSSESSION_CHANGED');
    publishCurrentAction(s, p, 'CARRY', { ...p.target }, arrival ? 'RECEIVED_BALL_OWNER' : 'POSSESSION_OWNER');
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
  function localVelocity(s, team, p) {
    return direction(s, team) === 1 ? { x: p.vx, y: p.vy } : { x: -p.vx, y: -p.vy };
  }
  function contractEpoch(s) { return `${s.phase}:${s.lastPossession ?? 'none'}:${s.ball.owner ?? 'loose'}`; }
  function homeResponsibility(p) {
    const channel = p.role === 'LB' ? 'LEFT_CHANNEL' : p.role === 'RB' ? 'RIGHT_CHANNEL'
      : p.role === 'LCB' || p.role === 'RCB' ? 'CENTRAL_BACK' : p.role === 'DM' ? 'CENTRAL_SCREEN' : 'ROLE_SPACE';
    return { role: p.role, channel, region: { x: HOME[p.slot][0], y: HOME[p.slot][1] } };
  }
  function regionFor(s, team, p, anchor) {
    const linePeers = s.players.filter(q => q.team === team && q.role !== 'GK' && Math.abs(q.slot - p.slot) <= 2);
    const span = Math.max(7, linePeers.length > 1 ? linePeers.reduce((n, q) => n + distance(q, p), 0) / (linePeers.length - 1) : 11);
    return { x: round(anchor.x), y: round(anchor.y), span: round(span), lane: p.role === 'LB' ? 'LEFT' : p.role === 'RB' ? 'RIGHT' : p.slot <= 5 ? 'CENTRAL' : p.slot <= 7 ? 'MID' : 'FRONT' };
  }
  function publishResponsibility(s, team, p, duty, target, kind, extra = {}) {
    const prior = p.responsibility || { version: 0, acquiredAt: s.time };
    const epoch = contractEpoch(s), subjectId = extra.subjectId ?? null;
    const signature = `${epoch}|${kind}|${subjectId}|${extra.pressPhase || ''}|${extra.handoff?.to ?? ''}`;
    const priorSignature = `${prior.epoch}|${prior.kind}|${prior.subjectId}|${prior.pressPhase || ''}|${prior.handoff?.to ?? ''}`;
    const version = signature === priorSignature ? prior.version : prior.version + 1;
    p.duty = duty; p.markId = duty === 'MARK' ? subjectId : null; p.pressId = duty === 'PRESS' ? subjectId : null;
    p.target = world(s, team, target.x, target.y);
    const pressureTargetId = extra.pressureTargetId ?? (duty === 'PRESS' ? subjectId : null);
    const markTargetId = extra.markTargetId ?? (duty === 'MARK' ? subjectId : null);
    const watchTargetId = extra.watchTargetId ?? markTargetId ?? null;
    p.responsibility = { version, epoch, kind, duty, subjectId, homeResponsibility: homeResponsibility(p), acquiredAt: signature === priorSignature ? prior.acquiredAt : s.time,
      releaseReason: extra.releaseReason || null, pressPhase: extra.pressPhase || null, handoff: extra.handoff || null,
      region: extra.region || null, protectedBy: extra.protectedBy ?? null, challengeIntent: !!extra.challengeIntent,
      pressureTargetId, markTargetId, watchTargetId,
      transition: { previousKind: prior.kind ?? null, previousSubjectId: prior.subjectId ?? null, previousDuty: prior.duty ?? null,
        reason: extra.reason || extra.releaseReason || 'CURRENT_ASSIGNMENT', writer: extra.writer || 'FINAL_ASSIGNMENT',
        acquisitionBasis: extra.acquisitionBasis || null } };
    p.defensiveContext = { responsibility: kind, homeResponsibility: homeResponsibility(p), homeZone: { x: HOME[p.slot][0], y: HOME[p.slot][1] }, contractVersion: version,
      ...(extra.handoff ? { handoffTo: p.id === extra.handoff.from ? extra.handoff.to : null, handoffFrom: extra.handoff.from, handoffReason: extra.handoff.reason } : { handoffTo: null }),
      ...(extra.pressPhase ? { pressPhase: extra.pressPhase } : {}),
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(extra.pressureOwner === undefined ? {} : { pressureOwner: extra.pressureOwner }),
      ...(extra.markShadow === undefined ? {} : { markShadow: extra.markShadow }),
      ...(extra.threatLevel === undefined ? {} : { threatLevel: round(extra.threatLevel) }),
      ...(extra.attackTrigger === undefined ? {} : { attackTrigger: extra.attackTrigger }),
      ...(extra.recoverableEnvelope === undefined ? {} : { recoverableEnvelope: extra.recoverableEnvelope }),
      ...(extra.protectedBy === undefined ? {} : { centralProtectedBy: extra.protectedBy }),
      pressureTargetId, markTargetId, watchTargetId };
  }
  function invalidateCurrentContract(s, p, reason) {
    p.markId = null; p.pressId = null; p.facingIntent = null; p.intent = null;
    p.movementIntent = null; p.motionDemand = null;
    const prior = p.responsibility || { version: 0 };
    p.responsibility = { version: prior.version + 1, epoch: contractEpoch(s), kind: 'INVALIDATED', duty: null,
      subjectId: null, homeResponsibility: homeResponsibility(p), acquiredAt: s.time, releaseReason: reason,
      pressPhase: null, handoff: null, region: null, protectedBy: null, challengeIntent: false,
      pressureTargetId: null, markTargetId: null, watchTargetId: null };
    p.defensiveContext = { responsibility: 'INVALIDATED', contractVersion: p.responsibility.version, reason,
      pressureTargetId: null, markTargetId: null, watchTargetId: null };
  }
  function publishCurrentAction(s, p, duty, target, kind) {
    // Actions are final current commands, not defensive proposals.  Keeping this
    // at the shared boundary makes owner/selected input authority explicit.
    publishResponsibility(s, p.team, p, duty, local(s, p.team, target.x, target.y), kind, { subjectId: null,
      reason: kind, releaseReason: 'CURRENT_ACTION', markShadow: false });
  }
  function finalAssignmentCommit(s, owner) {
    const flightReceiver = s.ball.owner === null && s.ball.flight?.type === 'pass' ? s.players[s.ball.flight.targetId] : null;
    if (owner) publishCurrentAction(s, owner, 'CARRY', owner.intent && owner.intent.until > s.time ? owner.intent.aim : owner.target,
      owner.intent && owner.intent.until > s.time ? 'SELECTED_CARRY_OWNER' : 'CURRENT_BALL_OWNER');
    if (flightReceiver) {
      const incomingTarget = { x: clamp(s.ball.x + s.ball.vx * .22, 1, 104), y: clamp(s.ball.y + s.ball.vy * .22, 1, 67) };
      publishResponsibility(s, flightReceiver.team, flightReceiver, 'RECEIVE', local(s, flightReceiver.team, incomingTarget.x, incomingTarget.y),
        'INTENDED_PASS_RECEIVE', { subjectId: flightReceiver.id, reason: 'CURRENT_FLIGHT_TARGET', releaseReason: 'FLIGHT_END_OR_CONTROL' });
    }
    for (const p of s.players) {
      const r = p.responsibility;
      if (p.duty === 'RESTART') {
        if (r?.kind !== 'RESTART_SETUP' || r.duty !== 'RESTART') publishCurrentAction(s, p, 'RESTART', p.target, 'RESTART_SETUP');
      } else if (r?.duty !== p.duty) {
        // A default/loose player may not expose a previous mark or press as its
        // current responsibility after its actual duty has changed.
        publishCurrentAction(s, p, p.duty, p.target, s.ball.owner === null && !s.ball.flight ? `LOOSE_DEFAULT_${p.duty}` : `DEFAULT_${p.duty}`);
      }
    }
  }
  function shadowTarget(anchor, threat) {
    const q = threat.q;
    // Shadow the goal-side lane; target is deliberately an anchor/threat relation,
    // not a moving opponent coordinate to follow indefinitely.
    return { x: clamp(Math.min(anchor.x + anchor.span * .22, q.x - Math.max(1.4, anchor.span * .16)), 4, 65),
      y: clamp(anchor.y * .58 + q.y * .42, 4, 64) };
  }
  function recoverableWideEnvelope(s, team, fb, winger, owner) {
    const fq = local(s, team, fb.x, fb.y), wq = local(s, team, winger.x, winger.y);
    const fv = localVelocity(s, team, fb), wv = localVelocity(s, team, winger);
    const reengage = { x: wq.x - 1.8, y: wq.y };
    const delta = { x: reengage.x - fq.x, y: reengage.y - fq.y }, gap = Math.hypot(delta.x, delta.y);
    const toward = gap ? (fv.x * delta.x + fv.y * delta.y) / gap : 0;
    const turnCost = Math.max(0, -toward) / Math.max(3.5, fb.attributes.pace) * .42;
    const accelerationCost = Math.max(0, fb.attributes.pace - Math.hypot(fv.x, fv.y)) / Math.max(20, fb.attributes.pace * 5);
    const recoverySeconds = gap / Math.max(3.8, fb.attributes.pace * .82) + turnCost + accelerationCost;
    const ballGap = owner ? distance(owner, winger) : distance(s.ball, winger);
    const launchSpeed = Math.max(9, Math.hypot(s.ball.vx, s.ball.vy));
    const passWindow = ballGap / launchSpeed + .38;
    const threatRun = Math.max(0, -wv.x) * .11;
    return recoverySeconds + threatRun <= passWindow;
  }
  function pressPlan(s, team, p, owner, anchor, coverage) {
    const q = local(s, team, p.x, p.y), carrier = local(s, team, owner.x, owner.y), v = localVelocity(s, team, p);
    const gap = Math.hypot(carrier.x - q.x, carrier.y - q.y), span = anchor.span;
    const leaving = Math.hypot(q.x - anchor.x, q.y - anchor.y);
    const closesCentral = Math.abs(carrier.y - 34) < span * .9 || anchor.lane === (carrier.y < 34 ? 'LEFT' : 'RIGHT');
    const roleRisk = (p.role === 'LCB' || p.role === 'RCB') && !coverage ? span * .7 : 0;
    const eligible = closesCentral && gap <= span * 1.55 && leaving <= span * 1.35 && !(roleRisk && gap > span * .58);
    if (!eligible) return null;
    const toCarrier = gap ? { x: (carrier.x - q.x) / gap, y: (carrier.y - q.y) / gap } : { x: 0, y: 0 };
    const closing = v.x * toCarrier.x + v.y * toCarrier.y;
    const stopping = closing > 0 ? closing * closing / Math.max(8, p.attributes.pace * 2.1) : 0;
    const centralBias = clamp((34 - carrier.y) * .055, -1.25, 1.25);
    const desiredGap = 1.28 + stopping;
    const phase = gap > desiredGap + .55 ? 'APPROACH' : gap > 1.22 ? 'CONTAIN' : 'CHALLENGE';
    const offset = phase === 'APPROACH' ? desiredGap : Math.max(1.15, desiredGap);
    const target = { x: clamp(carrier.x - offset, 3, 72), y: clamp(carrier.y + centralBias, 4, 64) };
    return { gap, eligible, phase, target, score: gap + leaving * .42 + roleRisk, challengeIntent: phase === 'CHALLENGE' && closing < p.attributes.pace * .58 };
  }
  // V3 is deliberately relationship-driven.  A role anchor follows current ball
  // context, but its lane, depth and lateral response are role specific; it is
  // never a shared far-ball coordinate for a whole defensive line.
  function v3DefensiveAnchor(s, team, p) {
    const b = local(s, team, s.ball.x, s.ball.y), h = HOME[p.slot];
    const back = p.slot <= 4, midfield = p.slot >= 5 && p.slot <= 7;
    const depthShift = back ? clamp((52 - b.x) * .16, -3.5, 6.4) : midfield ? clamp((52 - b.x) * .22, -5, 8) : clamp((52 - b.x) * .12, -3, 4);
    const lateralWeight = p.role === 'LB' || p.role === 'RB' ? .30 : p.role === 'LCB' || p.role === 'RCB' ? .16 : midfield ? .25 : .11;
    const centralBias = p.role === 'LCB' ? 1.1 : p.role === 'RCB' ? -1.1 : p.role === 'DM' ? (34 - h[1]) * .18 : 0;
    const target = { x: clamp(h[0] + depthShift + (p.slot === 1 || p.slot === 4 ? (b.x - 52) * .035 : 0), 4, 82),
      y: clamp(h[1] + (b.y - h[1]) * lateralWeight + centralBias, 4, 64) };
    return regionFor(s, team, p, target);
  }
  function v3Danger(s, team, carrier) {
    const q = local(s, team, carrier.x, carrier.y), v = localVelocity(s, team, carrier);
    const box = clamp((39 - q.x) / 32, 0, 1);
    const facesGoal = clamp((-v.x + .8) / 4.4, 0, 1);
    const lane = clamp(1 - Math.abs(q.y - 34) / 27, 0, 1);
    return clamp(box * .55 + facesGoal * .18 + lane * .27, 0, 1);
  }
  function v3PressurePlan(s, team, p, carrier, anchor, hasCentralCover, incoming) {
    const q = local(s, team, p.x, p.y), c = local(s, team, carrier.x, carrier.y), v = localVelocity(s, team, p);
    const dx = c.x - q.x, dy = c.y - q.y, gap = Math.hypot(dx, dy), span = anchor.span;
    const leaving = Math.hypot(q.x - anchor.x, q.y - anchor.y);
    const sameLane = anchor.lane === 'CENTRAL' || (anchor.lane === 'LEFT' && c.y < 40) || (anchor.lane === 'RIGHT' && c.y > 28) || (anchor.lane === 'MID' && Math.abs(c.y - anchor.y) < span * .95);
    const eligible = sameLane && gap <= span * 1.28 && leaving <= span * 1.18
      && (!['LCB','RCB'].includes(p.role) || hasCentralCover || gap < span * .55);
    if (!eligible) return null;
    const unit = gap > .01 ? {x:dx/gap,y:dy/gap} : {x:0,y:0};
    const closing = v.x * unit.x + v.y * unit.y;
    const stopping = closing > 0 ? closing * closing / Math.max(10, p.attributes.pace * 3.1) : 0;
    const danger = v3Danger(s, team, carrier);
    // Ordinary possession settles into a 2–3m-class relation.  The response
    // contracts only as current box/facing/shot-lane danger rises.
    const baseline = 2.25 + clamp((anchor.span - 7) * .055, 0, .42);
    const desiredGap = clamp(baseline - danger * 1.12 + stopping * .48 + (incoming ? .18 : 0), 1.08, 3.05);
    const laneSide = clamp((34 - c.y) * .07, -1.05, 1.05);
    const goalSide = Math.max(.72, desiredGap * (danger > .56 ? 1.05 : .88));
    const target = {x:clamp(c.x - goalSide, 2.5, 72),y:clamp(c.y + laneSide,4,64)};
    let phase = gap > desiredGap + .72 ? 'PRIMARY_CONTAIN' : gap > desiredGap + .18 ? 'CLOSE_DOWN' : danger > .48 ? 'TIGHT_MARK' : 'PRIMARY_CONTAIN';
    if (gap <= Math.max(1.12, desiredGap - .38) && danger > .63 && closing < p.attributes.pace * .52) phase = 'CHALLENGE';
    return {gap, desiredGap, danger, phase, target, score:gap + leaving*.48 + (p.role === 'DM' ? .16 : 0),
      challengeIntent:phase === 'CHALLENGE', eligible};
  }
  function v3ShadowTarget(anchor, threat, pressurePoint) {
    const q = threat.q;
    return {x:clamp(Math.min(anchor.x + anchor.span*.18, q.x - Math.max(1.15, anchor.span*.13)),4,68),
      y:clamp(anchor.y*.62 + q.y*.38 + (pressurePoint ? (q.y-pressurePoint.y)*.08 : 0),4,64)};
  }
  function goalSideWideTarget(anchor, threat, side, centralWeight = .42) {
    // A wide defender must be goal-side *and* inside the current attacker-to-goal
    // corridor.  This is a present-state triangle, not a predicted dribble.
    const x = clamp(Math.min(anchor.x + anchor.span * .18, threat.q.x - Math.max(1.15, anchor.span * .14)), 4, 68);
    const nearPostY = side > 0 ? 52 : 16;
    const routeAtDepth = threat.q.y + (nearPostY - threat.q.y)
      * clamp((threat.q.x - x) / Math.max(1, threat.q.x), 0, 1);
    const blendedY = anchor.y * centralWeight + threat.q.y * (1 - centralWeight) + side * .28;
    // On the right, smaller y is inside; on the left, larger y is inside.
    const corridorY = side > 0
      ? Math.max(nearPostY, Math.min(blendedY, routeAtDepth + .55))
      : Math.min(nearPostY, Math.max(blendedY, routeAtDepth - .55));
    return { x, y: clamp(corridorY, 4, 64) };
  }
  function responsibilityOwnsThreat(p, threatId) {
    const r = p?.responsibility || {};
    return r.markTargetId === threatId || r.watchTargetId === threatId;
  }
  function dangerousWideThreat(s, team, threat, side) {
    if (!threat || threat.team === team) return false;
    const q = local(s, team, threat.x, threat.y);
    return (side < 0 ? q.y < 35 : q.y > 33) && q.x < 76;
  }
  function eligibleThreatAcquirer(s, team, fb, threatId, anchors, priorContracts) {
    const threat = s.players[threatId];
    if (!threat) return false;
    const tq = local(s, team, threat.x, threat.y);
    return s.players.some(p => {
      if (p.team !== team || p.id === fb.id || !['LB', 'LCB', 'RCB', 'RB', 'DM', 'LCM', 'RCM'].includes(p.role)) return false;
      const prior = priorContracts.get(p.id); const r = prior?.responsibility || p.responsibility || {};
      if (!(r.markTargetId === threatId || r.watchTargetId === threatId)) return false;
      const a = anchors.get(p.id), pq = local(s, team, p.x, p.y), target = local(s, team, prior?.target?.x ?? p.target.x, prior?.target?.y ?? p.target.y);
      // A label is not acquisition: the successor must already be local enough
      // to a goal-side/inside lane and may not abandon a closer sole danger.
      const laneDistance = Math.hypot(target.x - Math.min(tq.x - .8, target.x), target.y - tq.y);
      const localEnough = Math.hypot(pq.x - tq.x, pq.y - tq.y) <= a.span * 1.45 && laneDistance <= a.span * 1.1;
      const otherId = r.watchTargetId ?? r.markTargetId;
      const other = Number.isInteger(otherId) && otherId !== threatId ? s.players[otherId] : null;
      const otherMoreDangerous = other && other.team !== team && local(s, team, other.x, other.y).x < tq.x - 2;
      return localEnough && !otherMoreDangerous;
    });
  }
  function applyV3Defence(s, team, carrier, anchors, incoming = false) {
    const ours=s.players.filter(p=>p.team===team&&p.role!=='GK'), backs=ours.filter(p=>['LB','LCB','RCB','RB'].includes(p.role));
    const cbs=backs.filter(p=>p.role==='LCB'||p.role==='RCB'), dm=ours.find(p=>p.role==='DM');
    const cq=local(s,team,carrier.x,carrier.y), threats=s.players.filter(p=>p.team!==team&&p.role!=='GK').map(p=>({p,q:local(s,team,p.x,p.y)}));
    const primaryThreat={p:carrier,q:cq};
    const central=threats.filter(t=>t.p!==carrier&&Math.abs(t.q.y-34)<10).sort((a,b)=>a.q.x-b.q.x||a.p.id-b.p.id)[0]||null;
    // Read prior ownership once. All current writers below are proposals; a
    // primary pressure publish may not erase an incumbent before acquire/release
    // validation has examined it.
    const priorContracts=new Map(ours.map(p=>[p.id,{responsibility:copy(p.responsibility),target:{...p.target},duty:p.duty}]));
    const coverCandidates=[...cbs,dm].filter(Boolean).sort((a,b)=>Math.abs(local(s,team,a.x,a.y).y-34)-Math.abs(local(s,team,b.x,b.y).y-34)||a.id-b.id);
    const hasCentralCover=coverCandidates.length>1;
    const danger=v3Danger(s,team,carrier);
    const ballSide=cq.y<34?-1:1;
    // A nearby new runner is not itself a release event.  Preserve a dangerous
    // incumbent wide threat until another eligible player has an actual current
    // watch/mark contract for it (acquire before release).
    const retainedWide=new Map();
    for(const fb of ours.filter(p=>p.role==='LB'||p.role==='RB')) {
      const side=fb.role==='LB'?-1:1, a=anchors.get(fb.id), priorState=priorContracts.get(fb.id), priorId=priorState?.responsibility?.watchTargetId??priorState?.responsibility?.markTargetId;
      const prior=Number.isInteger(priorId)?s.players[priorId]:null;
      const localPrior=prior&&prior.team!==team&&prior!==carrier&&dangerousWideThreat(s,team,prior,side)
        && Math.abs(local(s,team,prior.x,prior.y).y-a.y)<=a.span*1.5;
      if(localPrior&&!eligibleThreatAcquirer(s,team,fb,prior.id,anchors,priorContracts)) retainedWide.set(fb.id,{p:prior,q:local(s,team,prior.x,prior.y)});
    }
    const plans=ours.filter(p=>!retainedWide.has(p.id)).map(p=>({p,plan:v3PressurePlan(s,team,p,carrier,anchors.get(p.id),hasCentralCover,incoming)})).filter(x=>x.plan)
      .sort((a,b)=>a.plan.score-b.plan.score||a.p.id-b.p.id);
    const primary=plans[0]||null;
    if(primary) publishResponsibility(s,team,primary.p,'PRESS',primary.plan.target,primary.plan.phase,{subjectId:carrier.id,region:anchors.get(primary.p.id),pressPhase:primary.plan.phase,challengeIntent:primary.plan.challengeIntent,reason:incoming?'INCOMING_PASS_ARRIVAL':'CURRENT_CARRIER_THREAT',pressureOwner:primary.p.id,threatLevel:danger,markShadow:false,releaseReason:'COVER_OR_JURISDICTION_CHANGED',writer:'V3_PRIMARY_PROPOSAL',acquisitionBasis:'CURRENT_CARRIER_LANE'});
    // When the FB is already occupied by the retained dangerous winger, the
    // same-side DM/CM takes a distinct second runner where its jurisdiction is
    // sensible.  This prevents a second runner from stealing the FB's owner slot.
    const secondaryAssignments=new Map();
    for(const fb of ours.filter(p=>retainedWide.has(p.id))) {
      const side=fb.role==='LB'?-1:1, held=retainedWide.get(fb.id), a=anchors.get(fb.id);
      const secondary=threats.filter(t=>t.p!==carrier&&t.p!==held.p&&(side<0?t.q.y<34:t.q.y>=34))
        .filter(t=>Math.abs(t.q.y-held.q.y)<a.span*1.35&&t.q.x<=a.x+a.span*1.45)
        .sort((x,y)=>Math.hypot(x.q.x-a.x,x.q.y-a.y)-Math.hypot(y.q.x-a.x,y.q.y-a.y)||x.p.id-y.p.id)[0];
      if(!secondary) continue;
      const candidates=ours.filter(p=>p!==primary?.p&&((p.role==='DM')||(side>0?p.role==='RCM':p.role==='LCM')))
        .filter(p=>!secondaryAssignments.has(p.id)).sort((x,y)=>distance(x,secondary.p)-distance(y,secondary.p)||x.id-y.id);
      if(candidates[0]) secondaryAssignments.set(candidates[0].id,{threat:secondary,side,fbId:fb.id});
    }
    for(const p of ours){
      if(p===primary?.p) continue;
      const a=anchors.get(p.id), pq=local(s,team,p.x,p.y), side=p.role==='LB'?-1:p.role==='RB'?1:0;
      // During a live pass, the named receiver is the current incoming threat for
      // a fullback's mark/screen even though that receiver also feeds the single
      // primary-pressure ranking.  This is current ball-flight state, not an
      // assumed reception.
      const localThreat=retainedWide.get(p.id)||(incoming&&side!==0?[primaryThreat,...threats.filter(t=>t.p!==carrier)]:threats.filter(t=>t.p!==carrier)).filter(t=>(side===0?Math.abs(t.q.y-a.y)<a.span*.9:(side<0?t.q.y<34:t.q.y>=34)))
        .sort((x,y)=>Math.hypot(x.q.x-a.x,x.q.y-a.y)-Math.hypot(y.q.x-a.x,y.q.y-a.y)||x.p.id-y.p.id)[0]||null;
      const wasDirect=/PRIMARY_CONTAIN|CLOSE_DOWN|TIGHT_MARK|CHALLENGE|LOOSE_MARK_SCREEN/.test(priorContracts.get(p.id)?.responsibility?.kind||'');
      const secondary=secondaryAssignments.get(p.id);
      if(secondary){
        const shadow=goalSideWideTarget(a,secondary.threat,secondary.side,.58);
        publishResponsibility(s,team,p,'MARK',shadow,'SECONDARY_WIDE_COMPENSATION',{subjectId:secondary.threat.p.id,region:a,
          reason:'FB_RETAINS_DANGEROUS_WINGER_MIDFIELD_ABSORB_SECOND_RUNNER',pressureOwner:primary?.p.id??null,
          markShadow:true,markTargetId:secondary.threat.p.id,watchTargetId:secondary.threat.p.id,releaseReason:'SECONDARY_THREAT_EXIT'});
      } else if((p.role==='LB'||p.role==='RB') && localThreat){
        const shadow=goalSideWideTarget(a,localThreat,side,side !== ballSide ? .52 : .42);
        const kind=side!==ballSide?'WIDE_WATCH_COVER':'LOOSE_MARK_SCREEN';
        publishResponsibility(s,team,p,'MARK',shadow,kind,{subjectId:localThreat.p.id,region:a,reason:side!==ballSide?'FAR_SIDE_WATCH_AND_SWITCH_LANE':(incoming?'PASS_TARGET_OR_NEARBY_RUNNER':'LOCAL_RUNNER_AND_LANE'),pressureOwner:primary?.p.id??null,threatLevel:danger,markShadow:true,watchTargetId:localThreat.p.id,releaseReason:'THREAT_LEFT_ZONE'});
      } else if(localThreat && Math.abs(localThreat.q.y-a.y)<=a.span*1.22 && localThreat.q.x<=a.x+a.span*1.18){
        const shadow=v3ShadowTarget(a,localThreat,primaryThreat.q);
        publishResponsibility(s,team,p,'MARK',shadow,'LOOSE_MARK_SCREEN',{subjectId:localThreat.p.id,region:a,reason:incoming?'PASS_TARGET_OR_NEARBY_RUNNER':'LOCAL_RUNNER_AND_LANE',pressureOwner:primary?.p.id??null,threatLevel:danger,markShadow:true,releaseReason:'THREAT_LEFT_ZONE'});
      } else if((p.role==='LCB'||p.role==='RCB'||p.role==='DM') && (central||Math.abs(cq.y-34)<13)){
        const screenY=central?central.q.y*.30+34*.70:cq.y*.24+34*.76;
        publishResponsibility(s,team,p,'COVER',{x:clamp(Math.min(a.x,cq.x-2.1),4,68),y:clamp(a.y*.68+screenY*.32,8,60)},'SCREEN_LANE',{subjectId:central?.p.id??carrier.id,region:a,reason:'CENTRAL_PASS_AND_GOAL_LANE',pressureOwner:primary?.p.id??null,threatLevel:danger,markShadow:false,releaseReason:'LANE_REBALANCE'});
      } else if(wasDirect){
        publishResponsibility(s,team,p,'RECOVERY',a,'RECOVER_HANDOFF',{region:a,reason:'PRIMARY_RELEASED_OR_THREAT_EXIT',pressureOwner:primary?.p.id??null,threatLevel:danger,releaseReason:'RETURN_TO_ROLE_SPACE'});
      } else {
        publishResponsibility(s,team,p,'COVER',a,'ZONE_HOLD',{region:a,reason:'ROLE_ZONE_AND_TEAM_SPACING',pressureOwner:primary?.p.id??null,threatLevel:danger,releaseReason:'CURRENT_ZONE_VALID'});
      }
      // A defender can screen a local route but never receives the carrier's exact target.
      if(Math.hypot(p.target.x-carrier.x,p.target.y-carrier.y)<.08) p.target=world(s,team,{x:pq.x,y:pq.y}.x,a.y);
    }
    // MARK and SCREEN may meet at a moving region boundary.  Preserve the same
    // subject's current relation for a tiny proposal displacement; a meaningful
    // lane relocation or subject change still commits immediately.  This is a
    // responsibility entry/release gate, not another motor smoother.
    for (const p of ours) {
      const prior = priorContracts.get(p.id), before = prior?.responsibility, after = p.responsibility;
      const boundaryKinds = new Set(['LOOSE_MARK_SCREEN', 'SCREEN_LANE']);
      if (!before?.duty || !after || before.subjectId !== after.subjectId || before.kind === after.kind
        || !boundaryKinds.has(before.kind) || !boundaryKinds.has(after.kind) || distance(prior.target, p.target) >= .65) continue;
      publishResponsibility(s, team, p, before.duty, local(s, team, prior.target.x, prior.target.y), before.kind,
        { subjectId: before.subjectId, region: before.region || anchors.get(p.id), reason: 'SAME_SUBJECT_BOUNDARY_HYSTERESIS',
          releaseReason: 'MEANINGFUL_LANE_OR_SUBJECT_CHANGE_REQUIRED', markShadow: before.markTargetId !== null,
          pressureTargetId: before.pressureTargetId, markTargetId: before.markTargetId, watchTargetId: before.watchTargetId,
          pressPhase: before.pressPhase, challengeIntent: before.challengeIntent, protectedBy: before.protectedBy,
          writer: 'C1B_BOUNDARY_HYSTERESIS', acquisitionBasis: 'PRIOR_CURRENT_RELATION_STILL_GEOMETRICALLY_NEAR' });
    }
  }
  function applyElasticDefence(s, team, owner, presser, anchors) {
    const defenders = s.players.filter(p => p.team === team && ['LB', 'LCB', 'RCB', 'RB'].includes(p.role));
    const cbs = defenders.filter(p => p.role === 'LCB' || p.role === 'RCB');
    const dm = s.players.find(p => p.team === team && p.role === 'DM');
    const threats = s.players.filter(p => p.team !== team && p.role !== 'GK').map(p => ({ p, q: local(s, team, p.x, p.y) }));
    const central = threats.filter(t => t.p !== owner && Math.abs(t.q.y - 34) < 6).sort((a, b) => (a.q.x + Math.abs(a.q.y - 34) * 0.5) - (b.q.x + Math.abs(b.q.y - 34) * 0.5))[0] || null;
    const wide = side => threats.filter(t => side < 0 ? t.q.y < 34 : t.q.y >= 34)
      .filter(t => t.p !== owner).sort((a, b) => (a.q.x + Math.abs(a.q.y - HOME[side < 0 ? 1 : 4][1]) * 0.35) - (b.q.x + Math.abs(b.q.y - HOME[side < 0 ? 1 : 4][1]) * 0.35))[0] || null;
    const protectCentral = (excluded = null) => {
      if (!central) return null;
      const candidates = [...cbs.filter(p => p !== excluded && p !== presser), dm].filter(Boolean);
      return candidates.sort((a, b) => distance(a, central.p) - distance(b, central.p) || a.id - b.id)[0] || null;
    };
    for (const fb of defenders.filter(p => p.role === 'LB' || p.role === 'RB')) {
      const side = fb.role === 'LB' ? -1 : 1, winger = wide(side), farSide = owner && (local(s, team, owner.x, owner.y).y < 34 ? 1 : -1) === side;
      const anchor = anchors.get(fb.id);
      if (fb === presser) {
        continue;
      }
      const withinJurisdiction = winger && Math.abs(winger.q.y - anchor.y) <= anchor.span * 1.25 && winger.q.x <= anchor.x + anchor.span * 1.15;
      if (withinJurisdiction && !farSide) publishResponsibility(s, team, fb, 'MARK', shadowTarget(anchor, winger), 'WIDE_SHADOW', { subjectId: winger.p.id, region: anchor });
      else if (farSide) publishResponsibility(s, team, fb, 'COVER', { x: clamp(anchor.x - 1.5, 4, 65), y: clamp(34 + (anchor.y - 34) * .52, 10, 58) }, 'FAR_SIDE_CENTRAL_PROTECTION', { region: anchor, releaseReason: 'FAR_SIDE_RESERVATION' });
      else publishResponsibility(s, team, fb, 'RECOVERY', anchor, 'RETURN_TO_REGION', { region: anchor, releaseReason: winger ? 'THREAT_LEFT_JURISDICTION' : 'NO_LOCAL_WIDE_THREAT' });
    }
    // One central protector is explicit.  The other CB only covers the nearer
    // relationship; this prevents all four defenders adopting one ball target.
    const centralGuard = protectCentral();
    if (centralGuard && centralGuard !== presser) publishResponsibility(s, team, centralGuard, 'MARK', shadowTarget(anchors.get(centralGuard.id), central), 'CENTRAL_LANE_SHADOW', { subjectId: central.p.id, region: anchors.get(centralGuard.id) });
    for (const cb of cbs) if (cb !== presser && cb !== centralGuard) {
      const partner = centralGuard || dm;
      const a = anchors.get(cb.id);
      publishResponsibility(s, team, cb, 'COVER', { x: clamp(a.x - .8, 4, 65), y: clamp(a.y * .72 + (partner ? local(s, team, partner.x, partner.y).y : 34) * .28, 8, 60) }, 'ADJACENT_COVER', { region: a, protectedBy: centralGuard?.id ?? null });
    }
    if (dm && dm !== presser && dm !== centralGuard) publishResponsibility(s, team, dm, 'COVER', anchors.get(dm.id), 'CENTRAL_LANE_COVER', { region: anchors.get(dm.id) });
  }
  function vacancyLedger(s) {
    if (!Array.isArray(s.responsibilityVacancies)) s.responsibilityVacancies = [];
    return s.responsibilityVacancies;
  }
  function vacancyKey(team, fb) { return `${team}:${fb.id}:WIDE_CHANNEL`; }
  function prepareVacancyTick(s) {
    for (const v of vacancyLedger(s)) {
      v.confirmedAt = null;
      if (v.state === 'ACTIVE' && s.ball.owner !== null && s.players[s.ball.owner].team !== v.team) {
        v.state = 'RELEASING'; v.releaseAt = s.time; v.releaseReason = 'POSSESSION_LOST';
      }
    }
  }
  function confirmVacancy(s, team, fb, winger, reason) {
    const ledger = vacancyLedger(s), key = vacancyKey(team, fb);
    let v = ledger.find(x => x.key === key);
    if (!v) {
      v = { key, team, homeOwnerId: fb.id, homeRole: fb.role,
        channel: fb.role === 'RB' ? 'RIGHT_CHANNEL' : 'LEFT_CHANNEL', state: 'ACTIVE',
        reason, subjectId: winger?.id ?? null, openedAt: s.time, releaseAt: null, contributors: [] };
      ledger.push(v);
    }
    v.state = 'ACTIVE'; v.reason = reason; v.subjectId = winger?.id ?? null; v.confirmedAt = s.time;
    v.releaseAt = null; v.releaseReason = null;
    return v;
  }
  function finishVacancyTick(s) {
    s.responsibilityVacancies = vacancyLedger(s).filter(v => {
      if (v.state === 'ACTIVE' && v.confirmedAt !== s.time) {
        v.state = 'RELEASING'; v.releaseAt = s.time; v.releaseReason = 'ORIGINAL_FB_RETURN_OR_TRIGGER_END';
      }
      // Older restores without releaseAt must be normalized once.  Re-reading
      // `s.time` every tick made such a vacancy immortal.
      if (v.state === 'RELEASING' && !Number.isFinite(v.releaseAt)) v.releaseAt = s.time;
      const fb = s.players[v.homeOwnerId], subject = Number.isInteger(v.subjectId) ? s.players[v.subjectId] : null;
      const side = fb?.role === 'RB' ? 1 : -1;
      const stillDangerous = !!(fb && subject && dangerousWideThreat(s, v.team, subject, side));
      // The short release grace is cleanup only. It cannot erase a live wide
      // responsibility until present acquisition has actually been established.
      return v.state !== 'RELEASING' || !stillDangerous || !v.returnOwnershipEstablished || s.time - v.releaseAt < .8;
    });
  }
  function applyVacancyCompensation(s, team, anchors) {
    const ours = s.players.filter(p => p.team === team), ledger = vacancyLedger(s).filter(v => v.team === team);
    for (const v of ledger) {
      const fb = s.players[v.homeOwnerId], winger = v.subjectId === null ? null : s.players[v.subjectId];
      const side = fb?.role === 'RB' ? 1 : -1;
      const cb = ours.find(p => p.role === (side > 0 ? 'RCB' : 'LCB'));
      const dm = ours.find(p => p.role === 'DM');
      const cm = ours.find(p => p.role === (side > 0 ? 'RCM' : 'LCM'));
      const threat = winger ? local(s, team, winger.x, winger.y) : { x: 56, y: side > 0 ? 56 : 12 };
      const contributors = [cb, dm, cm].filter(Boolean);
      const centralThreat = s.players.filter(p => p.team !== team && p.role !== 'GK')
        .filter(p => p !== winger && Math.abs(local(s, team, p.x, p.y).y - 34) < 8)
        .sort((a, b) => local(s, team, a.x, a.y).x - local(s, team, b.x, b.y).x || a.id - b.id)[0] || null;
      const fbAnchor = fb && anchors.get(fb.id);
      // During return, the FB must actively acquire the wide runner before the
      // temporary CB owner is released.  A separate present central guard is
      // required before that CB can leave the flank relationship.
      let centralGuard = null, returnAcquired = false;
      if (v.state === 'RELEASING' && fb && winger && fbAnchor) {
        publishResponsibility(s, team, fb, 'MARK', goalSideWideTarget(fbAnchor, { q: threat }, side, .42), 'HANDOFF_RETURN_WIDE_MARK',
          { subjectId: winger.id, region: fbAnchor, reason: 'FB_RETURN_ACQUIRES_WIDE_THREAT', markShadow: true,
            markTargetId: winger.id, watchTargetId: winger.id, handoff: { from: cb?.id ?? null, to: fb.id, subjectId: winger.id, reason: 'RETURN_WIDE_HANDOFF' } });
        returnAcquired = responsibilityOwnsThreat(fb, winger.id);
        if (centralThreat) {
          centralGuard = [dm, ...s.players.filter(p => p.team === team && (p.role === 'LCB' || p.role === 'RCB') && p !== cb)]
            .filter(p => p && p.duty !== 'PRESS').sort((a, b) => distance(a, centralThreat) - distance(b, centralThreat) || a.id - b.id)[0] || null;
          if (centralGuard) {
            const guardAnchor = anchors.get(centralGuard.id);
            publishResponsibility(s, team, centralGuard, 'MARK', v3ShadowTarget(guardAnchor, { q: local(s, team, centralThreat.x, centralThreat.y) }, threat), 'HANDOFF_CENTRAL_GUARD',
              { subjectId: centralThreat.id, region: guardAnchor, reason: 'FB_RETURN_PROTECT_CENTRAL_STRIKER', markShadow: true,
                markTargetId: centralThreat.id, watchTargetId: centralThreat.id, handoff: { from: cb?.id ?? null, to: centralGuard.id, subjectId: centralThreat.id, reason: 'CENTRAL_GUARD_BEFORE_WIDE_RELEASE' } });
          }
        }
      }
      const releaseReady = v.state !== 'RELEASING' || (returnAcquired && (!centralThreat || !!centralGuard));
      v.returnOwnershipEstablished = returnAcquired;
      v.centralGuardId = centralGuard?.id ?? null;
      v.contributors = contributors.map((p, index) => ({ playerId: p.id, role: p.role,
        share: index === 0 ? 'WIDE_MARK_OWNER' : index === 1 ? 'HALFSPACE_SCREEN' : 'LANE_SHARE',
        watchTargetId: index === 0 ? winger?.id ?? null : null }));
      for (const p of contributors) {
        const a = anchors.get(p.id);
        if (!a) continue;
        const q = local(s, team, p.x, p.y), release = v.state === 'RELEASING' && releaseReady;
        let target, kind, reason;
        if (p === centralGuard) continue;
        if (v.state === 'RELEASING' && !releaseReady && p === cb) {
          target = goalSideWideTarget(a, { q: threat }, side, .52);
          kind = 'HANDOFF_WIDE_RETAIN_UNTIL_ACQUIRED'; reason = 'ACQUIRE_BEFORE_RELEASE_WAIT';
        } else if (release) {
          const weight = p.role === 'DM' ? .54 : p.role === 'RCM' || p.role === 'LCM' ? .63 : .43;
          target = { x: q.x * (1 - weight) + a.x * weight, y: q.y * (1 - weight) + a.y * weight };
          kind = 'VACANCY_RELEASE'; reason = v.releaseReason || 'ORIGINAL_FB_RETURN';
        } else if (p === cb) {
          // The outer CB protects the wide/half-space relation from its own
          // shoulder; it does not become a teleported replacement fullback.
          target = { x: clamp(Math.min(threat.x - 2.8, a.x + 2.4), 4, 68),
            y: clamp(a.y * .32 + threat.y * .68, side > 0 ? 43 : 7, side > 0 ? 61 : 25) };
          kind = 'VACANCY_REMOTE_WATCH'; reason = 'VACATED_WIDE_CHANNEL_REMOTE_WATCH';
        } else if (p === dm) {
          target = { x: clamp(Math.min(threat.x - 5.2, a.x + 3.1), 6, 70), y: clamp(a.y * .56 + threat.y * .44, 10, 58) };
          kind = 'VACANCY_HALFSPACE_SCREEN'; reason = 'VACATED_WIDE_CHANNEL_HALFSPACE_SCREEN';
        } else {
          target = { x: clamp(Math.min(threat.x - 7.4, a.x + 4.2), 9, 74), y: clamp(a.y * .73 + threat.y * .27, 10, 58) };
          kind = 'VACANCY_LANE_SHARE'; reason = 'VACATED_WIDE_CHANNEL_LANE_SHARE';
        }
        const wideOwner = p === cb && !release;
        publishResponsibility(s, team, p, wideOwner ? 'MARK' : release ? 'RECOVERY' : 'COVER', target, kind,
          { subjectId: winger?.id ?? null, region: a, reason, pressureOwner: null, markShadow: wideOwner,
            markTargetId: wideOwner ? winger?.id ?? null : null, watchTargetId: wideOwner ? winger?.id ?? null : null,
            releaseReason: release ? 'GRADUAL_ROLE_REJOIN' : 'VACANCY_HANDED_BACK',
            handoff: { from: fb?.id ?? null, to: p.id, subjectId: winger?.id ?? null, reason: v.channel } });
      }
    }
  }
  function applyFullbackAttackResponsibility(s, team, owner, anchors) {
    const b = local(s, team, s.ball.x, s.ball.y);
    const defenders = s.players.filter(p => p.team === team && ['LB', 'LCB', 'RCB', 'RB'].includes(p.role));
    const cbs = defenders.filter(p => p.role === 'LCB' || p.role === 'RCB');
    const dm = s.players.find(p => p.team === team && p.role === 'DM');
    const threats = s.players.filter(p => p.team !== team && p.role !== 'GK').map(p => ({ p, q: local(s, team, p.x, p.y) }));
    const central = threats.filter(t => Math.abs(t.q.y - 34) < 6).sort((a, b2) => a.q.x - b2.q.x)[0]?.p || null;
    for (const fb of defenders.filter(p => p.role === 'LB' || p.role === 'RB')) {
      // The ball owner already has the current CARRY command. A rest-defence
      // proposal can describe other players, never replace that action.
      if (fb.id === owner.id) continue;
      const side = fb.role === 'LB' ? -1 : 1;
      const winger = threats.filter(t => side < 0 ? t.q.y < 34 : t.q.y >= 34).sort((a, b2) => a.q.x - b2.q.x)[0]?.p;
      if (!winger) continue;
      const anchor = anchors.get(fb.id);
      const fq = local(s, team, fb.x, fb.y), oq = local(s, team, owner.x, owner.y);
      const possessionOurs = owner.team === team && s.possession === team;
      const wideProgression = (side < 0 ? oq.y < 29 : oq.y > 39) && oq.x > 43;
      const receivingWidePass = owner.id === fb.id || (wideProgression && distance(fb, owner) < 16);
      const crossingContinuation = owner.id === fb.id && oq.x > 68;
      const validExcursionReason = receivingWidePass || crossingContinuation || (wideProgression && distance(fb, owner) < 16);
      // This is a present-state threat gate, not a prediction of the next pass:
      // an FB can go only while the tracked winger is currently recoverable as a
      // genuine defensive concern, with an existing team cover relation.
      const wingerQ = local(s, team, winger.x, winger.y);
      const presentThreat = wingerQ.x < 60 || distance(owner, winger) < 28;
      const cb = cbs.slice().sort((a, b2) => distance(a, winger) - distance(b2, winger) || a.id - b2.id)[0];
      const centralBackup = central && [...cbs.filter(p => p !== cb), dm].filter(Boolean).sort((a, b2) => distance(a, central) - distance(b2, central) || a.id - b2.id)[0];
      const cbAnchor = cb && anchors.get(cb.id), backupAnchor = centralBackup && anchors.get(centralBackup.id);
      const attackTrigger = possessionOurs && validExcursionReason && presentThreat;
      // Handoff is accepted only when the stepping CB is local to its region and
      // a distinct central protector remains.  The FB cannot self-authorize it.
      const handoff = !!(attackTrigger && cb && centralBackup && cb !== centralBackup && cbAnchor && backupAnchor
        && distance(cb, winger) <= cbAnchor.span * 1.12 && Math.abs(local(s, team, centralBackup.x, centralBackup.y).y - 34) <= backupAnchor.span * 1.22);
      const coverPresent = !!(handoff || (cb && dm && cbAnchor && distance(cb, winger) <= cbAnchor.span * 1.42));
      const envelope = !handoff && attackTrigger && coverPresent && recoverableWideEnvelope(s, team, fb, winger, owner);
      if (handoff) {
        const transfer = { from: fb.id, to: cb.id, subjectId: winger.id, reason: 'WIDE_ATTACK_COVER_ACCEPTED' };
        publishResponsibility(s, team, cb, 'MARK', shadowTarget(cbAnchor, { q: local(s, team, winger.x, winger.y) }), 'CB_HANDOFF_WIDE', { subjectId: winger.id, region: cbAnchor, handoff: transfer, protectedBy: centralBackup.id });
        if (central) publishResponsibility(s, team, centralBackup, 'MARK', shadowTarget(backupAnchor, { q: local(s, team, central.x, central.y) }), 'CENTRAL_HANDOFF_BACKUP', { subjectId: central.id, region: backupAnchor, handoff: { from: cb.id, to: centralBackup.id, subjectId: central.id, reason: 'CENTRAL_LANE_RETAINED' } });
      }
      if (attackTrigger && (handoff || envelope)) {
        const forward = clamp(Math.max(fq.x + 4, Math.min(oq.x + 3, 88)), 4, 94);
        const vacancy = confirmVacancy(s, team, fb, winger, handoff ? 'ATTACK_SUPPORT_WITH_CB_DM_HANDOFF' : 'ATTACK_SUPPORT_RECOVERABLE_ENVELOPE');
        publishResponsibility(s, team, fb, 'RUN', { x: forward, y: clamp(oq.y * .76 + HOME[fb.slot][1] * .24, 3, 65) }, 'ATTACKING_WIDE_SUPPORT',
          { region: anchor, attackTrigger: true, recoverableEnvelope: envelope,
            handoff: { from: fb.id, to: cb?.id ?? null, subjectId: winger.id, reason: vacancy.channel } });
      } else {
        publishResponsibility(s, team, fb, 'MARK', shadowTarget(anchor, { q: local(s, team, winger.x, winger.y) }), attackTrigger ? 'RECOVERABLE_ENVELOPE_BLOCK' : 'WIDE_RESPONSIBILITY_RETAINED',
          { subjectId: winger.id, region: anchor, attackTrigger, recoverableEnvelope: envelope, releaseReason: 'ATTACK_SUPPORT_NOT_SAFE' });
      }
    }
  }
  function stabilizeMovementIntents(s) {
    // setTargets computes the current tactical truth every tick.  Defenders that are
    // neither pressing nor receiving retain a short, role/context-bound intent until
    // a material relationship changes.  This is deliberately not per-player noise:
    // line role, threat relationship, ball side and urgency define the review window.
    for (const p of s.players) {
      if (p.role === 'GK' || s.phase !== 'play' || p.duty === 'RECEIVE' || p.duty === 'CARRY') {
        p.movementIntent = { target: { ...p.target }, duty: p.duty, markId: p.markId, pressId: p.pressId,
          responsibilityVersion: p.responsibility?.version ?? 0, responsibility: p.responsibility ? copy(p.responsibility) : null, defensiveContext: p.defensiveContext ? copy(p.defensiveContext) : null, reviewAt: s.time, turnNow: false };
        continue;
      }
      // `target` and responsibility remain the present tactical authority.  The
      // held value below is only the motor destination consumed by integratePlayers.
      // Keeping those layers distinct is important: a spatial deadband must never
      // roll a current MARK/WATCH/PRESS contract back to a prior one.
      const raw = { target: { ...p.target }, duty: p.duty, markId: p.markId, pressId: p.pressId,
        responsibilityVersion: p.responsibility?.version ?? 0, responsibility: p.responsibility ? copy(p.responsibility) : null, defensiveContext: p.defensiveContext ? copy(p.defensiveContext) : null };
      const old = p.movementIntent;
      const b = local(s, p.team, s.ball.x, s.ball.y);
      const ballSide = b.y < 31 ? -1 : b.y > 37 ? 1 : 0;
      const defensive = s.ball.owner !== null && s.players[s.ball.owner].team !== p.team;
      const ballDistance = distance(p, s.ball);
      const lineRole = p.slot <= 4 ? 'BACK_LINE' : p.slot <= 7 ? 'MID_BLOCK' : 'FRONT';
      const marked = raw.markId === null ? null : s.players[raw.markId];
      const cadence = raw.duty === 'MARK' ? (lineRole === 'BACK_LINE' ? 0.19 : lineRole === 'MID_BLOCK' ? 0.15 : 0.12)
        : raw.duty === 'RECOVERY' ? 0.1 : lineRole === 'BACK_LINE' ? 0.2 : lineRole === 'MID_BLOCK' ? 0.17 : 0.14;
      const relationshipDistance = marked ? clamp(distance(p, marked) / 90, 0, 0.1) : 0;
      const reviewWindow = cadence + relationshipDistance + clamp(ballDistance / 180, 0, 0.16) + (ballSide === 0 ? 0.03 : 0);
      const delta = old ? distance(raw.target, old.target) : Infinity;
      const meaningfulDelta = raw.duty === 'MARK' ? 0.32 : lineRole === 'BACK_LINE' ? 0.48 : 0.4;
      // Versions are audit sequencing, not a new motor instruction.  Several
      // current defensive writers may republish the same relationship in a tick.
      // Keep the newest responsibility live, while only a changed actor/lane/phase
      // is allowed to reset a held motor destination.
      const relationshipKey = `${raw.duty}|${raw.responsibility?.subjectId ?? ''}|${raw.markId ?? ''}|${raw.pressId ?? ''}|${raw.responsibility?.watchTargetId ?? ''}|${raw.responsibility?.pressureTargetId ?? ''}|${raw.responsibility?.pressPhase ?? ''}`;
      const dutyChanged = !old || relationshipKey !== old.relationshipKey;
      const replacement = old && raw.markId !== old.markId ? s.players[raw.markId] : null;
      // A ranking tie must not make every marker swap together.  A new mark is
      // immediate only when it is a locally dangerous relationship; otherwise the
      // held goal-side position remains valid until its own short review/delta gate.
      const urgentMarkChange = !!replacement && distance(p, replacement) < 5 && distance(replacement, s.ball) < 4;
      const relationshipChanged = dutyChanged || urgentMarkChange;
      const sideChanged = old && old.ballSide !== ballSide && (defensive || raw.duty === 'RECOVERY') && ballDistance < 18;
      const urgent = defensive && ballDistance < 10 && (raw.duty === 'PRESS' || raw.duty === 'RECOVERY');
      // Crossing the dead-zone alone is not an immediate command: otherwise a
      // common moving threat still releases a whole line on the same tick.  A large
      // relocation, danger, or role/side transition remains immediate.
      const majorRelocation = delta >= meaningfulDelta * (raw.duty === 'MARK' ? 6 : 3);
      // A review expiry is permission to reconsider, not a command to move.  The
      // raw target must have left its role-sensitive spatial deadband unless a
      // present responsibility/threat/side change makes it urgent.  This prevents
      // a slow stream of tiny anchor refinements from alternately pulling a player
      // across an already-valid position.
      const materialAdjustment = delta >= meaningfulDelta;
      const accept = !old || relationshipChanged || majorRelocation || sideChanged || urgent
        || (s.time >= old.reviewAt && materialAdjustment);
      if (accept) {
        // A meaningful target may redirect a walking player immediately; target noise may not.
        p.movementIntent = { ...raw, relationshipKey, ballSide, reviewAt: s.time + reviewWindow,
          turnNow: !!old && (relationshipChanged || majorRelocation || sideChanged) };
      } else {
        // Do not restore the old responsibility here.  Its target may be held for
        // motor stability, while MatchState still exposes the latest responsibility
        // and facing authority from this tick.
        p.movementIntent = { ...old, turnNow: false };
      }
    }
  }
  function defensiveAnchors(s, team) {
    const out = new Map();
    for (const p of s.players.filter(p => p.team === team && p.role !== 'GK')) {
      out.set(p.id, v3DefensiveAnchor(s, team, p));
    }
    return out;
  }
  function allocateLooseBall(s, team, ours, anchors) {
    const targetId = s.ball.flight?.type === 'pass' ? s.ball.flight.targetId : null;
    const predicted = { x: s.ball.x + s.ball.vx * .22, y: s.ball.y + s.ball.vy * .22 };
    const candidates = ours.map(p => {
      const a = anchors.get(p.id), q = local(s, team, p.x, p.y), b = local(s, team, predicted.x, predicted.y);
      const travel = Math.hypot(q.x - b.x, q.y - b.y), departure = Math.hypot(q.x - a.x, q.y - a.y);
      const corridor = a.lane === 'CENTRAL' || (a.lane === 'LEFT' && b.y < 38) || (a.lane === 'RIGHT' && b.y > 30) || (a.lane === 'MID' && Math.abs(b.y - a.y) < a.span);
      return { p, a, travel, departure, corridor, score: travel + departure * .35 + (corridor ? 0 : a.span) };
    }).filter(x => x.corridor && x.travel <= x.a.span * 1.75).sort((a, b) => a.score - b.score || a.p.id - b.p.id);
    const intended = targetId === null ? null : ours.find(p => p.id === targetId);
    const selected = intended ? [{ p: intended, a: anchors.get(intended.id) }] : candidates.slice(0, 1);
    // A second claimant needs a distinct local corridor; it cannot be an unrelated
    // CF/RB recruited solely by Euclidean rank.
    const helper = candidates.find(x => !selected.some(y => y.p.id === x.p.id) && x.a.lane !== selected[0]?.a.lane && x.travel < x.a.span * 1.05);
    if (helper) selected.push(helper);
    for (const item of selected) publishResponsibility(s, team, item.p, 'RECEIVE', local(s, team, predicted.x, predicted.y), 'LOOSE_BALL_CLAIM', { subjectId: targetId, region: item.a, releaseReason: 'CLAIM_UNTIL_CONTROL_OR_CORRIDOR_EXIT' });
  }
  function setFacing(p, dx, dy, source) {
    if (Math.hypot(dx, dy) > .04) p.facingRadians = Math.atan2(dy, dx);
    p.facingSource = source;
    const desired = p.facingRadians;
    const explicit = new Set(['PASS', 'SHOT', 'CARRY', 'RECEIVE', 'POSSESSION_TRANSITION']);
    const prior = p.renderFacingRadians;
    if (!Number.isFinite(prior) || explicit.has(source) || p.renderFacingSource !== source) {
      p.renderFacingRadians = desired;
    } else if (source === 'CONTAIN_MARK_HALF_OPEN' || source === 'RECOVERY') {
      // The authority above remains exact.  Only the body/arrow presentation gets
      // a serialized deadband and turn-rate cap while its defensive source holds.
      let delta = desired - prior;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) > .055) p.renderFacingRadians = prior + Math.sign(delta) * Math.min(Math.abs(delta), .22);
    } else {
      p.renderFacingRadians = desired;
    }
    p.renderFacingSource = source;
  }
  function updateMatchFacing(s) {
    // Facing priority is MatchState authority: current selected/physical action,
    // then receipt, then current defensive relationship, then movement.  It never
    // reads a future result and does not rely on renderer velocity arrows.
    for (const p of s.players) {
      if (p.role === 'GK') {
        const defending = s.ball.owner === null || s.players[s.ball.owner]?.team !== p.team;
        setFacing(p, s.ball.x - p.x, s.ball.y - p.y, defending ? (s.ball.flight?.type === 'shot' ? 'SHOT' : 'BALL') : 'BUILD_OUT');
        continue;
      }
      const action = p.facingIntent;
      if (action && action.until > s.time) {
        setFacing(p, action.dx, action.dy, action.source);
        continue;
      }
      if (action && action.until <= s.time) p.facingIntent = null;
      if (s.ball.owner === p.id || p.duty === 'CARRY') {
        // CARRY faces the actual current dribble/intent target.  A backwards
        // body angle therefore requires an actual backwards movement/action.
        setFacing(p, p.target.x - p.x, p.target.y - p.y, 'CARRY');
        continue;
      }
      if (p.duty === 'RECEIVE') {
        const arrival = { x: s.ball.vx, y: s.ball.vy }, next = { x: p.target.x - p.x, y: p.target.y - p.y };
        setFacing(p, arrival.x * .66 + next.x * .34, arrival.y * .66 + next.y * .34, 'RECEIVE');
        continue;
      }
      const r = p.responsibility || {}, watchId = r.watchTargetId ?? r.markTargetId ?? null;
      const watch = Number.isInteger(watchId) ? s.players[watchId] : null;
      const defending = s.ball.owner === null || s.players[s.ball.owner]?.team !== p.team;
      if (defending && (p.duty === 'PRESS' || p.duty === 'MARK' || watch)) {
        const ballWeight = p.duty === 'PRESS' ? .76 : .58, threatDx = watch ? watch.x - p.x : 0, threatDy = watch ? watch.y - p.y : 0;
        setFacing(p, (s.ball.x - p.x) * ballWeight + threatDx * (1 - ballWeight),
          (s.ball.y - p.y) * ballWeight + threatDy * (1 - ballWeight), 'CONTAIN_MARK_HALF_OPEN');
        continue;
      }
      if (defending && p.duty === 'RECOVERY') {
        const threatDx = watch ? watch.x - p.x : 0, threatDy = watch ? watch.y - p.y : 0;
        setFacing(p, (p.target.x - p.x) * .64 + threatDx * .36, (p.target.y - p.y) * .64 + threatDy * .36, 'RECOVERY');
        continue;
      }
      setFacing(p, p.target.x - p.x, p.target.y - p.y, 'MOVEMENT');
    }
  }
  function setTargets(s) {
    const owner = s.ball.owner === null ? null : s.players[s.ball.owner];
    const attackTeam = owner ? owner.team : s.possession ?? s.lastPossession;
    const play = s.phase === 'play';
    if (play) prepareVacancyTick(s);
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
      finalAssignmentCommit(s, null);
      return;
    }
    for (let team = 0; team < 2; team++) {
      const ours = s.players.filter(p => p.team === team && p.role !== 'GK');
      const anchors = defensiveAnchors(s, team);
      if (owner && owner.team !== team) {
        // Current carrier only: pressure ownership is singular and every other
        // defender retains a lane, mark shadow, or recovery responsibility.
        applyV3Defence(s, team, owner, anchors, false);
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
        applyFullbackAttackResponsibility(s, team, owner, anchors);
      } else if (s.ball.owner === null) {
        const receiver = s.ball.flight?.type === 'pass' ? s.players[s.ball.flight.targetId] : null;
        if (receiver && receiver.team !== team) {
          // The flight vector and named intended receiver are already current
          // MatchState.  This reads arrival risk; it supplies no future result.
          applyV3Defence(s, team, receiver, anchors, true);
        } else allocateLooseBall(s, team, ours, anchors);
      }
      const keeper = s.players[team * 11];
      const kb = local(s, team, s.ball.x, s.ball.y);
      if (kb.x < 18 && kb.y > 13 && kb.y < 55 && s.ball.owner === null) {
        keeper.target = { x: clamp(s.ball.x + s.ball.vx * 0.08, team === (s.half === 1 ? 0 : 1) ? 1 : 87, team === (s.half === 1 ? 0 : 1) ? 18 : 104),
          y: clamp(s.ball.y + s.ball.vy * 0.1, 23, 45) };
      }
    }
    for (let team = 0; team < 2; team++) applyVacancyCompensation(s, team, defensiveAnchors(s, team));
    finishVacancyTick(s);
    finalAssignmentCommit(s, owner);
    updateMatchFacing(s);
    stabilizeMovementIntents(s);
  }
  // The sole ongoing player-coordinate integrator, including explicit dead-ball formation resets.
  function integratePlayers(s) {
    const resetting = s.restart && s.restart.reset;
    // C2 candidate calibration, deliberately local to this sole integrator.  It
    // is smaller than reception/challenge reach and does not confer ball authority.
    const bodyClearance = 0.70;
    const desired = s.players.map(p => {
      if (resetting) { p.motionDemand = null; return { x: p.target.x, y: p.target.y, vx: 0, vy: 0, reset: true }; }
      const motorTarget = s.phase === 'play' && p.movementIntent?.target ? p.movementIntent.target : p.target;
      let driveTarget = motorTarget;
      // A non-owner approach point may be physically occupied even though its
      // tactical responsibility is correct.  Use a nearby feasible motor point
      // without rewriting target/movementIntent or any selected action target.
      if (s.phase === 'play' && p.role !== 'GK' && p.duty !== 'CARRY') {
        for (const q of s.players) {
          if (q.id === p.id || q.role === 'GK' || distance(motorTarget, q) >= bodyClearance) continue;
          const sx = p.x - q.x, sy = p.y - q.y, separation = Math.hypot(sx, sy);
          if (separation >= bodyClearance && separation > 1e-9) {
            driveTarget = { x: q.x + sx / separation * bodyClearance, y: q.y + sy / separation * bodyClearance };
            break;
          }
        }
      }
      let dx = driveTarget.x - p.x, dy = driveTarget.y - p.y;
      const dist = Math.hypot(dx, dy);
      const max = p.attributes.pace * (p.duty === 'CARRY' ? 0.73 : p.duty === 'SUPPORT' || p.duty === 'MARK' ? 0.78 : 1);
      let vx = dist > 0.1 ? dx / dist * Math.min(max, dist * 2.5) : 0;
      let vy = dist > 0.1 ? dy / dist * Math.min(max, dist * 2.5) : 0;
      let accelerationRate = 9;
      if (s.phase === 'play' && p.role !== 'GK' && p.duty !== 'CARRY') {
        // Tactical targets/responsibilities remain current. Only motor response has
        // short, serialized memory: no delayed duty assignment or frozen target.
        const ballDistance = distance(p, s.ball);
        let nearest = 2.5, nearestOpponent = 6;
        for (const q of s.players) {
          if (q.id === p.id) continue;
          const gap = distance(p, q);
          if (gap < nearest) nearest = gap;
          if (q.team !== p.team && gap < nearestOpponent) nearestOpponent = gap;
        }
        const traffic = (2.5 - nearest) / 2.5, pressure = (6 - nearestOpponent) / 6;
        const involvement = clamp(1 - ballDistance / 24, 0, 1);
        const dutyUrgency = p.duty === 'PRESS' || p.duty === 'RECEIVE' ? 0.85
          : p.duty === 'RECOVERY' ? 0.8 : p.duty === 'RUN' ? 0.35 : 0.15;
        // Large shape deficits override leisurely support adjustment. Nearby
        // pressure/support needs also shorten response without changing top pace.
        const urgency = clamp(Math.max(dutyUrgency * (0.55 + involvement * 0.45),
          dist / 18, involvement * 0.55 + pressure * 0.3, traffic * 0.7), 0, 1);
        const response = (0.18 + (1 - p.attributes.control) * 0.3
          + (1 - p.attributes.passing) * 0.15) * (1 - urgency * 0.7);
        const demand = p.motionDemand || { vx: p.vx, vy: p.vy };
        const immediateLowSpeedTurn = !!p.movementIntent?.turnNow && Math.hypot(p.vx, p.vy) < 0.85 && dist > 0.1;
        const blend = 1 - Math.exp(-DT / response);
        if (immediateLowSpeedTurn) { demand.vx = vx; demand.vy = vy; }
        else { demand.vx += (vx - demand.vx) * blend; demand.vy += (vy - demand.vy) * blend; }
        p.motionDemand = demand;
        vx = demand.vx; vy = demand.vy;
        accelerationRate = immediateLowSpeedTurn ? 80 : 6.8 + urgency * 2.2 + (p.attributes.pace - 5.1) * 0.5;
      } else {
        // Restarts, keeper motion and explicit owner actions retain V1 response.
        p.motionDemand = null;
      }
      for (const q of s.players) {
        if (q.id === p.id) continue;
        dx = p.x - q.x; dy = p.y - q.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.05 && d > 0.01) { vx += dx / d * (1.05 - d) * 3; vy += dy / d * (1.05 - d) * 3; }
      }
      const acceleration = accelerationRate * DT, change = Math.hypot(vx - p.vx, vy - p.vy);
      const blend = change > acceleration ? acceleration / change : 1;
      vx = p.vx + (vx - p.vx) * blend; vy = p.vy + (vy - p.vy) * blend;
      const speed = Math.hypot(vx, vy);
      if (speed > max) { vx *= max / speed; vy *= max / speed; }
      return { x: clamp(p.x + vx * DT, 0.25, 104.75), y: clamp(p.y + vy * DT, 0.25, 67.75), vx, vy };
    });
    // Resolve current-tick outfield contact against the candidate displacements,
    // before the sole coordinate commit below.  Each correction removes only an
    // inward component; it never pushes a player beyond their starting point,
    // changes a tactical target, or creates a challenge/possession event.
    if (!resetting && s.phase === 'play') {
      let yieldMetres = 0, contacts = 0;
      const validStart = (a, b) => distance(a, b) >= bodyClearance - 1e-9;
      // A short fixed bound lets three-player convergence settle without an
      // unbounded rigid-body loop.  Every pass is monotone: only inward travel is
      // removed, so interruption cannot leave a second coordinate authority.
      for (let iteration = 0; iteration < 12; iteration++) {
        let changed = false;
        for (let i = 0; i < s.players.length; i++) for (let j = i + 1; j < s.players.length; j++) {
          const a = s.players[i], b = s.players[j];
          if (a.role === 'GK' || b.role === 'GK' || !validStart(a, b)) continue;
          const sx = a.x - b.x, sy = a.y - b.y, startDistance = Math.hypot(sx, sy);
          const dax = desired[i].x - a.x, day = desired[i].y - a.y;
          const dbx = desired[j].x - b.x, dby = desired[j].y - b.y;
          const rx = dax - dbx, ry = day - dby, relative2 = rx * rx + ry * ry;
          const u = relative2 > 1e-15 ? clamp(-(sx * rx + sy * ry) / relative2, 0, 1) : 0;
          if (Math.hypot(sx + rx * u, sy + ry * u) >= bodyClearance - 1e-9) continue;
          const nx = sx / startDistance, ny = sy / startDistance;
          const inwardA = Math.max(0, -(dax * nx + day * ny));
          const inwardB = Math.max(0, dbx * nx + dby * ny);
          const allowedClosing = Math.max(0, startDistance - bodyClearance);
          const closing = -(rx * nx + ry * ny);
          const excess = Math.max(0, closing - allowedClosing);
          const capacity = inwardA + inwardB;
          if (excess <= 1e-12 || capacity <= 1e-12) continue;
          const removeA = Math.min(inwardA, excess * inwardA / capacity);
          const removeB = Math.min(inwardB, excess - removeA);
          desired[i].x += nx * removeA; desired[i].y += ny * removeA;
          desired[j].x -= nx * removeB; desired[j].y -= ny * removeB;
          yieldMetres += removeA + removeB; contacts++;
          changed = true;
        }
        if (!changed) break;
      }
      let residual = 0, malformed = 0;
      for (let i = 0; i < s.players.length; i++) for (let j = i + 1; j < s.players.length; j++) {
        const a = s.players[i], b = s.players[j];
        if (a.role === 'GK' || b.role === 'GK') continue;
        const startDistance = distance(a, b);
        if (startDistance < bodyClearance - 1e-9) { malformed++; continue; }
        const sx = a.x - b.x, sy = a.y - b.y;
        const rx = (desired[i].x - a.x) - (desired[j].x - b.x);
        const ry = (desired[i].y - a.y) - (desired[j].y - b.y);
        const relative2 = rx * rx + ry * ry;
        const u = relative2 > 1e-15 ? clamp(-(sx * rx + sy * ry) / relative2, 0, 1) : 0;
        if (Math.hypot(sx + rx * u, sy + ry * u) < bodyClearance - 1e-6) residual++;
      }
      s.diagnostics.bodyContactConstraints = (s.diagnostics.bodyContactConstraints || 0) + contacts;
      s.diagnostics.bodyYieldMetres = (s.diagnostics.bodyYieldMetres || 0) + yieldMetres;
      s.diagnostics.bodyResidualPenetrations = (s.diagnostics.bodyResidualPenetrations || 0) + residual;
      s.diagnostics.bodyMalformedStarts = (s.diagnostics.bodyMalformedStarts || 0) + malformed;
      for (let i = 0; i < s.players.length; i++) {
        desired[i].vx = (desired[i].x - s.players[i].x) / DT;
        desired[i].vy = (desired[i].y - s.players[i].y) / DT;
      }
    }
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
    p.facingIntent = { source: type === 'shot' ? 'SHOT' : 'PASS', dx: dx, dy: dy, until: s.time + .34 };
    setFacing(p, dx, dy, p.facingIntent.source);
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
        if (input.type === 'carry') {
          p.intent = { aim: { ...input.aim }, until: s.time + 0.5 };
          p.target = { ...input.aim }; p.facingIntent = null;
          // `setTargets` has already run this tick.  Commit the selected target
          // into the motor now, rather than allowing its stale pre-input intent
          // to choose the first realised velocity.
          publishCurrentAction(s, p, 'CARRY', p.target, 'SELECTED_CARRY_OWNER');
          p.movementIntent = { target: { ...p.target }, duty: 'CARRY', markId: null, pressId: null,
            responsibilityVersion: p.responsibility.version, responsibility: copy(p.responsibility), defensiveContext: copy(p.defensiveContext),
            relationshipKey: 'CARRY|SELECTED', ballSide: null, reviewAt: s.time, turnNow: true };
          p.motionDemand = null;
          setFacing(p, p.target.x - p.x, p.target.y - p.y, 'CARRY'); p.decisionIn = 0.5;
        }
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
    // Contact range alone is not contest authority: a covering player who happens
    // to drift nearby keeps its lane unless it has a current press/claim intent.
    const candidates = opponents(s, p).filter(q => q.role !== 'GK' && q.challengeIn === 0 && distance(q, p) < 1.45
      && ((q.duty === 'PRESS' && q.responsibility?.challengeIntent) || q.duty === 'RECEIVE' || (s.ball.flight && q.markId === p.id)))
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
      // Only the named, same-team pass receiver gets the reception calibration.
      // Fast/high balls and actual nearby pressure still lower control; bad pass
      // accuracy, opponent interceptions, and challenge-created loose balls use
      // their own branches rather than being disguised as a first-touch error.
      const intendedReceipt = !!(flight && flight.type === 'pass' && flight.team === p.team && flight.targetId === p.id);
      const nearestOpponent = s.players.filter(q => q.team !== p.team).reduce((gap, q) => Math.min(gap, distance(p, q)), Infinity);
      const pressurePenalty = clamp((3.2 - nearestOpponent) / 12, 0, .18);
      const control = p.attributes.control + (intendedReceipt ? .58 : .46) - speed / 70 - b.z * 0.15 - pressurePenalty;
      if (random(s) < clamp(control, 0.18, 0.97)) {
        if (flight && flight.type === 'pass' && flight.team === p.team) s.stats[p.team].completedPasses++;
        else if (flight && flight.team !== p.team) event(s, 'tackle', p.team, `${p.role} intercepts`, p.id, { interception: true });
        const arrival = { dx: b.vx, dy: b.vy };
        setPossession(s, p, intendedReceipt ? arrival : null);
        if (intendedReceipt) {
          // The arrival vector was captured above before setPossession zeros the
          // controlled ball velocity; V5 control probability remains unchanged.
          p.facingIntent = { source: 'RECEIVE', dx: arrival.dx, dy: arrival.dy, until: s.time + .16 };
          setFacing(p, arrival.dx, arrival.dy, 'RECEIVE');
        }
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
