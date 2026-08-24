# V0.5.4 R14 — CM backline collapse root cause and disposition

## Result
- Internal integrated QA: **PASS**
- Engine candidate changed after R13: **NO**
- CM collapse threshold changed: **NO** (`<= 0.035` retained)
- Public main/deploy/canonical promotion: **NOT PERFORMED**

## R13 sole failure root cause
Exact failing seed: `MARK_TARGET_STABILITY / DEV-RECENT-1787575897894-18`.

The legacy gate counted 15 raw current-position slots where `A-CM` was within 1.5 m of the two-CB mean. The probe showed this was one continuous 1.4 s event, not three midfielders collapsing.

- First 6 slots (758.1–758.6): AWAY still had possession. `A-CM` had just carried/passed from a deep build-up position. These frames are not defensive-collapse evidence.
- Remaining 9 slots (758.7–759.5): HOME had regained possession. `A-CM` was physically still near the back line for a short transition, while its tactical targets immediately moved back toward the midfield screen.
- The contextual R14 gate therefore checks actual AWAY-defending frames and requires both current position and tactical target to indicate backline collapse.

## R14 contextual result
For the five exact defence fixtures:
- `DEV-RECENT-1787573272419-1`: 0 intent-collapse slots
- `DEV-RECENT-1787575663982-11`: 0
- `DEV-RECENT-1787575803967-13`: 0
- `DEV-RECENT-1787575897894-18`: 2 / (69*3), ratio `0.0097`
- `DEV-RECENT-1787575948505-19`: 0

All are below the unchanged hard threshold `0.035`.

The two remaining contextual slots in the reported seed are the first 0.2 s after the possession switch while `POST_PASS_CONTINUE_RUN` is still handing over to defensive recovery; they do not form a sustained collapse and remain inside the gate rather than being hidden.

## Preserved invariants
- Correct Law 11 (goalkeeper included when calculating the second-last opponent)
- protagonist CM not sticky-marking a central ST
- attacking second-ball midfield layer
- adopted back-four drop-together approach
- rejected step-up cohesion remains rejected
- no shot/goal quota or probability fudge

## Approval boundary
The R13 engine candidate is now **promotion-ready from internal QA**, but no public action is authorized yet.

PR #42 is the older `V0.5.3 HF3 ROLE STABILITY` draft and is **not** the V0.5.4 promotion vehicle. It must not be merged as a substitute for V0.5.4.
