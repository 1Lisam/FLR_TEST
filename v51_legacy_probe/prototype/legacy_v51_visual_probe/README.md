# V51 Legacy-only actual-frame visual probe

Private, local-only probe for the question: can the existing Legacy one-object highlight route remain viable when most of a match is hidden and natural player-decision scenes are shown?

It directly uses `runtime/protagonist_match_controller.js` in existing `PLAYER_ALL` mode. The controller retains its normal six-second actual-history window. For a recorded decisive event, the probe first displays deterministic template commentary built from that already-emitted receipt, then plays only the retained actual frames at or before the current Legacy clock, then continues the same object. Goals and decisive events with a non-protagonist `actorId` use the same independent path. It then surfaces every controller checkpoint without a new quality filter, sends only an explicit button's exact `choiceId + targetId`, and continues the same object to later scenes.

It is intentionally not wired into `index.html`, `deploy/`, or a public build. It contains no engine/movement repair, no synthetic scene setup, no future-result lookup, no generative text, and no automatic choice picker.

Run the deterministic contract check from the repository root:

```sh
node QA/v51_legacy_solo_visual_probe_contract.js
```

Use [OPERATOR_CHECKLIST.md](OPERATOR_CHECKLIST.md) for the visual observation.
