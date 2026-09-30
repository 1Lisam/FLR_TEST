#!/usr/bin/env node
'use strict';
// node QA/v63_wbs2_c_root_rendered.js [--technical-only]
// All captures go to a fresh OS temporary directory. No query flags, routed
// product source, forced test dock, alternate renderer, or browser retry.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const UI = 'step71_hybrid_v06_ui.js';
const BASE = '244bbe5a63a64eed90dee0e4bc674b56688c28a8';
const VIEWPORTS = [{ width: 1440, height: 1080 }, { width: 390, height: 844 }];
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
function sourceIdentity() {
  const html = read('index.html');
  const names = new Set(['index.html', UI, 'QA/v63_wbs2_c_root_rendered.js',
    ...Array.from(html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g), m => m[1])]);
  let git;
  try { git = { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    status: execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }), origin: 'local git' }; }
  catch (error) { git = { head: process.env.V63_SOURCE_HEAD || null, status: process.env.V63_SOURCE_STATUS ?? null,
    origin: 'externally supplied local git observation', limitation: error.message }; }
  return { expectedBase: BASE, ...git,
    files: Object.fromEntries([...names].sort().map(n => [n, sha(read(n))])) };
}
function technicalChecks() {
  // Exercise the original product functions, including actual canvas operations.
  // This is explicitly non-rendered evidence; a mock canvas cannot pass C5.
  const source = read(UI), arcs = [], fills = [];
  const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : (...args) => {
    if (k === 'arc') arcs.push(args);
    if (k === 'fill') fills.push(o.fillStyle);
  } });
  const canvas = { width: 1050, height: 680 };
  const sandbox = { ctx, canvas, E: { FIELD: {} }, window: {},
    $: id => ({ checked: false, value: id === 'heroPlayer' ? 'H-ST' : '' }),
    lerp: (a, b, t) => a + (b - a) * t };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function recordedBall('), source.indexOf('// TEST_ONLY:')), sandbox);
  const frame = { time: 1, players: [], ball: { x: 50, y: 34, z: 0, mode: 'FLIGHT', vx: 12, vy: 0, vz: 4 } };
  const before = JSON.stringify(frame);
  let previous = -1;
  for (const z of [0, .001, .1, .5, 1, 2, 4, 10, 100, 1e9]) {
    const g = sandbox.ballScreenGeometry({ ...frame.ball, z }, x => x, y => y);
    assert(g.offset >= previous && g.offset >= 0 && g.offset <= 48);
    assert.equal(g.x, 50); assert.equal(g.groundY, 34);
    assert.equal(g.radius, 7 + Math.min(4, z * 1.5)); previous = g.offset;
  }
  assert.equal(sandbox.ballScreenGeometry(frame.ball, x => x, y => y).offset, 0);
  for (const z of [NaN, Infinity, -2]) assert.equal(sandbox.ballScreenGeometry({ ...frame.ball, z }, x => x, y => y).offset, 0);
  for (const z of [0, .5, 3]) {
    arcs.length = fills.length = 0;
    sandbox.draw({ ...frame, ball: { ...frame.ball, z } });
    const shadow = arcs.at(-2), ball = arcs.at(-1);
    assert.equal(shadow[0], ball[0]); assert.equal(shadow[1], 24 + 34 / 68 * 632);
    assert.equal(shadow[2], 7); assert(fills.includes('rgba(0,0,0,.32)'));
    assert(z ? ball[1] < shadow[1] : ball[1] === shadow[1]);
  }
  const a = frame.ball, b = { ...a, x: 52, z: 2 };
  assert.equal(sandbox.recordedBall(a, b, .5).z, 1);
  for (const change of [{ mode: 'CONTROLLED' }, { ownerId: 'A-ST' }, { lastTouchPlayer: 'A-ST' }, { lobBounceCount: 1 }]) {
    const next = { ...b, ...change };
    assert.equal(JSON.stringify(sandbox.recordedBall(a, next, .5)), JSON.stringify(a));
    assert.equal(JSON.stringify(sandbox.recordedBall(a, next, 1)), JSON.stringify(next));
  }
  assert.equal(sandbox.recordedBall({ ...a, vz: -2 }, { ...b, vz: 1 }, .5).x, a.x);
  assert.equal(JSON.stringify(frame), before);
  // Exercise the fixture wrapper and injection, including the root's AWAY CM fallback.
  const observed = [];
  for (const team of ['HOME', 'AWAY']) {
    const prefix = team === 'HOME' ? 'H' : 'A';
    const select = { value: 'H-ST', add() {} };
    const players = [`${prefix}-ST`, `${prefix}-LCM`, `${prefix}-RW`, `${team === 'HOME' ? 'A' : 'H'}-GK`]
      .map(id => ({ id, team: id[0] === 'H' ? 'HOME' : 'AWAY', role: id.endsWith('-ST') ? 'ST' : 'CM', x: 0, y: 0 }));
    const m = { time: 12, ball: { x: 0, y: 0, z: 0 }, players,
      playersById: Object.fromEntries(players.map(p => [p.id, p])), _resolutionLease: {},
      r: { observe: () => 7 }, events: [] };
    const session = { m, pending: null, history: [] };
    const W = { FLRPG_CONTINUOUS_CORE: { choiceActionBridge: () => ({ setControlled: () => {} }) },
      FLRPG_PROTAGONIST_MATCH_CONTROLLER: { inspect: s => s },
      FLRPG_LIVE_HYBRID_SESSION_V02: { createSession: opts => ({ opts, state: {} }) },
      FLRPG_CONTINUOUS_SPATIAL_AUTHORITY_V2: { leaseAudit: () => null } };
    const fixtureSandbox = { window: W, config: { kind: 'fixture', team },
      document: { querySelector: id => id === '#heroPlayer' ? select : { click() {} } },
      Option: function () {}, performance: { now: () => 1 }, requestAnimationFrame() {} };
    vm.runInNewContext(`(${installObserver.toString()})(config)`, fixtureSandbox);
    const world = W.FLRPG_LIVE_HYBRID_SESSION_V02.createSession({ seed: `LIVE-V03-1-${prefix}-ST`,
      heroTeam: 'HOME', heroRole: team === 'HOME' ? 'ST' : 'CM', heroPlayerId: `${prefix}-ST` });
    session.heroPlayerId = world.opts.heroPlayerId;
    W.FLRPG_PROTAGONIST_MATCH_CONTROLLER.inspect(session);
    const fixture = W.__c5.fixtures[0], after = fixture?.after;
    assert.equal(world.opts.heroTeam, team); assert.equal(world.opts.heroPlayerId, `${prefix}-ST`);
    assert.equal(world.opts.heroRole, 'ST'); assert.equal(world.opts.seed, `LIVE-V03-1-${prefix}-ST`);
    assert.equal(W.__c5.fixtures.length, 1); assert.equal(fixture.id, 'C5-ROOT-16M-TWO-TARGETS-1');
    assert.equal(W.__c5.targetId, `${prefix}-LCM`); assert.equal(W.__c5.secondId, `${prefix}-RW`);
    const at = (x, y) => team === 'HOME' ? [x, y] : [105 - x, 68 - y];
    for (const [id, x, y] of [[`${prefix}-ST`, 40, 34], [`${prefix}-LCM`, 56, 34], [`${prefix}-RW`, 48, 44]]) {
      const p = after.players.find(row => row.id === id);
      assert(p, `MISSING_FIXTURE_PLAYER_${id}`);
      assert.equal(p.team, team); assert.equal(p.x, at(x, y)[0]); assert.equal(p.y, at(x, y)[1]);
    }
    assert.equal(after.players.find(p => p.id === `${prefix}-LCM`).vx, team === 'HOME' ? 4 : -4);
    if (team === 'AWAY') assert.equal(select.value, 'A-ST');
    observed.push({ team, heroPlayerId: world.opts.heroPlayerId, heroRole: world.opts.heroRole,
      targetId: W.__c5.targetId, secondId: W.__c5.secondId, attackX: at(56, 34)[0] - at(40, 34)[0] });
  }
  return { status: 'NON_RENDERED_PASS', checks: ['bounded monotone z projection', 'ground xy shadow and landing convergence',
    'existing modest radius', 'recorded interpolation and contact/bounce endpoint hold', 'draw does not mutate input',
    'HOME/AWAY fixture ST role, exact identities, mirrored positions and attack direction'], fixtureContract: observed,
    limitation: 'No DOM, browser pixels, menu hit testing, or C5 integrated verdict from these checks.' };
}

// Installed after the default page loads. Wrappers call original public APIs;
// the single fixture injection is declared, captured, and never called natural.
function installObserver(config) {
  const W = window, E = W.FLRPG_CONTINUOUS_CORE, P = W.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
  const H = W.FLRPG_LIVE_HYBRID_SESSION_V02, V = W.FLRPG_CONTINUOUS_SPATIAL_AUTHORITY_V2;
  if (!E || !P || !H || !V) throw new Error('DEFAULT_ROOT_APIS_MISSING');
  const clone = x => x == null ? null : JSON.parse(JSON.stringify(x, (_k, v) => v instanceof Set ? [...v] : v));
  const q = W.__c5 = { config, draws: [], steps: [], inputs: [], pending: [], resumes: [], replays: [], raf: [],
    fixtures: [], safety: [], errors: [], world: null, session: null };
  const now = () => performance.now();
  const lease = () => V.leaseAudit(q.world?._v2ResolutionLease);
  const state = s => ({ time: s?.m?.time, ball: clone(s?.m?.ball), rng: clone(s?.m?.r?.observe?.()),
    lastLobReceipt: clone(s?.m?.lastLobReceipt), events: clone(s?.m?.events), lease: lease(),
    players: clone(s?.m?.players?.map(p => ({ id: p.id, team: p.team, role: p.role, x: p.x, y: p.y,
      vx: p.vx, vy: p.vy, action: p.action, tacticalTask: p.tacticalTask,
      currentBallDistance: Math.hypot(p.x - s.m.ball.x, p.y - s.m.ball.y), ballHeight: s.m.ball.z }))),
    pending: clone(s?.pending), futureOutcomePrecomputed: s?.futureOutcomePrecomputed === true || s?.m?.futureOutcomePrecomputed === true });
  const signature = s => JSON.stringify({ state: state(s), history: s.history, world: q.world.state });
  const create = H.createSession;
  H.createSession = function (opts) {
    const configured = config.kind === 'fixture' ? { ...opts, heroTeam: config.team, heroRole: 'ST',
      heroPlayerId: config.team === 'HOME' ? 'H-ST' : 'A-ST' } : opts;
    q.world = create.call(this, configured); q.seed = configured.seed; return q.world;
  };
  let injected = false;
  const inspect = P.inspect;
  P.inspect = function (s) {
    q.session = s;
    if (config.kind === 'fixture' && !injected && s.m?._resolutionLease) {
      injected = true;
      const m = s.m, team = config.team, prefix = team === 'HOME' ? 'H' : 'A';
      const at = (x, y) => team === 'HOME' ? { x, y } : { x: 105 - x, y: 68 - y };
      const before = state(s);
      m.restart = null; m.setPieceLive = null; m.phase = 'OPEN_PLAY';
      for (const p of m.players) Object.assign(p, { ...at(p.team === team ? 5 : 100, 5), vx: 0, vy: 0, nextThink: m.time, lockTargetUntil: 0 });
      const hero = m.playersById[s.heroPlayerId], target = m.playersById[`${prefix}-LCM`], second = m.playersById[`${prefix}-RW`];
      Object.assign(hero, at(40, 34)); Object.assign(target, { ...at(56, 34), vx: team === 'HOME' ? 4 : -4,
        tacticalTask: 'ST_RELEASE_RUN', runUntil: m.time + 10, runType: 'RELEASE' });
      Object.assign(second, at(48, 44));
      for (const p of m.players) { p.tx = p.x; p.ty = p.y; }
      E.choiceActionBridge().setControlled(m, hero, true); hero.nextThink = m.time; hero.controlledSince = m.time - 1;
      q.targetId = target.id; q.secondId = second.id;
      q.fixtures.push({ id: 'C5-ROOT-16M-TWO-TARGETS-1', injectedAt: now(), before, after: state(s),
        note: 'Current canonical leased positions only; no forged choices, future trajectories, outcomes, or post-launch edits.' });
    }
    return inspect.apply(this, arguments);
  };
  W.FLR_QA_SHOW_PENDING_CAPTURE = row => {
    q.session = row.session;
    q.pending.push({ at: now(), seed: row.meta.seed, meta: clone(row.meta), state: state(row.session) });
  };
  W.FLR_QA_ROOT_DRAW_CAPTURE = row => {
    const c = document.querySelector('#heroPitch'), ctx = c.getContext('2d'), v = row.ballView;
    const pixel = (x, y) => x >= 0 && x < c.width && y >= 0 && y < c.height
      ? [...ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data] : null;
    q.draws.push({ index: q.draws.length, at: now(), timeOrigin: performance.timeOrigin, ...clone(row),
      rasterProbe: { ball: pixel(v.x, v.y), shadow: pixel(v.x, v.groundY), separated: v.offset > v.radius + 7 },
      // Live state is separately labelled: it must not be attributed to a past replay frame.
      live: { time: q.session?.m?.time, lease: lease(), lastLobReceipt: clone(q.session?.m?.lastLobReceipt) } });
  };
  const apply = P.applyChoice;
  P.applyChoice = function (s, id, targetId, meta) {
    const before = state(s), result = apply.apply(this, arguments);
    q.inputs.push({ at: now(), choiceId: id, targetId, meta: clone(meta), before, result: clone(result), after: state(s),
      receiptText: document.querySelector('#heroChoiceReceiptText')?.textContent });
    return result;
  };
  const step = P.step;
  P.step = function (s, dt) {
    const result = step.apply(this, arguments); q.session = s;
    q.steps.push({ at: now(), dt, ...state(s) });
    if (!q.safety.length && s.m.ball.physicsProfile === 'OPEN_PLAY_LOB_V1' && s.m.ball.z > .1) {
      const before = signature(s), refs = [s.m.ball, s.m.r, s.history, q.world.state.spatial];
      let error = null;
      try { H.resumeFromHighRes(q.world, { state: s, snapshot: E.snapshot(s.m), actualEvents: s.m.events }); }
      catch (e) { error = e.message; }
      q.safety.push({ at: now(), error, unchanged: signature(s) === before,
        identities: refs.every((r, i) => r === [s.m.ball, s.m.r, s.history, q.world.state.spatial][i]) });
    }
    return result;
  };
  const resume = H.resumeFromHighRes;
  H.resumeFromHighRes = function (world, out) {
    const s = out.state, before = s ? state(s) : null;
    const refs = [world.state.spatial, s?.m?.ball, s?.m?.r, s?.history, ...(s?.m?.players || [])];
    try {
      const result = resume.apply(this, arguments);
      q.resumes.push({ at: now(), accepted: true, before, after: s ? state(s) : null,
        identities: refs.every((r, i) => r === [world.state.spatial, s?.m?.ball, s?.m?.r, s?.history, ...(s?.m?.players || [])][i]) });
      return result;
    } catch (error) {
      q.resumes.push({ at: now(), accepted: false, error: error.message, before, after: s ? state(s) : null }); throw error;
    }
  };
  for (const name of ['latestReplay', 'episodeReplay']) {
    const original = P[name];
    P[name] = function () { const frames = original.apply(this, arguments); q.replays.push({ at: now(), name, frames: clone(frames) }); return frames; };
  }
  q.probeInvalid = () => {
    const s = q.session, before = signature(s), p = s.pending;
    const result = P.applyChoice(s, 'LOB_PASS', 'MISSING-C5-TARGET', { source: 'USER_UI_CLICK_IN_PITCH',
      confirmedAction: true, actionGestureId: 'C5-INVALID-PROBE', pendingChoiceId: p.id });
    return { result, unchanged: signature(s) === before };
  };
  q.export = () => {
    const { world, session, export: _export, probeInvalid, ...data } = q;
    return clone({ ...data, final: session ? state(session) : null, world: { status: world?.status, second: world?.state?.second,
      seed: world?.opts?.seed, lease: lease(), trace: H.authorityTraceSnapshot?.(world) } });
  };
  function raf(ts) { q.raf.push({ at: ts, draw: q.draws.length - 1, phase: q.draws.at(-1)?.phase }); if (!q.stopped) requestAnimationFrame(raf); }
  requestAnimationFrame(raf);
  if (config.kind === 'fixture' && config.team === 'AWAY') {
    const select = document.querySelector('#heroPlayer');
    select.add(new Option('QA AWAY ST (fixture only)', 'A-ST')); select.value = 'A-ST';
  }
  document.querySelector('#heroReset').click();
}

function inspectMenu() {
  const menu = document.querySelector('.in-pitch-choice-menu');
  const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
  const mr = rect(menu), stage = rect(document.querySelector('.pitch-stage'));
  const options = [...menu.querySelectorAll('.in-pitch-choice-option')].map(e => {
    const r = rect(e), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { choiceId: e.dataset.choiceId, targetId: e.dataset.targetId, label: e.textContent, aria: e.getAttribute('aria-label'),
      rect: r, hit: hit === e || e.contains(hit), fits: e.scrollWidth <= e.clientWidth + 1 };
  });
  const c = document.querySelector('#heroPitch'), cr = rect(c), v = window.__c5.draws.at(-1)?.ballView;
  const ball = v && { x: cr.x + v.x / c.width * cr.width, y: cr.y + v.y / c.height * cr.height,
    radius: v.radius / c.width * cr.width };
  const ballCovered = ball && ball.x + ball.radius > mr.x && ball.x - ball.radius < mr.right && ball.y + ball.radius > mr.y && ball.y - ball.radius < mr.bottom;
  return { menu: mr, stage, options, ball, ballCovered, pages: [...menu.querySelectorAll('.in-pitch-choice-page')].map(e => e.textContent),
    inBounds: mr.x >= stage.x && mr.y >= stage.y && mr.right <= stage.right + 1 && mr.bottom <= stage.bottom + 1 };
}
async function sample(browser, output, viewport, config) {
  const id = `${viewport.width}-${config.kind}-${config.team}`;
  const dir = path.join(output, id); fs.mkdirSync(dir);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width <= 760 });
  const page = await context.newPage(), errors = [], screens = [], menus = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let cdp, count = 0, captureBytes = 0, captureTruncated = false, data, failure = null, replayCheck = null, inputCheck = null;
  try {
    await page.addInitScript(() => { window.__FLR_V63_ROOT_RENDERED_QA__ = true; });
    await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
    assert.equal(new URL(page.url()).search, '');
    assert(await page.evaluate(() => !window.FLR_V43_ORIGINAL_VIEWER_ADAPTER && !document.querySelector('script[src="final_match_test_dock.js"]')));
    await page.evaluate(installObserver, config);
    cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', event => {
      const buffer = Buffer.from(event.data, 'base64');
      if (count >= 1800 || captureBytes + buffer.length > 64 * 1024 * 1024) {
        captureTruncated = true;
        cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
        cdp.send('Page.stopScreencast').catch(() => {}); return;
      }
      captureBytes += buffer.length;
      const filename = `${String(count++).padStart(6, '0')}.jpg`;
      fs.writeFileSync(path.join(dir, filename), buffer);
      screens.push({ filename, metadata: event.metadata, sessionId: event.sessionId });
      cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 });
    await page.locator('#heroStart').click();
    await page.waitForFunction(() => window.__c5.pending.length && !document.querySelector('#heroChoicePanel').hidden, null, { timeout: 90000 });
    const pending = await page.evaluate(() => window.__c5.pending.at(-1));
    const lob = pending.state.pending.options.find(o => o.id === 'LOB_PASS');
    const selected = config.kind === 'fixture'
      ? pending.state.pending.options.find(o => o.id === 'LOB_PASS' && o.targetId === (config.team === 'HOME' ? 'H-LCM' : 'A-LCM'))
      : lob || pending.state.pending.options[0];
    assert(selected, 'NO_LEGAL_SELECTED_OPTION');
    const heroId = pending.meta.heroPlayerId, targetId = selected.targetId || heroId;
    const target = page.locator(`.in-pitch-target[data-player-id="${targetId}"]`);
    const beforeInputs = await page.evaluate(() => window.__c5.inputs.length);
    if (viewport.width <= 760) await target.tap(); else await target.click();
    await page.waitForFunction(() => document.querySelector('.in-pitch-choice-menu')?.classList.contains('open'));
    // Allow the existing 130 ms second-gesture arm and capture >= .3 s prelaunch.
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__c5.inputs.length), beforeInputs, 'TARGET_SELECTION_COMMITTED');
    menus.push(await page.evaluate(inspectMenu));
    if (config.kind === 'fixture') {
      assert(menus[0].options.some(o => o.choiceId === 'LOB_PASS'));
      assert(menus[0].options.some(o => /PASS$|^RECYCLE$/.test(o.choiceId) && o.choiceId !== 'LOB_PASS'), 'SAME_TARGET_GROUND_MISSING');
      const secondId = config.team === 'HOME' ? 'H-RW' : 'A-RW';
      const second = page.locator(`.in-pitch-target[data-player-id="${secondId}"]`);
      if (viewport.width <= 760) await second.tap(); else await second.click();
      await page.waitForFunction(id => document.querySelector('.in-pitch-choice-menu .in-pitch-choice-option')?.dataset.targetId === id, secondId);
      await page.waitForTimeout(180);
      menus.push(await page.evaluate(inspectMenu));
      assert(menus.at(-1).options.some(o => o.choiceId === 'LOB_PASS' && o.targetId === secondId), 'SECOND_LOB_TARGET_MISSING');
      if (viewport.width <= 760) await target.tap(); else await target.click();
      await page.waitForFunction(id => document.querySelector('.in-pitch-choice-menu .in-pitch-choice-option')?.dataset.targetId === id, targetId);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => window.__c5.inputs.length), beforeInputs, 'TARGET_SWITCH_COMMITTED');
    }
    await page.screenshot({ path: path.join(dir, 'menu.png') });
    const invalid = await page.evaluate(() => window.__c5.probeInvalid());
    assert(!invalid.result.ok && invalid.unchanged, 'INVALID_TUPLE_MUTATED');
    const action = page.locator(`.in-pitch-choice-option[data-choice-id="${selected.id}"][data-target-id="${selected.targetId || ''}"]`);
    await action.evaluate(e => { window.__c5StaleAction = e; });
    if (viewport.width <= 760) await action.tap();
    else if (config.team === 'AWAY') { await action.focus(); await page.keyboard.press('Enter'); }
    else await action.click();
    inputCheck = await page.evaluate(() => {
      const q = window.__c5, before = q.inputs.filter(x => x.result?.ok).length;
      const signature = () => JSON.stringify({ ball: q.session.m.ball, pending: q.session.pending, events: q.session.m.events, rng: q.session.m.r.observe() });
      const beforeState = signature();
      window.__c5StaleAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return { before, after: q.inputs.filter(x => x.result?.ok).length, unchanged: beforeState === signature(),
        receipt: document.querySelector('#heroChoiceReceiptText')?.textContent, inputs: q.inputs };
    });
    assert.equal(inputCheck.before, 1); assert.equal(inputCheck.after, 1); assert(inputCheck.unchanged);
    const committed = inputCheck.inputs.find(x => x.result?.ok);
    assert.equal(committed.choiceId, selected.id); assert.equal(committed.targetId ?? null, selected.targetId ?? null);
    assert(committed.result.commitEventId && committed.meta.confirmedAction);
    // Follow actual root stepping until a real pause/terminal boundary; never
    // synthesize a settled ball to make the gate pass.
    await page.waitForFunction(() => {
      const q = window.__c5, s = q.session;
      return q.steps.length > 5 && (s?.pending || document.querySelector('#heroResultPanel')?.hidden === false || q.resumes.some(r => r.accepted));
    }, null, { timeout: 30000 });
    const replayButton = await page.locator('#heroReplayEpisode').isVisible() ? '#heroReplayEpisode'
      : await page.locator('#heroReplayBefore').isVisible() ? '#heroReplayBefore' : null;
    if (replayButton) {
      const before = await page.evaluate(() => ({ ball: JSON.stringify(window.__c5.session.m.ball), rng: window.__c5.session.m.r.observe(),
        pairs: window.__c5.session.pending?.options.map(o => [o.id, o.targetId]) || null, at: performance.now() }));
      await page.locator(replayButton).click();
      await page.waitForFunction(() => window.__c5.draws.at(-1)?.phase === 'PRE_REPLAY');
      await page.waitForFunction(() => window.__c5.draws.at(-1)?.phase !== 'PRE_REPLAY', null, { timeout: 20000 });
      const after = await page.evaluate(() => ({ ball: JSON.stringify(window.__c5.session.m.ball), rng: window.__c5.session.m.r.observe(),
        pairs: window.__c5.session.pending?.options.map(o => [o.id, o.targetId]) || null, at: performance.now() }));
      replayCheck = { before, after, unchanged: before.ball === after.ball && JSON.stringify(before.rng) === JSON.stringify(after.rng) && JSON.stringify(before.pairs) === JSON.stringify(after.pairs) };
      assert(replayCheck.unchanged, 'REPLAY_MUTATED_LIVE_STATE');
    }
    // Observe auto handback and subsequent root continuation if not waiting for
    // another explicit player choice. A pending choice stays uncommitted.
    await page.waitForTimeout(4000);
  } catch (error) { failure = error.stack; }
  finally {
    if (cdp) await cdp.send('Page.stopScreencast').catch(() => {});
    data = await page.evaluate(() => { if (!window.__c5) return null; window.__c5.stopped = true; return window.__c5.export(); }).catch(() => null);
    await context.close();
  }
  const report = { id, viewport, config, browser: browser.version(), failure, errors, menus, inputCheck, replayCheck, screens, captureBytes, captureTruncated, data };
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(report));
  return assess(report);
}
function assess(r) {
  const d = r.data, steps = d?.steps || [], draws = d?.draws || [], inputs = d?.inputs?.filter(x => x.result?.ok) || [];
  const launch = inputs.find(x => x.choiceId === 'LOB_PASS'), start = launch?.after.time;
  const flight = steps.filter(s => start != null && s.time >= start && s.ball?.physicsProfile === 'OPEN_PLAY_LOB_V1');
  const contacts = steps.flatMap(s => s.events || []).filter(e => ['LOB_CONTACT', 'LOB_GROUND', 'LOB_CONTROL', 'GOAL', 'LOB_OUT'].includes(e.type));
  const terminal = steps.find(s => start != null && s.time > start && s.ball?.physicsProfile !== 'OPEN_PLAY_LOB_V1');
  const replayFrames = (d?.replays || []).flatMap(r => r.frames || []).filter(f => start != null && f.time >= start);
  const replayMatches = replayFrames.map(f => {
    const actual = steps.find(s => Math.abs(s.time - f.time) <= .011);
    return { time: f.time, recorded: !!actual && ['x', 'y', 'z', 'vx', 'vy', 'vz'].every(k => Math.abs((actual.ball[k] || 0) - (f.ball[k] || 0)) <= .006) };
  });
  const movement = steps.slice(1).flatMap((b, i) => {
    const a = steps[i], dt = b.time - a.time;
    if (!(dt > 0 && dt <= .11) || a.ball?.physicsProfile !== 'OPEN_PLAY_LOB_V1') return [];
    const distance = Math.hypot(b.ball.x - a.ball.x, b.ball.y - a.ball.y);
    const speed = Math.max(Math.hypot(a.ball.vx, a.ball.vy), Math.hypot(b.ball.vx, b.ball.vy));
    return [{ from: a.time, to: b.time, distance, speed, dt, withinStepEnvelope: distance <= speed * dt + 1,
      // Contact displacement includes body control placement; keep the actual receipt beside the measurement.
      contact: b.lastLobReceipt }];
  });
  const missing = [];
  const need = (ok, name) => { if (!ok) missing.push(name); };
  need(!r.failure && !r.errors.length, 'browser execution without errors');
  need(!r.captureTruncated && r.screens.length > 2 && draws.length > 2, 'consecutive real root raster frames within 1800-frame/64-MiB case budget');
  need(r.menus.length && r.menus.every(m => m.inBounds && !m.ballCovered && m.options.every(o => o.hit && o.fits && o.label && o.aria)), 'menu bounds/labels/hit targets/ball visibility');
  need(r.inputCheck?.before === 1 && r.inputCheck.after === 1 && r.inputCheck.unchanged, 'exact single input receipt and stale action rejection');
  need(r.replayCheck?.unchanged, 'actual replay and unchanged return');
  if (r.config.kind === 'fixture') {
    need(d?.fixtures.length === 1 && launch, 'declared fixture and exact lob launch');
    need(flight.some(s => s.ball.vz > 0) && flight.some(s => s.ball.vz < 0), 'ascent/apex crossing/descent');
    need(contacts.length > 0, 'actual contact/ground/goal receipt');
    need(terminal && steps.some(s => s.time >= terminal.time + 1), 'settled continuation with >=1 s follow-up');
    need(d?.safety.some(s => /OPEN_PLAY_LOB_CONTINUATION_REQUIRES_HIGH_RES/.test(s.error) && s.unchanged && s.identities), 'airborne handback rejection without mutation');
    need(d?.resumes.some(s => s.accepted && s.identities && s.after?.lease.owner === 'COARSE'), 'settled handback identity and lease return');
    need(d?.world.second > terminal?.time, 'post-handback coarse progression');
    need(draws.some(s => s.phase === 'PRE_REPLAY' && s.frame.ball.z > .1), 'lob replay uses recorded airborne frames');
    need(replayMatches.length > 2 && replayMatches.every(f => f.recorded), 'replay xyz/vxyz match actual recorded steps');
    need(movement.length && movement.every(f => f.withinStepEnvelope), 'adjacent physical displacement/velocity envelope');
    need(draws.some(s => s.rasterProbe?.separated), 'visible ball/shadow separation');
    need(r.menus.length >= 2, 'both exact lob target menus and target switching');
  }
  for (const row of draws) {
    const b = row.frame.ball, v = row.ballView, pixels = row.rasterProbe;
    need(pixels?.ball?.slice(0, 3).every(n => n >= 245), 'actual canvas ball pixels');
    if (pixels?.separated) need(pixels.shadow?.slice(0, 3).every(n => n < 180), 'actual canvas ground-shadow pixels');
    need(Math.abs(v.x - (28 + b.x / 105 * 994)) < 1e-7 && Math.abs(v.groundY - (24 + b.y / 68 * 632)) < 1e-7 &&
      v.offset >= 0 && v.offset <= 48 && (b.z > 0 ? v.y <= v.groundY : v.y === v.groundY), 'ball xyz/display correspondence');
  }
  need(!steps.some(s => s.futureOutcomePrecomputed), 'no future precompute');
  return { id: r.id, kind: r.config.kind, team: r.config.team, viewport: r.viewport,
    status: missing.length ? 'INCOMPLETE' : 'OBSERVED_PASS', missing: [...new Set(missing)],
    failure: r.failure, frames: draws.length, rasters: r.screens.length, replayMatches, movement, note: 'Natural samples are observations, never fixture prevalence evidence.' };
}
async function main() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'v63-c5-root-'));
  const report = { schema: 'V63_C5_ROOT_RENDERED_1', output, source: sourceIdentity(), command: process.argv,
    node: process.version, platform: `${process.platform}/${process.arch}`, technical: technicalChecks(), samples: [],
    technicalVerdict: 'C5_TECHNICAL_NOT_ESTABLISHED', renderedVerdict: 'INTERNAL_RENDERED_NOT_RUN', userVisual: 'NOT_EVALUATED' };
  const save = () => { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); };
  if (process.argv.includes('--technical-only')) { save(); return; }
  let browser;
  try {
    const { chromium } = require('playwright-core');
    report.launch = { headless: true, chromiumSandbox: true, retries: 0 };
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  } catch (error) {
    report.renderedVerdict = 'INTERNAL_RENDERED_BLOCKED'; report.blocker = error.stack;
    report.unverified = ['both viewport pixels and input continuity', 'both attack directions through actual contact/settle',
      'consecutive root/replay raster timing', 'rendered replay return and post-handback continuity'];
    save(); process.exitCode = 2; return;
  }
  try {
    report.browser = browser.version();
    for (const viewport of VIEWPORTS) for (const config of [{ kind: 'natural', team: 'HOME' }, { kind: 'fixture', team: 'HOME' }, { kind: 'fixture', team: 'AWAY' }]) {
      report.samples.push(await sample(browser, output, viewport, config));
    }
    // Full C5 also requires the separately run existing deterministic regressions.
    // This runner does not infer that evidence or declare a user visual verdict.
    report.renderedVerdict = report.samples.every(s => s.status === 'OBSERVED_PASS') ? 'INTERNAL_RENDERED_PASS' : 'INTERNAL_RENDERED_INCOMPLETE';
  } finally { await browser.close(); save(); }
  if (report.renderedVerdict !== 'INTERNAL_RENDERED_PASS') process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { technicalChecks, sourceIdentity, assess, installObserver };
