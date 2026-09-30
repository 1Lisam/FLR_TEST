#!/usr/bin/env node
'use strict';

const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const ROOT_PAGE = `file://${path.join(ROOT, 'index.html')}`;
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
    const observer = await page.evaluate(() => {
      const P = window.FLRPG_PROTAGONIST_MATCH_CONTROLLER;
      if (!P) throw new Error('ROOT_PROTAGONIST_CONTROLLER_MISSING');
      window.__duplicateInputProbe = { applies: [], pendingViews: [] };
      window.FLR_QA_SHOW_PENDING_CAPTURE = row => {
        const s = row?.session, p = row?.pending;
        window.__duplicateInputProbe.pendingViews.push({
          sceneId: s?.currentScene?.sceneId || p?.sceneId || null,
          episodeId: s?.currentScene?.episodeId || null,
          time: s?.m?.time ?? null,
          optionPairs: (p?.options || []).map(o => [o.id, o.targetId ?? null]),
          isCurrentPending: !!s && p === s.pending,
          futureOutcomePrecomputed: s?.futureOutcomePrecomputed === true || s?.m?.futureOutcomePrecomputed === true,
        });
      };
      const original = P.applyChoice;
      P.applyChoice = function (s, id, targetId, meta) {
        const before = (s?.m?.events || []).length;
        const result = original.apply(this, arguments);
        const events = (s?.m?.events || []).slice(before);
        const choice = events.filter(e => e.type === 'USER_CHOICE');
        window.__duplicateInputProbe.applies.push({
          choiceId: id, targetId: targetId ?? null, ok: result?.ok === true,
          commitEventId: result?.commitEventId || choice[0]?.commitEventId || choice[0]?.eventId || null,
          eventTypes: events.map(e => e.type),
          futureOutcomePrecomputed: s?.futureOutcomePrecomputed === true || s?.m?.futureOutcomePrecomputed === true,
        });
        window.__duplicateInputProbe.state = s;
        return result;
      };
      return { defaultSeed: document.querySelector('#heroSeedInfo')?.textContent || '', seedValue: 'LIVE-V03-1-H-ST' };
    });
    await page.locator('#heroStart').click();
    await page.waitForFunction(() => !document.querySelector('#heroChoicePanel')?.hidden, null, { timeout: 240000 });
    const firstScene = await page.evaluate(() => ({
      seedInfo: document.querySelector('#heroSeedInfo')?.textContent || '',
      choiceText: document.querySelector('#heroChoicePanel')?.innerText || '',
      pending: window.__duplicateInputProbe.pendingViews.at(-1) || null,
      buttons: document.querySelectorAll('#heroChoiceButtons button.choice-option').length,
    }));
    assert(firstScene.buttons > 0, 'ROOT_DEFAULT_SEED_DID_NOT_REACH_ACTUAL_CHOICE');
    assert(firstScene.pending?.isCurrentPending && firstScene.pending.optionPairs.length, 'CHOICE_NOT_FROM_CURRENT_PENDING');
    assert(firstScene.pending.futureOutcomePrecomputed === false, 'FUTURE_OUTCOME_PRECOMPUTED_AT_CHOICE');

    const duplicate = await page.locator('#heroChoiceButtons button.choice-option').first().evaluate(button => {
      button.click();
      const state = window.__duplicateInputProbe.state;
      const snapshot = () => JSON.stringify({
        pending: state?.pending ?? null,
        events: state?.m?.events || [],
        userChoiceLog: state?.m?.userChoiceLog || [],
        rngState: state?.m?.r?.observe?.() ?? state?.rngState ?? null,
      });
      const afterFirstClick = snapshot();
      const applyCountAfterFirst = window.__duplicateInputProbe.applies.length;
      button.click();
      return {
        afterSecondClick: snapshot(),
        afterFirstClick,
        applyCountAfterFirst,
        applyCountAfterSecond: window.__duplicateInputProbe.applies.length,
      };
    });
    assert(duplicate.applyCountAfterFirst === 1, 'FIRST_CLICK_DID_NOT_APPLY_ONCE', String(duplicate.applyCountAfterFirst));
    assert(duplicate.applyCountAfterSecond === 1, 'STALE_SECOND_CLICK_CALLED_APPLY_CHOICE', String(duplicate.applyCountAfterSecond));
    assert(duplicate.afterSecondClick === duplicate.afterFirstClick, 'STALE_SECOND_CLICK_MUTATED_STATE');

    await page.waitForFunction(() => {
      const choice = !document.querySelector('#heroChoicePanel')?.hidden;
      const result = !document.querySelector('#heroResultPanel')?.hidden;
      return choice || result;
    }, null, { timeout: 120000 });
    const nextState = await page.evaluate(() => ({
      choiceVisible: !document.querySelector('#heroChoicePanel')?.hidden,
      resultVisible: !document.querySelector('#heroResultPanel')?.hidden,
      choiceText: document.querySelector('#heroChoicePanel')?.innerText || '',
      resultText: document.querySelector('#heroResultPanel')?.innerText || '',
      pending: window.__duplicateInputProbe.pendingViews.at(-1) || null,
      pendingViews: JSON.parse(JSON.stringify(window.__duplicateInputProbe.pendingViews)),
      applies: JSON.parse(JSON.stringify(window.__duplicateInputProbe.applies)),
    }));
    assert(nextState.choiceVisible || nextState.resultVisible, 'NO_LEGITIMATE_NEXT_UI_STATE');
    if (nextState.choiceVisible) {
      assert(nextState.pending?.isCurrentPending && nextState.pending.optionPairs.length, 'CHAINED_OPTIONS_NOT_FROM_CURRENT_PENDING');
      assert(nextState.pending.sceneId !== firstScene.pending.sceneId, 'CHAINED_CHOICE_DID_NOT_ADVANCE_SCENE');
      assert(nextState.pending.futureOutcomePrecomputed === false, 'FUTURE_OUTCOME_PRECOMPUTED_IN_CHAIN');
    }
    const commits = nextState.applies.filter(row => row.ok);
    assert(commits.length === 1, 'SUCCESSFUL_COMMIT_COUNT_NOT_ONE', String(commits.length));
    assert(commits[0].eventTypes.includes('USER_CHOICE'), 'COMMIT_EVENT_NOT_RECORDED');
    assert(commits[0].futureOutcomePrecomputed === false, 'FUTURE_OUTCOME_PRECOMPUTED_AFTER_COMMIT');
    assert(errors.length === 0, 'ROOT_BROWSER_ERRORS', JSON.stringify(errors));

    console.log(JSON.stringify({
      status: 'PASS',
      browser: browser.version(),
      seed: observer.seedValue,
      firstChoice: firstScene.pending,
      duplicateClick: { successfulCommits: commits.length, staleSecondClickUnchanged: duplicate.afterSecondClick === duplicate.afterFirstClick },
      nextUIState: nextState.choiceVisible ? { kind: 'CHAINED_CHOICE', pending: nextState.pending } : { kind: 'RESULT_PANEL' },
      pageErrors: errors.length,
      futureOutcomePrecomputed: false,
    }, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
