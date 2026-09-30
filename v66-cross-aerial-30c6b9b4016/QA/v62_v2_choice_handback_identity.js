#!/usr/bin/env node
'use strict';

const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const ROOT_PAGE = `file://${path.join(ROOT, 'index.html')}`;
const SEED = 'LIVE-V03-1-H-ST';
const assert = (condition, code, detail = '') => {
  if (!condition) throw new Error(`${code}${detail ? `:${detail}` : ''}`);
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push({ kind: 'pageerror', text: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ kind: 'console', text: message.text() });
  });
  try {
    await page.goto(ROOT_PAGE, { waitUntil: 'load', timeout: 30000 });
    const setup = await page.evaluate(() => {
      const P = window.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
      const H = window.FLRPG_LIVE_HYBRID_SESSION_V02;
      if (!P || !H) throw new Error('ROOT_OBSERVER_TARGETS_MISSING');
      window.__v62Handback = { applies: [], pending: [], resumes: [] };
      window.FLR_QA_SHOW_PENDING_CAPTURE = row => {
        const s = row?.session, p = row?.pending;
        window.__v62Handback.pending.push({
          sceneId: s?.currentScene?.sceneId || p?.sceneId || null,
          episodeId: s?.currentScene?.episodeId || null,
          pairs: (p?.options || []).map(o => [o.id, o.targetId ?? null]),
          isCurrentPending: !!s && p === s.pending,
          futureOutcomePrecomputed: s?.futureOutcomePrecomputed === true || s?.m?.futureOutcomePrecomputed === true,
        });
      };
      const originalApply = P.applyChoice;
      P.applyChoice = function (s, id, targetId, meta) {
        const before = (s?.m?.events || []).length;
        const result = originalApply.apply(this, arguments);
        const events = (s?.m?.events || []).slice(before).filter(e => e.type === 'USER_CHOICE');
        window.__v62Handback.applies.push({
          choiceId: id, targetId: targetId ?? null, ok: result?.ok === true,
          commitEventId: result?.commitEventId || events[0]?.commitEventId || events[0]?.eventId || null,
          eventCount: events.length,
          futureOutcomePrecomputed: s?.futureOutcomePrecomputed === true || s?.m?.futureOutcomePrecomputed === true,
        });
        window.__v62Handback.state = s;
        return result;
      };
      const originalResume = H.resumeFromHighRes;
      H.resumeFromHighRes = function (world, handback) {
        window.__v62Handback.world = world;
        const lease = world?._v2ResolutionLease;
        const m = handback?.state?.m;
        const spatial = lease?.canonicalSpatial;
        const players = lease?.canonicalPlayers;
        const ball = lease?.canonicalBall;
        const before = {
          handback, world, lease,
          sameLease: m?._resolutionLease === lease,
          adapterPlayers: m?.players === players,
          adapterBall: m?.ball === ball,
          spatialIdentity: world?.state?.spatial === spatial,
          spatialPlayers: spatial?.players === players,
          spatialBall: spatial?.ball === ball,
          players: players ? [...players] : [],
        };
        let result, error;
        try { result = originalResume.apply(this, arguments); }
        catch (e) { error = e; throw e; }
        finally {
          window.__v62Handback.resumes.push({
            before,
            after: {
              spatialIdentity: world?.state?.spatial === spatial,
              spatialPlayers: world?.state?.spatial?.players === players,
              spatialBall: world?.state?.spatial?.ball === ball,
              playerIdentities: !!players && players.every((p, i) => world.state.spatial.players[i] === p),
              worldBallIdentity: world?.state?.ball === ball,
              leaseOwner: lease?.owner || null,
              time: world?.state?.second ?? null,
              seed: world?.opts?.seed || null,
              futureOutcomePrecomputed: world?.state?.spatial?.futureOutcomePrecomputed === true,
            },
            resultStatus: result?.status || null,
            error: error?.message || null,
          });
        }
        return result;
      };
      return {
        defaultSeed: 'LIVE-V03-1-H-ST',
        pageSeedInfo: document.querySelector('#heroSeedInfo')?.textContent || '',
        hero: document.querySelector('#heroPlayer')?.value || null,
        search: location.search,
      };
    });
    assert(setup.hero === 'H-ST', 'DEFAULT_HERO_NOT_ST');
    assert(setup.search === '', 'ROOT_PAGE_HAS_QUERY_OVERRIDE', setup.search);

    await page.locator('#heroStart').click();
    await page.waitForFunction(() => !document.querySelector('#heroChoicePanel')?.hidden, null, { timeout: 240000 });
    const first = await page.evaluate(() => ({
      seedInfo: document.querySelector('#heroSeedInfo')?.textContent || '',
      choiceVisible: !document.querySelector('#heroChoicePanel')?.hidden,
      pending: window.__v62Handback.pending.at(-1) || null,
      future: window.__v62Handback.state?.futureOutcomePrecomputed === true || window.__v62Handback.state?.m?.futureOutcomePrecomputed === true,
    }));
    assert(first.seedInfo.includes('LIVE-V03-1-H-ST'), 'DEFAULT_SEED_NOT_LIVE_V03_1_H_ST', first.seedInfo);
    assert(first.choiceVisible && first.pending?.isCurrentPending && first.pending.pairs.length, 'NO_REAL_PROTAGONIST_CHOICE');
    assert(!first.future && !first.pending.futureOutcomePrecomputed, 'FUTURE_OUTCOME_PRECOMPUTED_AT_FIRST_CHOICE');

    let choices = 0;
    for (let guard = 0; guard < 16; guard++) {
      const visible = await page.evaluate(() => ({
        choice: !document.querySelector('#heroChoicePanel')?.hidden,
        result: !document.querySelector('#heroResultPanel')?.hidden,
        lastResult: window.__v62Handback.state?.lastResult?.choiceId || null,
      }));
      if (visible.result) break;
      assert(visible.choice, 'EPISODE_LEFT_CHOICE_FLOW_BEFORE_RESULT');
      const current = await page.evaluate(() => window.__v62Handback.pending.at(-1));
      assert(current?.isCurrentPending && current.pairs.length, 'CHOICE_NOT_FROM_CURRENT_PENDING');
      const beforeApplies = await page.evaluate(() => window.__v62Handback.applies.length);
      await page.locator('#heroChoiceButtons button.choice-option').first().click();
      await page.waitForFunction(() => {
        const c = !document.querySelector('#heroChoicePanel')?.hidden;
        const r = !document.querySelector('#heroResultPanel')?.hidden;
        return c || r;
      }, null, { timeout: 120000 });
      const result = await page.evaluate(before => ({
        after: window.__v62Handback.applies.length,
        commit: window.__v62Handback.applies.at(-1) || null,
        pending: window.__v62Handback.pending.at(-1) || null,
        choice: !document.querySelector('#heroChoicePanel')?.hidden,
        result: !document.querySelector('#heroResultPanel')?.hidden,
        lastResult: window.__v62Handback.state?.lastResult?.choiceId || null,
      }), beforeApplies);
      assert(result.after === beforeApplies + 1, 'UI_CHOICE_DID_NOT_COMMIT_EXACTLY_ONCE');
      assert(result.commit?.ok && result.commit.eventCount === 1, 'CHOICE_COMMIT_EVENT_INVALID');
      assert(!result.commit.futureOutcomePrecomputed, 'FUTURE_OUTCOME_PRECOMPUTED_AFTER_CHOICE');
      choices++;
      if (result.choice) assert(result.pending?.isCurrentPending, 'CHAINED_CHOICE_NOT_CURRENT_PENDING');
      if (result.result) assert(result.lastResult, 'RESULT_PANEL_WITHOUT_REAL_EPISODE_RESULT');
    }
    const resultState = await page.evaluate(() => ({
      visible: !document.querySelector('#heroResultPanel')?.hidden,
      lastResult: window.__v62Handback.state?.lastResult?.choiceId || null,
      completed: window.__v62Handback.state?.m?.completed === true,
      applies: window.__v62Handback.applies.length,
    }));
    assert(resultState.visible && resultState.lastResult, 'CHOICE_EPISODE_DID_NOT_REACH_REAL_RESULT');
    assert(choices >= 2, 'GENUINE_CHAINED_CHOICE_EPISODE_NOT_EXERCISED', String(choices));
    assert(resultState.applies === choices, 'DUPLICATE_CHOICE_COMMIT_DETECTED');

    // This is the visible root Continue action once. It transitions to the
    // scene break, whose normal timer invokes the real handback path.
    const resumeBaseline = await page.evaluate(() => window.__v62Handback.resumes.length);
    await page.locator('#heroContinue').click();
    await page.waitForFunction(baseline => window.__v62Handback.resumes.length > baseline, resumeBaseline, { timeout: 30000 });
    const handback = await page.evaluate(resumeBaseline => {
      const row = window.__v62Handback.resumes.at(-1), hb = row?.before?.handback;
      return {
        calls: window.__v62Handback.resumes.length,
        resumeBaseline,
        hadChoice: hb?.hadChoice === true,
        hasAuthority: !!hb?.snapshot?.spatialAuthorityV2,
        sameLease: row?.before?.sameLease === true,
        adapterPlayers: row?.before?.adapterPlayers === true,
        adapterBall: row?.before?.adapterBall === true,
        spatialIdentityBefore: row?.before?.spatialIdentity === true,
        spatialPlayersBefore: row?.before?.spatialPlayers === true,
        spatialBallBefore: row?.before?.spatialBall === true,
        spatialIdentityAfter: row?.after?.spatialIdentity === true,
        spatialPlayersAfter: row?.after?.spatialPlayers === true,
        spatialBallAfter: row?.after?.spatialBall === true,
        playerIdentitiesAfter: row?.after?.playerIdentities === true,
        worldBallIdentityAfter: row?.after?.worldBallIdentity === true,
        leaseOwner: row?.after?.leaseOwner || null,
        time: row?.after?.time ?? null,
        seed: row?.after?.seed || null,
        snapshotTime: hb?.snapshot?.time ?? null,
        futureOutcomePrecomputed: hb?.snapshot?.spatialAuthorityV2?.futureOutcomePrecomputed ?? null,
        error: row?.error || null,
      };
    }, resumeBaseline);
    assert(handback.calls === handback.resumeBaseline + 1 && handback.hadChoice, 'CHOICE_EPISODE_DID_NOT_CALL_REAL_RESUME');
    assert(handback.hasAuthority, 'HANDBACK_MISSING_SPATIAL_AUTHORITY_V2');
    assert(handback.sameLease && handback.adapterPlayers && handback.adapterBall, 'HANDBACK_LEASE_OR_ADAPTER_IDENTITY_MISMATCH');
    assert(handback.spatialIdentityBefore && handback.spatialPlayersBefore && handback.spatialBallBefore, 'CANONICAL_SPATIAL_IDENTITY_LOST_BEFORE_RELEASE');
    assert(handback.spatialIdentityAfter && handback.spatialPlayersAfter && handback.spatialBallAfter && handback.playerIdentitiesAfter && handback.worldBallIdentityAfter, 'CANONICAL_SPATIAL_IDENTITY_LOST_AFTER_RELEASE');
    assert(handback.leaseOwner === 'COARSE', 'RESOLUTION_LEASE_NOT_RELEASED_TO_COARSE', String(handback.leaseOwner));
    assert(handback.seed === SEED && handback.time >= handback.snapshotTime, 'SAME_MATCH_NOT_RESUMED');
    assert(handback.futureOutcomePrecomputed === false, 'FUTURE_OUTCOME_PRECOMPUTED_DURING_HANDBACK');
    assert(!handback.error, 'RESUME_THROWN', handback.error || '');
    await page.waitForFunction(() => {
      const r = window.__v62Handback.resumes.at(-1);
      return r && window.__v62Handback.world?.state?.second > r.before.handback.snapshot.time;
    }, null, { timeout: 30000 });
    assert(errors.length === 0, 'ROOT_BROWSER_ERRORS', JSON.stringify(errors));

    console.log(JSON.stringify({
      status: 'PASS', browser: browser.version(), seed: SEED,
      choiceCount: choices, commits: resultState.applies,
      resumeCalls: handback.calls, handback, matchAdvancedAfterResume: true,
      pageErrors: errors.length, futureOutcomePrecomputed: false,
    }, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
