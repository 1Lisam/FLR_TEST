# USER-MATCH-TEST V0.5.2 — 2026-08-24 — Intent V2 Integrated User Test

- Promotes the frozen V0.5.2 correction plus Intent V2 spatial movement into the user-test candidate.
- Preserves continuous Hybrid → V0.6 scene state without formation respawn at choice entry.
- Adds bounded marking handoff for central winger runs and re-handoff when a winger exits wide.
- Prevents long defender follow-the-man excursions while preserving off-ball attackers winning some exchanges.
- Separates `공간으로 전진` from `1대1 돌파` in both choice semantics and execution.
- Keeps explicit ground passes on the ground; adds long-range `로빙 패스`, preserves `로빙 침투패스`, and separates GK low-long vs lofted distribution.
- Promotion gate: four-risk user gate PASS_FOR_PROMOTION_REVIEW, marking/lob/carry integration PASS, short/long multi-cycle PASS, 4×90-minute ST/CM/CB/GK integrated bench PASS.
- This entry records the local integrated candidate; deployment commit is filled in only after GitHub test deployment succeeds.

# TT-0.51 — Meaningful Choice / One-touch / Live Movement

- Meaningless single-option protagonist checkpoints no longer stop play or auto-execute a material protagonist action.
- Physical CARRY availability is preserved independently from NPC action preference.
- Ground through-balls use a firmer initial strike with calibrated deceleration.
- FAR_SIDE_RUN remains a live run only while the target is actually forward and moving; otherwise it becomes FAR_SIDE_HOLD.
- CM carrier / ST lane collision avoidance and free-kick wall role-zone recovery are reinforced.
- Reception flow separates the run-to-ball vector from the first-touch attacking vector and adds pre-contact body opening.
- Incoming-ball decisions now support trap/control, one-touch pass, direct shot, volley, header pass and header shot where physically available. Outcomes are still resolved only at real contact.
- HIGH_RES events preserve causal event-time frame context instead of inheriting unrelated hand-back state.
- Bug reports are labelled TT-0.51 and continue uploading the full integrated Episode JSON to the configured Cloudflare endpoint before opening the GitHub issue screen.

# FLR_TEST Version History

This file records Football Life RPG technical-test versions that were actually promoted or otherwise have verifiable GitHub history.

## Recording rules
- Every future TT version promotion updates this file in the same release/deployment cycle.
- Record player-visible changes, engine changes, canonical safeguards, validation evidence, and the deployment commit.
- Do not invent missing history. Older entries are backfilled only when GitHub commits, validation files, or project Handoff/Bridge artifacts provide evidence.
- Intermediate candidate iterations are normally summarized under the promoted TT version rather than treated as separate releases.

## TT-0.50 — 2026-08-20 — USER_VISUAL_RETEST
**Engine deployment commit:** `791d0059af4fd479f92a11983b4b422ae7685537`  
**Public-label finalization commit:** `cdea5af9eedb4c1ded606348b1df55abd4c0fcdb`  
**Cloudflare full-JSON deployment/status commit:** `46aa6a016d919abf9be7eca466efd607c5fbea92`  
**Validation:** `.flr/qa-results/TT-0.50/CI_RESULT.json` on `tt050-candidate` — `workflowStatus: PASS`, `PASS_CANDIDATE_INTERNAL`

### Changes
- Reduced excessive ST intervention density while preserving meaningful linked decisions. The goal is fewer stop-start checkpoints, not automatic protagonist play.
- Extended a selected `CARRY` into one coherent movement intent before reopening another checkpoint, unless a materially new critical state appears.
- Reworked ground through-ball execution so the ball follows the runner's live movement vector and its arrival time is weighted toward the runner's reachable lead point rather than behaving like a hard straight pass at the current position.
- Made the option shown at a frozen user checkpoint authoritative for execution. A displayed `choiceId + exact targetId` is no longer re-ranked away between display and click; it is rejected only if the target is physically invalid.
- Reduced premature final-third recycling by preferring meaningful forward support when the attacking continuation is still available.
- Added a light midfield/striker lane-separation correction for recovering LCM/RCM support so they do not repeatedly occupy the ST's central path.
- Refined ST Hybrid promotion cadence so direct dangerous involvement is favored over every broad attacking involvement.
- Connected the browser bug-report path to the live Cloudflare Worker/R2 backend. Registering a bug now uploads the full integrated Episode `debug` JSON, receives a permanent JSON URL, and inserts that URL into the GitHub Issue draft. GitHub issue creation still occurs in the user's authenticated browser; no GitHub token is stored in the browser or Worker.
- Retained the manual GitHub/clipboard fallback path if the remote upload fails.
- Public page and compact bug-report metadata identify the build as `TT-0.50`.

### Validation highlights
- Through-ball timing test: ball arrival `2.627s`, runner arrival `2.823s`, difference `0.197s`; lead vector cosine `1.0`.
- Final-third decision fixture: `120` trials, premature backward pass `0`, attack-continuation rate `100%`.
- Hybrid cadence sample: ST average `22.5` choices/match and `2` choices in the first 30 minutes; CM `8`, CB `2`, GK `1.5` choices/match on the tested sample.
- A rare ST Episode reached `7` linked choices and remains a WATCH item; the 5-second burst stayed at `3` or fewer and overall density remained inside the gate.
- Frozen visible-target regression: `40` targeted choices, `0` execution/target failures. Hybrid visible-choice application failures: `0`.
- Protagonist authority regression: `0` violations; future choice/outcome precomputation remains `false`.
- RCM/ST measured overlap rate in the retained 4-match test was approximately `0.75%`.
- Live Cloudflare verification: missing-report GET `404`, CORS OPTIONS `/report` `204`, live POST `/report` `201`, and the JSON read back from R2 was semantically identical to the posted `debug` object.
- Live Worker endpoint: `https://flr-bug-reporter.sikarops.workers.dev/report`, backed by R2 bucket `flr-bug-reports`.

### Deferred
- Match perceived-time compression to the later ~5–6 minute target remains deferred.
- Position Experience Layer remains deferred.

---

## TT-0.49 — 2026-08-20 — USER_VISUAL_RETEST
**Engine deployment commit:** `7dda7e1a8fec7fadba99de1c05643f9f4f9bc519`  
**Validation:** `TT049_CI_RESULT_V5.json` on `tt049-candidate` — `PASS_FOR_USER_VISUAL_RETEST`

### Changes
- Improved attacking continuation after a genuine through-ball receive. A receiver can take a short forward touch, shoot, or connect the attack instead of repeatedly hesitating or taking an unnecessary duel.
- Reduced the special through-receive bias toward `TAKE_ON`; shooting remains situation-dependent rather than forced.
- Extended lead-pass look-ahead only for players who are actually moving in a committed run. In particular, visible `FAR_SIDE_RUN` movement can now produce a real `THROUGH_PASS`, while stationary players do not receive synthetic run passes.
- Added explicit directed-pass diagnostics: requested target → resolved target → intended receiver → first controller/interception. This is diagnostic only and does not rewrite live physics.
- Separated a true **clean 1v1** from the broader keeper-facing/open-chance family. Defenders still protecting the keeper lane prevent the chance from being counted as a clean 1v1.
- Recalibrated clean keeper-facing shot execution to restore a meaningful miss tail and GK-save share without goal/save quotas or result preselection.
- Preserved the TT-0.48 tactical movement file; TT-0.49 does not introduce a new forced defensive-positioning layer.

### Validation highlights
- 32 full matches: clean 1v1 average `1.7813 / match` (directional target `1.2–1.8`; 2–3 remains acceptable in open/mismatched matches).
- 600 clean 1v1 shots: goal `38.33%`, GK save `33.33%`, miss `28.33%`.
- Issue #3 reproduction: decisive shot/pass within the test window `91.67%`; shot `60.56%`, pass `31.11%`, early turnover `2.78%`, forced take-on `0%`.
- Issue #4 reproduction: moving LW/RW run-pass options present; stationary false lead pass `0`.
- Exact-target trace for the tested H-RW pass remained H-RW from request through first control.
- Protagonist authority regression: `0` violations in the retained authority tests.
- Future choice/outcome precomputation remains `false`.

### Not included in this version
- Match perceived-time compression to the later ~5–6 minute target.
- Position Experience Layer.
- Atomic Cloudflare Worker bug-report backend deployment/wiring. Worker source/config/docs exist, but this entry does not claim the Worker is live.

---

## TT-0.48 — 2026-08-20 — TEST_ONLY
**Initial validated deployment commit:** `474ccdfdb4641ed3b90d73474d8ef5161368947e`  
**Recovered UI runtime commit:** `f5c66662a5a9385a1d1a4da8b3d30b73b63f6c83`

### Changes
- Made protagonist reacquisition/continuation a permanent authority regression: when the hero regains or retains the ball inside a live Episode, the engine must open the next user checkpoint before an unchosen material action.
- Reinforced zone defence: one CB may retain a loose goal-side shoulder reference on a central ST while the partner keeps line/cover; midfield protects passing/cutback lanes; surplus carrier collapse is peeled away.
- Added a physically-open support-pass floor so a real safe outlet can remain visible to the user even when NPC action ranking does not prefer it.
- Improved NPC finishing after high-quality final passes while keeping the result in live physics.
- Reduced visible skating by damping stale lateral velocity during large heading changes.
- Added the browser bug-report popup flow and compact current-scene snapshot; full JSON download remained an emergency fallback.
- Preserved the smaller 105:68 pitch presentation and automatic next-play countdown/advance.

### Validation / recovery notes
- `47_1` and `47_5` hero-authority regressions passed with zero unchosen material action before the next choice.
- The recorded 4×900s directional sample reduced `defendersWithin8m >= 3` from `0.278976` in TT-0.47 to `0.036875` in TT-0.48.
- Fixed-scene NPC finishing test: 78 shots / 41 passes / 1 other across 120 runs.
- Several TT-0.48 UI/bug-report hotfixes followed the initial deployment.
- A truncated/mixed UI runtime incident was recovered with a SHA-verified assembled-file deployment (`f5c66662...`).
- Atomic bug-report Worker source/config/docs were added afterward; live Worker deployment was not established by those commits alone.

---

## TT-0.47 — 2026-08-20 — TEST_ONLY
**Validated deployment commit:** `8b709e1c1bbab808b77e7ac35bcbc651aa18867a`

### Changes
- Closed protagonist-authority bypasses found in the preceding test: set-piece FULL_SKIP, aerial/header resolution, and prolonged-duel fallbacks could no longer directly execute hero material actions before a user choice.
- History replay now pauses current progression, cancels auto-advance while replaying, and offers a return to the latest situation.
- Moved the 3/2/1 next-play countdown onto the frozen pitch overlay.
- Preserved a 105:68 pitch ratio, narrower desktop pitch card, and a three-line live feed directly below the pitch.
- Reworked high-quality keeper-chance shooting so GK saves are meaningful and extreme off-target misses are reduced, without outcome quotas or preselection.
- Defensive structure keeps one presser + one cover + one useful support near the carrier; fourth-and-later surplus bodies are peeled away, and a dangerous final-third presser can engage earlier.
- Exact-target validation rejects unavailable targets and preserves the requested target for valid passes.

### Canonical safeguards
- V0.6 continues to own live choice discovery and post-choice resolution.
- No future choice/outcome precomputation.
- No protagonist material action before an explicit choice in protected live windows.
- `choiceId + exact targetId` remains authoritative.

---

## TT-0.46 — historical intermediate test
A separate TT-0.46 `main` deployment commit has not been confirmed in the current GitHub history. TT-0.47 validation explicitly contains `tt046FeedbackFixes` and comparative TT-0.46 measurements, so TT-0.46 is retained here as a verified intermediate test rather than given an invented release description.

---

## TT-0.45 — 2026-08-19 — early GitHub Pages test
**Verified deployment commits include:**
- `7a18f7e9f6114b13e43d84056bef4575243c2299` — full-time presentation
- `f0d2e112cacb9f6b58f17e7260ddad9846e1de05` — test index replacement
- `6087213e95d0a465e8dc8752897a7f11cd20edd3` — scene debug export
- `18dcb9731a9ca72e320a719a54926731c13b87ba` — aerial contest
- `018c6afa38186eb12ffcd718e8f99c9c134eb18d` — take-on duel

### Verified scope
The GitHub history confirms that the early Pages test accumulated full-time presentation, scene debug export, aerial-contest support, and take-on-duel support under the TT-0.45 deployment sequence.

---

## Pre-GitHub versions
The repository does not contain enough evidence to reconstruct earlier TT versions safely. They may be backfilled later from project Handoff/Bridge archives, but only after the exact version and change set are confirmed.
