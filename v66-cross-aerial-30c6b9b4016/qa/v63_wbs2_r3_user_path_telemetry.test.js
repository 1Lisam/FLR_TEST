'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const source = path.join(repo, 'QA/v63_wbs2_baseline_visual_r2');
let output, spec;
test.before(() => {
  // A prebuilt temporary bundle also supports environments that deny Node subprocesses.
  output = process.env.V63_R3_QA_BUNDLE || fs.mkdtempSync(path.join(os.tmpdir(), 'v63-r3-user-path-'));
  if (!process.env.V63_R3_QA_BUNDLE)
    execFileSync('python3', [path.join(source, 'build_candidate.py'), '--output', output], {cwd: repo});
  spec = JSON.parse(fs.readFileSync(path.join(output, 'EXPECTED_MANIFEST.json')));
  for (const file of ['index.html', 'continuous_visual_driver.js', 'EXPECTED_MANIFEST.json'])
    assert.deepEqual(fs.readFileSync(path.join(output, file)), fs.readFileSync(path.join(source, file)));
  for (const [file, entry] of Object.entries(spec.files))
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex'), entry.sha256);
});
test.after(() => { if (output && !process.env.V63_R3_QA_BUNDLE) fs.rmSync(output, {recursive: true, force: true}); });

// Load the exact isolated browser dependency tree, with DOM/canvas call capture.
// This verifies presentation logic, not human/browser visual acceptance.
async function page() {
  const calls = [], events = {};
  let context, callback, wall = 0, liveSession;
  const ctx = new Proxy({}, {get: (o, k) => o[k] ?? ((...args) => calls.push({method: k, args})),
    set: (o, k, v) => {o[k] = v; return true;}});
  const element = id => ({id, children: [], handlers: {}, dataset: {}, value: '', textContent: '',
    disabled: false, checked: false, addEventListener(k, f) {this.handlers[k] = f;},
    append(e) {this.children.push(e);}, replaceChildren() {this.children = [];}, setAttribute() {},
    getContext: () => ctx, click() {if (!this.disabled) this.handlers.click?.();}});
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], element(m[1])]));
  nodes.qaPitch.width = 1260; nodes.qaPitch.height = 820; nodes.speed.value = '1';
  const doc = {hidden: false, getElementById: id => nodes[id], createElement: () => element('new'),
    addEventListener: (k, f) => {events[k] = f;}, head: {append(s) {
      assert.match(s.src, /^wbs2\/runtime\/[a-z0-9_]+\.js$/);
      vm.runInContext(fs.readFileSync(path.join(output, s.src), 'utf8'), context, {filename: s.src});
      if (s.src.endsWith('/protagonist_match_controller.js')) {
        const controller = context.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
        context.FLRPG_PROTAGONIST_MATCH_CONTROLLER = {...controller, create(...args) {
          liveSession = controller.create(...args); return liveSession;
        }};
      }
      s.onload();
    }}};
  context = vm.createContext({console, document: doc, URL, URLSearchParams,
    location: {search: '?mode=FOCUS&seed=1', href: 'http://qa.invalid/?mode=FOCUS&seed=1'},
    fetch: async url => {assert.equal(url, 'EXPECTED_MANIFEST.json'); return {ok: true, json: async () => spec};},
    requestAnimationFrame: f => {callback = f;}});
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(output, 'continuous_visual_driver.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(context.FLR_V63_DEBUG, nodes.status.textContent);
  return {nodes, calls, context, live: () => liveSession,
    snapshot: () => context.FLR_V63_DEBUG.snapshot(),
    frame() {wall += 50; assert.ok(callback); callback(wall);}};
}
function reachLob(p) {
  p.nodes.start.click(); p.frame();
  for (let i = 0; i < 2600; i++) {
    p.frame();
    const pending = p.snapshot().pending;
    if (!pending) continue;
    const option = pending.options.find(o => o.id === 'LOB_PASS') || pending.options[0];
    const before = JSON.stringify(p.snapshot());
    p.nodes.targets.children.find(b => b.dataset.targetId === (option.targetId || '')).click();
    assert.equal(JSON.stringify(p.snapshot()), before, 'target selection alone cannot commit');
    const action = p.nodes.actions.children.find(b => b.dataset.choiceId === option.id);
    assert.ok(action);
    if (option.id === 'LOB_PASS') return {pending, option, action};
    action.click(); // Explicit test inputs at prior real choices, never runtime autopick.
  }
  assert.fail('seed 1 must reach a natural exact lob option within 2600 steps');
}
function assertLiveDisplay(p) {
  const b = p.live().m.ball, text = p.nodes.qaTelemetry.textContent;
  assert.ok(text.includes(`current canonical z=${b.z.toFixed(3)} · vz=${b.vz.toFixed(3)}`));
  assert.ok(text.includes(`ball physicsProfile: ${b.physicsProfile || 'NONE'} · mode: ${b.mode}`));
  assert.ok(text.includes(`step=${p.snapshot().ticks} · match phase=${p.live().m.phase}`));
  const ball = p.calls.filter(c => c.method === 'arc' && c.args[2] === 7.5).at(-1);
  const shadow = p.calls.filter(c => c.method === 'ellipse').at(-1);
  assert.ok(Math.abs(ball.args[0] - (45 + b.x / 105 * 1170)) < 1e-8);
  assert.ok(Math.abs(shadow.args[1] - (55 + b.y / 68 * 705)) < 1e-8);
  assert.ok(Math.abs(shadow.args[1] - ball.args[1] - Math.max(0, b.z) / 68 * 705) < 1e-8);
  assert.equal(p.calls.filter(c => c.method === 'fillText' && c.args[0].startsWith('BALL z=')).at(-1).args[0],
    `BALL z=${b.z.toFixed(2)}m`);
}

test('exact committed lob pauses on first real airborne frame; resume displays flight and current landed Z', async () => {
  const p = await page(), {pending, option, action} = reachLob(p);
  const controller = p.context.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
  const originalStep = controller.step, originalApply = controller.applyChoice;
  let steps = 0, launch, commitResult, firstAirborne;
  controller.applyChoice = (...args) => {
    commitResult = originalApply(...args);
    launch = {...p.live().m.ball};
    return commitResult;
  };
  controller.step = (s, dt) => {
    assert.equal(dt, spec.step_seconds); steps++;
    const result = originalStep(s, dt);
    if (!firstAirborne && s.m.ball.physicsProfile === 'OPEN_PLAY_LOB_V1' && s.m.ball.z > 0)
      firstAirborne = {steps, z: s.m.ball.z};
    return result;
  };
  action.click();
  const s = p.snapshot(), b = p.live().m.ball, r = s.qa.lobReceipt;
  assert.equal(commitResult.ok, true);
  assert.equal(launch.z, 0, 'launch state is distinct from subsequent flight');
  assert.ok(launch.vz > 0);
  assert.equal(b.physicsProfile, 'OPEN_PLAY_LOB_V1'); assert.ok(b.z > 0);
  assert.equal(steps, firstAirborne.steps, 'no stepping past the first active airborne frame');
  assert.ok(steps > 0 && steps <= p.context.FLR_V63_VISUAL.AIRBORNE_STEP_LIMIT);
  assert.equal(r.steps, steps); assert.equal(r.firstAirborne.z, b.z);
  assert.equal(r.launchFrame.z, launch.z); assert.equal(r.presentation.ok, true);
  assert.equal(s.qa.latestCommit.pendingId, pending.id);
  assert.equal(s.qa.latestCommit.targetId, option.targetId);
  assert.ok(commitResult.commitEventId);
  assert.equal(s.qa.latestCommit.commitEventId, commitResult.commitEventId);
  assert.equal(p.live().m.events.filter(e => e.type === 'USER_CHOICE' && e.commitEventId === commitResult.commitEventId).length, 1);
  assert.equal(s.running, false); assert.equal(p.nodes.resume.disabled, false);
  assert.match(p.nodes.qaTelemetry.textContent, /live mode: FOCUS/);
  assert.match(p.nodes.qaTelemetry.textContent, /lob phase=AIRBORNE/);
  assert.match(p.nodes.qaTelemetry.textContent, /historical LAUNCH \(step=0\): z=0.000/);
  assert.ok(p.nodes.qaTelemetry.textContent.includes(commitResult.commitEventId));
  assertLiveDisplay(p);
  const held = JSON.stringify(p.snapshot());
  action.click(); for (let i = 0; i < 6; i++) p.frame();
  assert.equal(JSON.stringify(p.snapshot()), held, 'first airborne state holds; stale action is inert');
  let landed = false, decelerated = false;
  p.nodes.resume.click(); p.frame();
  for (let i = 0; i < 100; i++) {
    p.frame(); assertLiveDisplay(p);
    const ball = p.live().m.ball;
    if (ball.physicsProfile === 'OPEN_PLAY_LOB_V1')
      decelerated ||= Math.hypot(ball.vx, ball.vy) < r.launchSpeed;
    if (ball.z === 0) {landed = true; break;}
    if (p.snapshot().pending) break;
  }
  assert.ok(decelerated, 'existing horizontal drag preserved');
  assert.ok(landed, 'bounded real trajectory reaches ground/contact');
  assert.match(p.nodes.qaTelemetry.textContent, /lob phase=LANDED/);
  assert.match(p.nodes.qaTelemetry.textContent, /current canonical z=0.000/);
});

test('blocked, failed and bounded no-airborne steps display explicit warnings without fabricated Z', async () => {
  const p = await page(), {action} = reachLob(p);
  const controller = p.context.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
  controller.step = () => {}; // Fault injection after reaching a real pending lob.
  action.click();
  assert.equal(p.snapshot().qa.latestCommit.ok, true);
  assert.equal(p.snapshot().running, false);
  assert.equal(p.live().m.ball.z, 0);
  assert.match(p.nodes.status.textContent, /QA WARNING:.*NO_STEP_PROGRESS/);
  assert.match(p.nodes.qaTelemetry.textContent, /QA WARNING: no airborne frame/);
  assertLiveDisplay(p);

  // Exercise the bounded guard separately; these synthetic step faults are not
  // evidence of a physical lob. The successful user path above uses real steps.
  const api = p.context.FLR_V63_VISUAL;
  function stalledSession() {
    return {match: p.live().m, state: p.live(), ticks: 0, qa: {
      latestCommit: {ok: true, choiceId: 'LOB_PASS'},
      lobReceipt: {steps: 0, minSpeed: Infinity, profileVisible: false, positiveZ: false}}};
  }
  controller.step = s => {s.m.time += api.DT;};
  const bounded = stalledSession();
  assert.equal(api.presentCommittedLob(bounded).reason, 'AIRBORNE_STEP_LIMIT');
  assert.equal(bounded.qa.lobReceipt.steps, api.AIRBORNE_STEP_LIMIT);
  controller.step = () => {throw Error('injected step failure');};
  assert.match(api.presentCommittedLob(stalledSession()).reason, /STEP_ERROR: injected step failure/);
  const absent = stalledSession(); absent.qa.latestCommit.ok = false;
  assert.equal(api.presentCommittedLob(absent).reason, 'NO_FRESH_COMMITTED_LOB');
  assert.equal(absent.ticks, 0);
});
