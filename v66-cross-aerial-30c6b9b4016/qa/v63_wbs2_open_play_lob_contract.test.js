'use strict';

// WBS2-A: executable baseline guards. Lob outcomes remain pending until B/C.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require('../runtime/continuous_match_core.js');
const H = require('../live_hybrid_session_v02.js');
const V = require('../live_v06_scene_authority_browser.js');
const S = require('../runtime/continuous_spatial_authority_v2.js');

const deep = value => JSON.parse(JSON.stringify(value));
const seed = 'V63-WBS2-A-CURRENT-STATE-R1';
const mirror = (team, x, y) => team === 'HOME' ? { x, y } : { x: 105 - x, y: 68 - y };

function isolatedPass(team, kind, reason, moving = false) {
  const m = E.createMatch(`${seed}|${team}|${kind}|${reason}|${moving}`);
  m.restart = null;
  m.phase = 'OPEN_PLAY';
  m.time = 100;
  for (const p of m.players) {
    const at = mirror(p.team, 5, p.slot === 'GK' ? 34 : 4);
    Object.assign(p, { ...at, tx: at.x, ty: at.y, vx: 0, vy: 0 });
  }
  const source = m.playersById[team === 'HOME' ? 'H-LCM' : 'A-LCM'];
  const target = m.playersById[team === 'HOME' ? 'H-ST' : 'A-ST'];
  const from = mirror(team, 40, 34);
  const to = mirror(team, kind === 'LONG_PASS' ? 78 : 56, 34);
  Object.assign(source, { ...from, tx: from.x, ty: from.y, vx: 0, vy: 0 });
  Object.assign(target, { ...to, tx: to.x, ty: to.y, vx: moving ? (team === 'HOME' ? 4 : -4) : 0, vy: 0 });
  E.choiceActionBridge().setControlled(m, source, true);
  const rngBefore = deep(m.r.observe());
  E.choiceActionBridge().executePass(m, source, target, kind,
    { running: moving, forward: to.x - from.x, open: 8, block: 0 }, reason);
  return { m, source, target, rngBefore };
}

test('T11/T12: existing pass families stay on their actual branches in both directions', () => {
  for (const team of ['HOME', 'AWAY']) {
    for (const [kind, reason, delivery] of [
      ['PASS', 'CANDIDATE_SAFE', 'GROUND'],
      ['PASS', 'CANDIDATE_PROGRESSIVE', 'GROUND'],
      ['THROUGH', 'CANDIDATE_THROUGH', 'GROUND'],
      ['CROSS', 'EARLY_CROSS', 'AERIAL'],
      ['LONG_PASS', 'CANDIDATE_SWITCH', null],
    ]) {
      const a = isolatedPass(team, kind, reason);
      const b = isolatedPass(team, kind, reason);
      assert.equal(a.m.ball.mode, 'FLIGHT');
      assert.equal(a.m.ball.kind, kind);
      if (delivery) assert.equal(a.m.ball.deliveryMode, delivery);
      else assert.ok(['GROUND', 'AERIAL'].includes(a.m.ball.deliveryMode));
      assert.equal(a.m.ball.intendedReceiverId, a.target.id);
      assert.equal(a.m.ball.lastTouchPlayer, a.source.id);
      assert.equal(a.m.ball.physicsProfile, undefined);
      assert.deepEqual(deep(a.m.ball), deep(b.m.ball), `${team} ${kind} launch reproducibility`);
      assert.deepEqual(a.m.r.observe(), b.m.r.observe(), `${team} ${kind} RNG reproducibility`);
      const actualDraws = a.m.r.observe().drawCount - a.rngBefore.drawCount;
      const expectedDraws = kind === 'CROSS' ? 0 : reason === 'CANDIDATE_PROGRESSIVE' && team === 'HOME' ? 6
        : kind === 'LONG_PASS' ? 4 : 3;
      assert.equal(actualDraws, expectedDraws, `${team} ${kind}/${reason} launch draw count`);
      assert.equal(a.m.ball.z > 0, a.m.ball.deliveryMode === 'AERIAL');
    }
  }
});

test('T11: moving ground reception keeps a live run; safe pass stays near feet', () => {
  const moving = isolatedPass('HOME', 'PASS', 'CANDIDATE_PROGRESSIVE', true);
  const safe = isolatedPass('HOME', 'PASS', 'CANDIDATE_SAFE', true);
  assert.equal(moving.m.ball.deliveryMode, 'GROUND');
  assert.ok(moving.target.movingReceiveApproach);
  assert.ok(Math.hypot(moving.target.tx - 56, moving.target.ty - 34) >= 1.5);
  assert.ok(Math.hypot(safe.m.ball.targetX - 56, safe.m.ball.targetY - 34) < 0.5);
  assert.ok(Math.hypot(moving.m.ball.targetX - 56, moving.m.ball.targetY - 34) >= 1.5);
});

test('T14: pending exact pair is frozen, invalid target is inert, one chosen pair commits', () => {
  const session = H.createSession({ seed, heroTeam: 'HOME', heroRole: 'ST', heroPlayerId: 'H-ST',
    durationSeconds: 180, continuousSpatialAuthorityV2Coarse: true, matchId: seed });
  const hero = session.state.spatial.players.find(p => p.id === 'H-ST');
  S.advanceCoarseTo(session, 8, { heroPlayerId: null });
  Object.assign(session.state.ball, { mode: 'CONTROLLED', kind: 'CONTROL', ownerId: hero.id,
    lastTouchPlayerId: hero.id, lastTouchTeam: hero.team, x: hero.x, y: hero.y });
  S.syncBallDerived(session.state);
  const boundary = H.advanceUntilBoundary(session).boundary;
  assert.equal(boundary.type, 'PROTAGONIST_2D_WINDOW');
  const opened = V.runToChoice(boundary, { seed: `${seed}|CHOICE`, runtimeDir: path.join(__dirname, '..', 'runtime') });
  const { state, E: core, P } = opened;
  const option = state.pending.options.find(o => o.targetId);
  assert.ok(option, 'fixture must expose a real targeted option');
  const observed = () => deep({ snapshot: core.snapshot(state.m), pending: state.pending,
    rng: state.m.r.observe(), events: state.m.events, log: state.m.userChoiceLog });
  const before = observed();
  P.step(state, 0.1);
  assert.deepEqual(observed(), before, 'no unchosen protagonist action while pending');
  assert.throws(() => V.applyChoiceAndAdvance(opened, option.id, 'INVALID-TARGET'),
    { message: 'CHOICE_TARGET_NOT_AVAILABLE' });
  assert.deepEqual(observed(), before, 'rejected pair leaves current state and RNG intact');
  const applied = V.applyChoiceAndAdvance(opened, option.id, option.targetId, { maxPostSeconds: 0.3 });
  const commits = state.m.events.filter(e => e.type === 'USER_CHOICE' && e.commitEventId === applied.applyReceipt.commitEventId);
  assert.equal(commits.length, 1);
  assert.equal(applied.selectedChoice.id, option.id);
  assert.equal(applied.applyReceipt.choice, option.id);
  assert.equal(applied.applyReceipt.targetId, option.targetId);
  assert.equal(commits[0].choiceId, option.id);
  assert.equal(commits[0].targetId, option.targetId);
  assert.equal(applied.applyReceipt.futureOutcomePrecomputed, false);
  assert.equal(applied.futureOutcomePrecomputed, false);
  assert.equal(applied.committedEvent.commitEventId, applied.applyReceipt.commitEventId);
  assert.equal(applied.committedEvent.targetId, option.targetId);
  const forbidden = [];
  const scan = (value, at) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (/^(futureOutcome|futureController|plannedOutcome|plannedController|predictedWinner)$/i.test(key)
          && item !== false && item != null) forbidden.push(`${at}.${key}`);
      if (item && typeof item === 'object') scan(item, `${at}.${key}`);
    }
  };
  scan({ receipt: applied.applyReceipt, event: applied.committedEvent, ball: state.m.ball,
    selected: applied.selectedChoice }, 'commit');
  assert.deepEqual(forbidden, [], 'commit state contains no assigned future result or controller');
  assert.equal(state.m._resolutionLease?.canonicalBall, state.m.ball);
  assert.equal(state.m._resolutionLease?.canonicalPlayers, state.m.players);
  assert.equal(state.m._resolutionLease?.resolutionRandom, state.m.r);
});

test('T15 known gap: current coarse flight advances x/y but leaves airborne z/vz unchanged', () => {
  const session = H.createSession({ seed: `${seed}|AIR-GAP`, heroTeam: 'HOME', heroRole: 'ST',
    heroPlayerId: 'H-ST', durationSeconds: 180, continuousSpatialAuthorityV2Coarse: true });
  const sp = session.state.spatial;
  for (const p of sp.players) Object.assign(p, { x: p.team === 'HOME' ? 5 : 100, y: 5, vx: 0, vy: 0 });
  Object.assign(sp.ball, { mode: 'FLIGHT', kind: 'LONG_PASS', ownerId: null,
    intendedReceiverId: null, lastTouchPlayerId: null, x: 50, y: 34, z: 2, vx: 10, vy: 0, vz: 4 });
  session.state.ball = sp.ball;
  const ball = sp.ball;
  const t = Number(sp.time);
  S.advanceCoarseTo(session, t + 0.1, { heroPlayerId: null });
  assert.equal(session.state.spatial.ball, ball, 'same canonical ball object');
  assert.equal(ball.mode, 'FLIGHT');
  assert.ok(ball.x > 50.9 && ball.x < 51.1);
  assert.equal(ball.z, 2);
  assert.equal(ball.vz, 4);
});
