var structuredClone=globalThis.structuredClone||function(value){return JSON.parse(JSON.stringify(value));};
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // prototype/hybrid_v48/canonical_match_state.js
  var require_canonical_match_state = __commonJS({
    "prototype/hybrid_v48/canonical_match_state.js"(exports, module) {
      "use strict";
      var PITCH = Object.freeze({ length: 105, width: 68 });
      var VERSION = "FLR-V48-CANONICAL-1";
      var clone2 = (value) => JSON.parse(JSON.stringify(value));
      var finite = (value) => Number.isFinite(value);
      var bounded = (point2, label) => {
        if (!point2 || !finite(point2.x) || !finite(point2.y) || point2.x < 0 || point2.x > PITCH.length || point2.y < 0 || point2.y > PITCH.width) {
          throw new Error(`CANONICAL_INVALID_${label}`);
        }
      };
      function assertNoFuture(value, path = "state") {
        if (!value || typeof value !== "object") return;
        for (const [key, item] of Object.entries(value)) {
          if (/future|lookahead|resultTape|eventTape/i.test(key)) throw new Error(`CANONICAL_FUTURE_FIELD_FORBIDDEN:${path}.${key}`);
          assertNoFuture(item, `${path}.${key}`);
        }
      }
      function validate(state) {
        if (!state || state.version !== VERSION) throw new Error("CANONICAL_VERSION_MISMATCH");
        if (!Array.isArray(state.players) || state.players.length !== 22) throw new Error("CANONICAL_REQUIRES_22_PLAYERS");
        const ids = /* @__PURE__ */ new Set();
        for (const player of state.players) {
          if (!player || !Number.isInteger(player.id) || ids.has(player.id) || !Number.isInteger(player.team) || ![0, 1].includes(player.team)) throw new Error("CANONICAL_INVALID_PLAYER");
          ids.add(player.id);
          bounded(player, `PLAYER_${player.id}`);
        }
        bounded(state.ball, "BALL");
        if (state.ball.ownerId !== null && !ids.has(state.ball.ownerId)) throw new Error("CANONICAL_UNKNOWN_BALL_OWNER");
        if (!Array.isArray(state.score) || state.score.length !== 2 || state.score.some((v) => !Number.isInteger(v) || v < 0)) throw new Error("CANONICAL_INVALID_SCORE");
        assertNoFuture(state);
        return true;
      }
      function create2(input) {
        const state = clone2({
          version: VERSION,
          tick: input.tick || 0,
          clock: input.clock || 0,
          phase: input.phase || "play",
          score: input.score || [0, 0],
          possessionTeam: input.possessionTeam ?? null,
          players: input.players,
          ball: input.ball,
          metadata: input.metadata || {}
        });
        validate(state);
        return Object.freeze(state);
      }
      function withPatch(state, patch) {
        return create2({ ...clone2(state), ...clone2(patch), version: VERSION });
      }
      module.exports = Object.freeze({ VERSION, PITCH, create: create2, validate, withPatch, assertNoFuture, clone: clone2 });
    }
  });

  // prototype/hybrid_v48/donor_adapter.js
  var require_donor_adapter = __commonJS({
    "prototype/hybrid_v48/donor_adapter.js"(exports, module) {
      "use strict";
      var Canonical = require_canonical_match_state();
      var terminalTypes = /* @__PURE__ */ new Set(["goal", "save", "claim", "block", "corner", "goalKick", "throwIn", "freeKick", "offside"]);
      var CONTROLLED_TERMINALS = /* @__PURE__ */ new Set(["controlledPossession", "save", "claim", "block"]);
      function configOf(contract) {
        return { pitch: contract.pitch || { length: 105, width: 68 }, playerIdMap: contract.playerIdMap || {}, terminalMappings: contract.terminalMappings || {} };
      }
      function canonicalId(map, donorId2) {
        return Object.prototype.hasOwnProperty.call(map, donorId2) ? map[donorId2] : donorId2;
      }
      function donorId(map, canonicalPlayerId) {
        for (const [key, value] of Object.entries(map)) if (value === canonicalPlayerId) return /^-?\d+$/.test(key) ? Number(key) : key;
        return canonicalPlayerId;
      }
      function toCanonical2(donorState, contract = {}) {
        const c = configOf(contract), sx = 105 / c.pitch.length, sy = 68 / c.pitch.width;
        if (!donorState || !Array.isArray(donorState.players)) throw new Error("DONOR_STATE_PLAYERS_REQUIRED");
        const players = donorState.players.map((p) => ({ id: canonicalId(c.playerIdMap, p.id), donorId: p.id, team: p.team, role: p.role || "CM", x: p.x * sx, y: p.y * sy, held: p.held || 0 }));
        const ball = donorState.ball || {};
        return Canonical.create({
          tick: donorState.tick || 0,
          clock: donorState.clock || 0,
          phase: donorState.phase || "play",
          score: donorState.score || [0, 0],
          possessionTeam: donorState.possessionTeam ?? null,
          players,
          ball: { x: ball.x * sx, y: ball.y * sy, z: ball.z || 0, ownerId: ball.ownerId == null ? null : canonicalId(c.playerIdMap, ball.ownerId), mode: ball.mode || "controlled", incomingToId: ball.incomingToId == null ? null : canonicalId(c.playerIdMap, ball.incomingToId) },
          metadata: { donorTick: donorState.tick || 0 }
        });
      }
      function toDonorCoordinates(point2, contract = {}) {
        const c = configOf(contract);
        return { x: point2.x * c.pitch.length / 105, y: point2.y * c.pitch.width / 68 };
      }
      function terminalFailureCode(type) {
        return `ADAPTER_${String(type).replace(/([A-Z])/g, "_$1").toUpperCase()}_UNSUPPORTED_NO_NATIVE_MAPPING`;
      }
      function stableControlled(canonicalState) {
        return canonicalState.ball.ownerId != null && canonicalState.ball.mode === "controlled" && canonicalState.possessionTeam != null;
      }
      function patchBack(donorState, canonicalState, sceneResult, contract = {}) {
        Canonical.validate(canonicalState);
        if (!sceneResult || !sceneResult.terminal || !sceneResult.terminal.type) throw new Error("ADAPTER_SCENE_TERMINAL_REQUIRED");
        const type = sceneResult.terminal.type;
        if (!terminalTypes.has(type) && type !== "controlledPossession") throw new Error(`ADAPTER_UNSUPPORTED_TERMINAL:${type}`);
        const mapping = type === "controlledPossession" ? { kind: "controlledPossession", requiresStableControlled: true } : configOf(contract).terminalMappings[type];
        if (!mapping) return { ok: false, code: terminalFailureCode(type), terminalType: type, terminalContract: "UNMAPPED_FAIL_CLOSED" };
        if (mapping.kind === "unsupported") return { ok: false, code: mapping.code || terminalFailureCode(type), terminalType: type, terminalContract: "INTENTIONALLY_UNSUPPORTED" };
        if ((mapping.requiresStableControlled || CONTROLLED_TERMINALS.has(type)) && !stableControlled(canonicalState)) return { ok: false, code: `ADAPTER_${String(type).replace(/([A-Z])/g, "_$1").toUpperCase()}_CONTROLLED_BOUNDARY_UNSAFE`, terminalType: type, terminalContract: "CONTROLLED_PATCH_REJECTED" };
        const c = configOf(contract), next = JSON.parse(JSON.stringify(donorState));
        next.score = [...canonicalState.score];
        next.tick = canonicalState.tick;
        next.clock = canonicalState.clock;
        next.possessionTeam = canonicalState.possessionTeam;
        next.players = next.players.map((p) => {
          const cp = canonicalState.players.find((q) => q.id === canonicalId(c.playerIdMap, p.id));
          return cp ? { ...p, ...toDonorCoordinates(cp, contract) } : p;
        });
        const owner = canonicalState.ball.ownerId;
        next.ball = { ...next.ball, ...toDonorCoordinates(canonicalState.ball, contract), z: canonicalState.ball.z, mode: canonicalState.ball.mode, ownerId: owner == null ? null : donorId(c.playerIdMap, owner) };
        if (typeof mapping.apply === "function") return mapping.apply(next, sceneResult, { donorId: (id) => donorId(c.playerIdMap, id) });
        next.phase = mapping.phase || next.phase;
        next.lastHybridTerminal = type;
        return { ok: true, state: next, terminalType: type };
      }
      module.exports = Object.freeze({ toCanonical: toCanonical2, toDonorCoordinates, patchBack, canonicalId, donorId, terminalFailureCode, terminalTypes: new Set(terminalTypes) });
    }
  });

  // runtime/action_candidate_engine.js
  var require_action_candidate_engine = __commonJS({
    "runtime/action_candidate_engine.js"(exports, module) {
      (function(root, factory) {
        const api = factory();
        if (typeof module === "object" && module.exports) module.exports = api;
        else root.FLRPG_ACTION_CANDIDATE_ENGINE = api;
      })(typeof globalThis !== "undefined" ? globalThis : exports, function() {
        "use strict";
        const VERSION = "TT049-CANDIDATE-ACTION-1.2-RUN-DECISION";
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        function c(id, score, reason, meta = {}) {
          return { id, score: Number(score.toFixed(3)), reason, meta };
        }
        function generate(ctx2) {
          const out = [];
          const role = ctx2.role, x = ctx2.localX, wide = ctx2.wide, pressure = ctx2.pressure, space = ctx2.space, held = ctx2.held;
          const shot = ctx2.shot || {}, pass = ctx2.pass || {}, early = ctx2.earlyCross || null, deep = ctx2.deepDelivery || null, takeOn = ctx2.takeOn || null;
          const inBox = !!shot.inBox, frontChain = ctx2.frontPassChain || 0, recycle = !!ctx2.recycleActive, clearRunway = !!ctx2.clearRunway, attackingReceive = !!ctx2.attackingThroughReceive;
          const cleanOpenChance = inBox && !!shot.openWindow && (shot.blockers || 0) === 0 && (shot.dGoal || 99) <= 18.5 && (shot.centrality ?? 99) <= 12.5 && ["ST", "WF", "CM"].includes(role);
          if (["ST", "WF", "CM"].includes(role) && (inBox || x >= 78 && shot.dGoal <= 27 || x >= 66 && x < 78 && shot.dGoal <= 40 && (shot.blockers || 0) === 0 && pressure >= 1.15 && (shot.centrality ?? 99) <= 16.5)) {
            let s = (shot.score || 0) * 0.68 + (shot.oneVOne ? 7.5 : 0) + (shot.openWindow ? 1.8 : 0) - (shot.blockers || 0) * 0.55;
            if (inBox && shot.openWindow && (shot.blockers || 0) === 0 && (shot.centrality ?? 99) <= 10.5) s += 0.75;
            if (ctx2.recentTakeOnWin && inBox && (shot.oneVOne || shot.openWindow)) s += 2.1;
            if (!inBox) s -= role === "CM" ? 4.2 : 2.9;
            if (attackingReceive && (shot.blockers || 0) === 0 && shot.dGoal <= 26) s += 0.85;
            if (ctx2.recentTeamShot) s -= 2.2;
            if (!shot.oneVOne && !shot.clearKeeperChance) s -= 6;
            const longRange = !inBox && shot.dGoal > 27;
            if (longRange) s -= 2.1;
            if (shot.turningRequired) s -= 1.35 + (shot.backToGoal ? 0.65 : 0) + (longRange ? 0.55 : 0);
            out.push(c("SHOT", s, longRange ? "long_range_open_window" : "spatial_shot_window", { dGoal: shot.dGoal, inBox, oneVOne: shot.oneVOne, openWindow: shot.openWindow, longRange, turningRequired: !!shot.turningRequired, backToGoal: !!shot.backToGoal, facingAlignment: shot.facingAlignment }));
          }
          let carry = 0.82 + clamp(space, 0, 8) * 0.22 + (pressure > 2.6 ? 0.55 : 0) + (x > 72 ? 0.5 : 0) - (pressure < 1.05 ? 0.55 : 0);
          if (clearRunway) carry += 3.4;
          if (space > 5.2 && pressure > 1.6) carry += 0.68;
          if (role === "WF" && wide) carry += 0.42;
          if (inBox) carry += 0.3;
          if (wide && x >= 80 && x < 92 && ["WF", "FB"].includes(role)) carry += 1.35;
          if (x > 94) carry -= 2.4;
          if (frontChain >= 2 && ["ST", "WF"].includes(role)) carry += 1.25;
          if (attackingReceive) carry += 0.55;
          if (ctx2.deepEntryRestricted) {
            let entryPenalty = 1.15;
            if (pressure < 1.5) entryPenalty += 1.35;
            else if (pressure < 2.2) entryPenalty += 0.75;
            if (space < 2) entryPenalty += 0.8;
            else if (space < 4.5) entryPenalty += 0.35;
            carry -= entryPenalty;
          }
          if (inBox && (ctx2.boxCarryChain || 0) >= 1) carry -= Math.min(3.2, 0.95 * (ctx2.boxCarryChain || 0) + ((ctx2.boxCarryChain || 0) >= 2 ? 0.65 : 0));
          out.push(c("CARRY", carry, "space_and_pressure", { space, pressure, clearRunway }));
          if (takeOn) {
            const adv = clamp(takeOn.skillAdvantage ?? 0, -35, 35), behind = clamp(takeOn.spaceBehind || 0, 0, 12), dd = clamp(takeOn.defenderDistance || 2.5, 0.8, 5.5);
            let s = 1.95 + behind * 0.06 + adv * 0.022 + (role === "WF" ? 0.42 : role === "ST" ? 0.18 : 0.05) + (wide ? 0.22 : 0) + (x > 62 ? 0.12 : 0);
            if (dd < 1.15) s -= 0.75;
            if (attackingReceive) s += 0.25;
            if (ctx2.recentTakeOn) s -= 2.2;
            if (inBox && shot.openWindow) s -= 1.6;
            out.push(c("TAKE_ON", s, "beat_front_defender", { defenderId: takeOn.defenderId, defenderDistance: dd, spaceBehind: behind, skillAdvantage: adv, wide: !!wide }));
          }
          if (pass.runner) {
            let s = 2.65 + pass.runner.score * 0.46 + clamp(pass.runner.leadForward, 0, 18) * 0.085;
            if (frontChain >= 2 && ["ST", "WF"].includes(role)) s -= 1.45;
            if (recycle) s += 0.45;
            if (["ST_RELEASE_RUN", "WIDE_RELEASE_OUTLET"].includes(pass.runner.task) && role === "ST") s += 0.65;
            if (pass.runner.offsideRisk) s -= 0.2;
            out.push(c("THROUGH_PASS", s, "runner_lane", { targetId: pass.runner.targetId, leadForward: pass.runner.leadForward, offsideRisk: !!pass.runner.offsideRisk, offsideMargin: pass.runner.offsideMargin || 0, runnerTask: pass.runner.task || null, running: !!pass.runner.running, leadX: pass.runner.leadX ?? null, leadY: pass.runner.leadY ?? null }));
          }
          if (pass.progressive) {
            let s = 2.45 + pass.progressive.score * 0.49 + (x < 80 ? 0.25 : 0);
            if (frontChain >= 2 && ["ST", "WF"].includes(role)) s -= 1.15;
            if (recycle) s += 0.75;
            out.push(c("PROGRESSIVE_PASS", s, "progressive_lane", { targetId: pass.progressive.targetId }));
          }
          if (early) {
            const facing = clamp(early.facingAlignment ?? 0.5, 0, 1), targetOpen = clamp(early.targetOpen || 0, 0, 6), runners = clamp(early.boxTargets || 1, 1, 4);
            let s = 2.95 + (x - 74) * 0.085 + targetOpen * 0.27 + runners * 0.31 + facing * 1.2;
            if (pressure > 3.2) s += 0.35;
            else if (pressure < 1.15) s -= 0.75;
            if (held > 2.1) s -= 0.3;
            if (!wide) s -= 5;
            out.push(c("EARLY_CROSS", s, "wide_early_delivery", { targetId: early.targetId, targetOpen, boxTargets: runners, facingAlignment: facing }));
          }
          if (deep) {
            const id = deep.kind === "CUTBACK" ? "CUTBACK" : "DEEP_CROSS";
            let s = 3.45 + (x > 92 ? 1.15 : 0) + (deep.targetOpen || 0) * 0.24 + (inBox ? 0.55 : 0) + (deep.sourceTouchline && id === "DEEP_CROSS" ? 0.45 : 0);
            if (x >= 94 && wide) s += 0.85;
            out.push(c(id, s, "deep_final_delivery", { targetId: deep.targetId, sourceTouchline: !!deep.sourceTouchline, sourceX: deep.sourceX || x, targetLocalX: deep.targetLocalX, deliveryIntent: deep.deliveryIntent || null }));
          }
          const deepWideIntent = !!deep && wide && x >= 92.5;
          if (pass.switch) {
            let s = 1.85 + pass.switch.score * 0.38 + (held > 1.2 ? 0.45 : 0) + (recycle ? 0.65 : 0);
            if (deepWideIntent) s -= 1.15;
            out.push(c("SWITCH_PASS", s, "switch_play", { targetId: pass.switch.targetId }));
          }
          if (pass.safe) {
            let s = 1.55 + pass.safe.score * 0.28 + (pressure < 1.25 ? 0.75 : 0) + (held > 2.2 ? 0.55 : 0);
            if (x > 82) s -= 0.75;
            if (deepWideIntent) s -= 1.35;
            if (attackingReceive && held < 1.55) s -= 0.35;
            if (cleanOpenChance) s -= 5;
            out.push(c("SAFE_PASS", s, "safe_outlet", { targetId: pass.safe.targetId }));
          }
          if (pass.recycle && x > 70) {
            let s = 1.35 + pass.recycle.score * 0.26 + (held > 1.6 ? 0.55 : 0);
            if (recycle) s -= 0.9;
            if (deepWideIntent) s -= 1.25;
            if (attackingReceive && held < 1.55) s -= 0.55;
            if (cleanOpenChance) s -= 5.5;
            out.push(c("RECYCLE", s, "reset_attack", { targetId: pass.recycle.targetId }));
          }
          const hold = 1.05 + (pressure < 1.25 ? 0.55 : 0) + (held < 0.4 ? 0.45 : 0) + (inBox ? 0.15 : 0);
          out.push(c("HOLD", hold, "retain_and_scan"));
          out.push(c("TURN_BACK", 0.65 + (pressure < 0.95 ? 0.55 : 0) + (space < 1.5 ? 0.45 : 0), "escape_dead_end"));
          return out.sort((a, b) => b.score - a.score);
        }
        function top(ctx2) {
          return generate(ctx2)[0] || null;
        }
        function commitment(candidate, ctx2) {
          if (!candidate) return 0;
          const shot = ctx2.shot || {}, pressure = ctx2.pressure, held = ctx2.held;
          switch (candidate.id) {
            case "SHOT": {
              if (shot.oneVOne) return 1;
              if (shot.inBox && shot.dGoal <= 9.5 && (shot.blockers || 0) === 0) return 1;
              if (shot.inBox && shot.openWindow && (shot.blockers || 0) === 0) {
                let p2 = 0.022;
                if (shot.dGoal <= 14.5) p2 += 0.045;
                else if (shot.dGoal <= 18) p2 += 0.015;
                const centrality = shot.centrality ?? 99;
                if (centrality <= 10.5) p2 += 0.03;
                if (ctx2.role === "ST") p2 += 0.028;
                else if (ctx2.role === "WF") p2 += 0.02;
                else if (ctx2.role === "CM") p2 += 0.012;
                if (shot.dGoal > 17) p2 *= 0.8;
                if (shot.dGoal > 20) p2 *= 0.72;
                if (centrality > 12.5) p2 *= 0.6;
                if (ctx2.role === "WF" && centrality > 11.5) p2 *= 0.78;
                p2 += Math.min(2, Math.max(0, held)) * 0.012;
                if (ctx2.recentTakeOnWin) p2 += 0.16;
                if (ctx2.attackingThroughReceive) p2 += 0.035;
                if (ctx2.recentTeamShot) p2 *= 0.55;
                return clamp(p2, 0.018, 0.22);
              }
              let p = shot.inBox ? 0.018 : 4e-3;
              if (shot.openWindow) p += 0.025;
              if ((shot.blockers || 0) === 0) p += 0.01;
              if (shot.dGoal <= 14) p += 0.015;
              if (pressure > 2.4) p += 6e-3;
              if (ctx2.recentTeamShot) p *= 0.22;
              return clamp(p, 3e-3, 0.085);
            }
            case "THROUGH_PASS":
              return clamp(0.03 + (candidate.meta?.leadForward || 0) * 3e-3 + (pressure > 2.2 ? 0.01 : 0), 0.03, 0.105);
            case "EARLY_CROSS":
              return clamp(0.045 + (candidate.meta?.facingAlignment || 0) * 0.045 + (candidate.meta?.boxTargets || 1) * 0.01, 0.05, 0.135);
            // INTERNAL V0.6 rhythm: keep the accepted cut-back as a strong final-third action,
            // but do not turn every deep wide possession into an immediate aerial cross.
            case "DEEP_CROSS":
              return candidate.meta?.sourceX >= 94 ? 0.22 : candidate.meta?.sourceTouchline ? 0.13 : 0.09;
            case "CUTBACK":
              return candidate.meta?.sourceX >= 94 ? 0.35 : 0.28;
            case "PROGRESSIVE_PASS":
              return 0.82;
            case "SWITCH_PASS":
              return held > 1.1 ? 0.62 : 0.42;
            case "SAFE_PASS":
              return 0.58;
            case "RECYCLE":
              return 0.48;
            case "TAKE_ON":
              return clamp(0.065 + (candidate.meta?.skillAdvantage || 0) * 28e-4 + (candidate.meta?.spaceBehind || 0) * 5e-3 + (candidate.meta?.wide ? 0.02 : 0) + (ctx2.attackingThroughReceive ? 0.08 : 0), 0.045, 0.32);
            case "CARRY": {
              const chain = ctx2.boxCarryChain || 0;
              if (ctx2.deepEntryRestricted) return pressure < 1.5 ? 0.14 : 0.24;
              if ((ctx2.shot || {}).inBox && chain >= 2) return ctx2.clearRunway ? 0.46 : 0.28;
              if ((ctx2.shot || {}).inBox && chain === 1) return ctx2.clearRunway ? 0.7 : 0.42;
              return ctx2.clearRunway ? 1 : 0.62;
            }
            case "HOLD":
            case "TURN_BACK":
              return 1;
            default:
              return 0.8;
          }
        }
        return { VERSION, generate, top, commitment };
      });
    }
  });

  // prototype/hybrid_v48/choice_adapter.js
  var require_choice_adapter = __commonJS({
    "prototype/hybrid_v48/choice_adapter.js"(exports, module) {
      "use strict";
      var Legacy = require_action_candidate_engine();
      var { PITCH } = require_canonical_match_state();
      var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      function localX(player) {
        return player.team === 0 ? player.x : PITCH.length - player.x;
      }
      function contextFromCanonical(state, playerId2) {
        const p = state.players.find((q) => q.id === playerId2);
        if (!p || state.ball.ownerId !== playerId2) throw new Error("CHOICE_REQUIRES_CURRENT_PROTAGONIST_OWNER");
        const own = state.players.filter((q) => q.team === p.team && q.id !== p.id);
        const opponents = state.players.filter((q) => q.team !== p.team);
        const nearest = Math.min(...opponents.map((q) => dist(q, p)));
        const sorted = own.map((q) => ({ q, advance: localX(q) - localX(p), d: dist(q, p) })).sort((a, b) => b.advance - a.advance || a.q.id - b.q.id);
        const progressive = sorted.find((x) => x.advance > 2) || sorted[0];
        const safe = own.map((q) => ({ q, d: dist(q, p) })).sort((a, b) => a.d - b.d || a.q.id - b.q.id)[0];
        const goal = { x: p.team === 0 ? 105 : 0, y: 34 }, dGoal = dist(p, goal);
        return {
          role: p.role || "CM",
          localX: localX(p),
          wide: Math.abs(p.y - 34) > 19,
          pressure: nearest,
          space: Math.max(0, nearest - 1),
          held: p.held || 0,
          shot: { inBox: localX(p) >= 88 && Math.abs(p.y - 34) < 20, dGoal, centrality: Math.abs(p.y - 34), blockers: opponents.filter((q) => dist(q, p) < 2.2).length, openWindow: nearest > 1.5, oneVOne: false, clearKeeperChance: dGoal < 25, score: Math.max(0, 30 - dGoal) },
          pass: { progressive: progressive && { targetId: progressive.q.id, score: Math.max(0, progressive.advance), leadForward: progressive.advance }, safe: safe && { targetId: safe.q.id, score: Math.max(0, 25 - safe.d) }, runner: progressive && progressive.advance > 6 ? { targetId: progressive.q.id, score: progressive.advance, leadForward: progressive.advance, task: "ST_RELEASE_RUN" } : null }
        };
      }
      function generate(state, playerId2) {
        const context = contextFromCanonical(state, playerId2);
        return Legacy.generate(context).filter((c) => ["PASS", "PROGRESSIVE_PASS", "THROUGH_PASS", "SAFE_PASS", "CARRY", "SHOT"].includes(c.id) || c.id === "PROGRESSIVE_PASS").map((c) => ({ ...c, playerId: playerId2, targetId: c.meta && Number.isInteger(c.meta.targetId) ? c.meta.targetId : null, canonicalTargetId: c.meta && Number.isInteger(c.meta.targetId) ? c.meta.targetId : null }));
      }
      module.exports = Object.freeze({ contextFromCanonical, generate, VERSION: Legacy.VERSION });
    }
  });

  // prototype/hybrid_v48/a_scene_adapter.js
  var require_a_scene_adapter = __commonJS({
    "prototype/hybrid_v48/a_scene_adapter.js"(exports, module) {
      "use strict";
      var Canonical = require_canonical_match_state();
      var SUPPORTED = /* @__PURE__ */ new Set(["PASS", "PROGRESSIVE_PASS", "THROUGH_PASS", "SAFE_PASS", "CARRY", "SHOT"]);
      var TERMINALS = /* @__PURE__ */ new Set(["goal", "save", "claim", "block", "corner", "goalKick", "throwIn", "freeKick", "offside"]);
      var copy = Canonical.clone;
      function actionFor(choice) {
        if (!choice || !SUPPORTED.has(choice.choiceId || choice.id)) throw new Error("SCENE_NOT_IMPLEMENTED");
        const id = choice.choiceId || choice.id;
        if (id === "SHOT") return { type: "shot", aim: choice.aim };
        if (id === "CARRY") return { type: "carry", aim: choice.aim };
        return { type: "pass", targetId: choice.targetId };
      }
      function terminalFromEvents(events) {
        const event = events.find((e) => TERMINALS.has(e.type));
        return event ? { type: event.type, event } : null;
      }
      function sceneTemplate(options) {
        const Engine = options.engine;
        if (!Engine || !Engine.Match) throw new Error("A_ENGINE_INJECTED_API_REQUIRED");
        const raw = options.template ? copy(options.template) : JSON.parse(new Engine.Match(options.seed || "v48-scene").serialize());
        if (!Array.isArray(raw.players) || raw.players.length !== 22 || new Set(raw.players.map((p) => p.id)).size !== 22) throw new Error("A_TEMPLATE_REQUIRES_22_UNIQUE_PLAYERS");
        return raw;
      }
      function suppliedMap(map, id) {
        if (typeof map === "function") return map(id);
        if (map instanceof Map) return map.get(id);
        if (map && typeof map === "object") return map[id];
        throw new Error("A_PLAYER_MAPPING_INVALID");
      }
      function buildScenePlayerIdMapping(canonical, raw, options = {}) {
        Canonical.validate(canonical);
        const canonicalIds = canonical.players.map((p) => p.id), aIds = raw.players.map((p) => p.id), aSet = new Set(aIds), forward = /* @__PURE__ */ new Map(), reverse = /* @__PURE__ */ new Map(), explicit = options.aPlayerIdForCanonical;
        if (explicit != null) for (const id of canonicalIds) forward.set(id, suppliedMap(explicit, id));
        else for (const team of new Set(canonical.players.map((p) => p.team))) {
          const cs = canonical.players.filter((p) => p.team === team), as = raw.players.filter((p) => p.team === team);
          if (!as.length || cs.length !== as.length) throw new Error(`A_PLAYER_MAPPING_AMBIGUOUS_TEAM:${team}`);
          cs.forEach((p, index) => forward.set(p.id, as[index].id));
        }
        for (const id of canonicalIds) {
          const aId = forward.get(id);
          if (!aSet.has(aId)) throw new Error(`A_PLAYER_MAPPING_MISSING:${id}`);
          if (reverse.has(aId)) throw new Error(`A_PLAYER_MAPPING_DUPLICATE:${aId}`);
          reverse.set(aId, id);
        }
        if (reverse.size !== 22 || reverse.size !== aSet.size) throw new Error("A_PLAYER_MAPPING_INCOMPLETE");
        if (options.canonicalPlayerIdForA != null) {
          for (const aId of aIds) if (suppliedMap(options.canonicalPlayerIdForA, aId) !== reverse.get(aId)) throw new Error(`A_PLAYER_MAPPING_REVERSE_MISMATCH:${aId}`);
        }
        return Object.freeze({ forward, reverse, aForCanonical(id) {
          if (!forward.has(id)) throw new Error(`A_PLAYER_MAPPING_MISSING:${id}`);
          return forward.get(id);
        }, canonicalForA(id) {
          if (!reverse.has(id)) throw new Error(`A_PLAYER_MAPPING_UNKNOWN:${id}`);
          return reverse.get(id);
        } });
      }
      function makeSceneState(canonical, options = {}) {
        const raw = sceneTemplate(options), mapping = options.scenePlayerIdMapping || buildScenePlayerIdMapping(canonical, raw, options);
        for (const cp of canonical.players) {
          const ap = raw.players.find((p) => p.id === mapping.aForCanonical(cp.id));
          if (!ap) throw new Error(`A_PLAYER_MAPPING_MISSING:${cp.id}`);
          Object.assign(ap, { x: cp.x, y: cp.y, vx: 0, vy: 0, target: { x: cp.x, y: cp.y }, team: cp.team, role: cp.role || ap.role });
        }
        raw.score = [...canonical.score];
        raw.tick = canonical.tick;
        raw.clock = canonical.clock;
        raw.phase = "play";
        raw.paused = true;
        raw.restart = null;
        raw.possession = canonical.possessionTeam;
        raw.lastPossession = canonical.possessionTeam;
        raw.ball = { ...raw.ball, x: canonical.ball.x, y: canonical.ball.y, z: canonical.ball.z || 0.15, vx: 0, vy: 0, vz: 0, owner: canonical.ball.ownerId == null ? null : mapping.aForCanonical(canonical.ball.ownerId), mode: canonical.ball.mode || "controlled", flight: null, lastTouch: canonical.ball.ownerId == null ? null : mapping.aForCanonical(canonical.ball.ownerId), releasedAt: -100 };
        raw.history = raw.history || [];
        return raw;
      }
      function canonicalFromA(inspect3, options = {}) {
        const mapping = options.scenePlayerIdMapping;
        if (!mapping) throw new Error("A_PLAYER_MAPPING_REQUIRED_FOR_RETURN");
        if (!Array.isArray(inspect3.players) || inspect3.players.length !== 22 || new Set(inspect3.players.map((p) => p.id)).size !== 22) throw new Error("A_RETURN_REQUIRES_22_UNIQUE_PLAYERS");
        for (const p of inspect3.players) mapping.canonicalForA(p.id);
        if (inspect3.ball.owner != null) mapping.canonicalForA(inspect3.ball.owner);
        return Canonical.create({ tick: inspect3.tick, clock: inspect3.clock, phase: inspect3.phase, score: inspect3.score, possessionTeam: inspect3.possession, players: inspect3.players.map((p) => ({ id: mapping.canonicalForA(p.id), team: p.team, role: p.role, x: p.x, y: p.y, held: Math.max(0, inspect3.time - p.controlSince) })), ball: { x: inspect3.ball.x, y: inspect3.ball.y, z: inspect3.ball.z, ownerId: inspect3.ball.owner == null ? null : mapping.canonicalForA(inspect3.ball.owner), mode: inspect3.ball.mode }, metadata: { aVersion: inspect3.version } });
      }
      function inspectInBounds(inspect3) {
        const b = inspect3 && inspect3.ball;
        if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < 0 || b.x > 105 || b.y < 0 || b.y > 68) return false;
        return Array.isArray(inspect3.players) && inspect3.players.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 105 && p.y >= 0 && p.y <= 68);
      }
      function terminalBoundaryReady(inspect3, terminal) {
        if (!terminal || !inspectInBounds(inspect3)) return false;
        if (["save", "claim", "block"].includes(terminal.type)) return inspect3.ball.owner !== null && !inspect3.ball.flight;
        return inspect3.phase !== "play" || inspect3.ball.owner !== null && !inspect3.ball.flight;
      }
      function begin(canonical, protagonistId, options = {}) {
        Canonical.validate(canonical);
        if (canonical.ball.ownerId !== protagonistId) return { ok: false, code: "PROTAGONIST_NOT_CURRENT_OWNER" };
        const rawTemplate = sceneTemplate(options), mapping = buildScenePlayerIdMapping(canonical, rawTemplate, options);
        const fixture = makeSceneState(canonical, { ...options, template: rawTemplate, scenePlayerIdMapping: mapping });
        const match = options.engine.Match.restore(fixture);
        const inspect3 = match.inspect();
        if (!inspectInBounds(inspect3)) return { ok: false, code: "A_BEGIN_OUT_OF_BOUNDS" };
        return { ok: true, match, mapping, fixture, protagonistId, initialInspect: inspect3, submitted: false };
      }
      function createRetained(canonical, protagonistId, options = {}) {
        const rawTemplate = sceneTemplate(options), mapping = buildScenePlayerIdMapping(canonical, rawTemplate, options);
        const match = new options.engine.Match(options.seed || "v48-g1-retained");
        return hydrateRetained({ ok: true, match, mapping, protagonistId, submitted: false, retained: true, hydrations: 0 }, canonical, options);
      }
      function hydrateRetained(session, canonical, options = {}) {
        Canonical.validate(canonical);
        if (!session?.retained || !session.match || typeof session.match.hydrateCurrent !== "function") return { ok: false, code: "A_RETAINED_HYDRATION_API_REQUIRED" };
        if (canonical.ball.ownerId !== session.protagonistId) return { ok: false, code: "PROTAGONIST_NOT_CURRENT_OWNER" };
        const raw = makeSceneState(canonical, { ...options, template: JSON.parse(session.match.serialize()), scenePlayerIdMapping: session.mapping });
        const before = session.match.inspect(), hydrated = session.match.hydrateCurrent(raw), after = session.match.inspect();
        if (before.tick !== after.tick || before.clock !== after.clock || before.rng?.draws !== after.rng?.draws) return { ok: false, code: "A_HYDRATION_CONSUMED_TEMPORAL_STATE" };
        if (!inspectInBounds(hydrated)) return { ok: false, code: "A_BEGIN_OUT_OF_BOUNDS" };
        session.submitted = false;
        session.hydrations++;
        session.initialInspect = hydrated;
        return session;
      }
      function inspect2(session) {
        if (!session?.ok || !session.match) throw new Error("A_SESSION_REQUIRED");
        return session.match.inspect();
      }
      function submit(session, choice, options = {}) {
        if (!session?.ok || !session.match || session.submitted) return { ok: false, code: "A_SESSION_NOT_PENDING" };
        if (choice.playerId !== session.protagonistId) return { ok: false, code: "PROTAGONIST_AUTHORITY_REJECTED" };
        const action = actionFor(choice);
        if (action.targetId != null && (!Number.isInteger(action.targetId) || action.targetId === choice.playerId)) return { ok: false, code: "EXACT_TARGET_REJECTED" };
        const aPlayerId = session.mapping.aForCanonical(choice.playerId), aTargetId = action.targetId == null ? null : session.mapping.aForCanonical(action.targetId);
        const submittedAction = action.targetId == null ? action : { ...action, targetId: aTargetId };
        if (!session.match.submitAction({ playerId: aPlayerId, ...submittedAction })) return { ok: false, code: "A_REJECTED_ACTION" };
        session.submitted = true;
        session.startEvents = session.match.inspect().eventCount;
        session.match.resume();
        session.evidence = { choiceId: choice.choiceId || choice.id, playerId: choice.playerId, targetId: action.targetId == null ? null : action.targetId, aPlayerId, aTargetId, retainedMatch: true };
        return { ok: true, match: session.match, evidence: session.evidence };
      }
      function resolve(session, choice, options = {}) {
        if (!session?.submitted) return { ok: false, code: "A_SESSION_NOT_SUBMITTED" };
        const max = options.maxSteps || 900, observedFrames = [], displayFrames = [];
        let pendingTerminal = null;
        for (let step = 0; step < max; step++) {
          if (!session.match.advance()) break;
          const currentInspect = session.match.inspect(), events = session.match.eventsSince(session.startEvents), observed = terminalFromEvents([...events].reverse()), current = inspectInBounds(currentInspect) ? canonicalFromA(currentInspect, { scenePlayerIdMapping: session.mapping }) : null;
          if (displayFrames.length < 180) displayFrames.push(copy(currentInspect));
          if (current) {
            if (observedFrames.length < 180) observedFrames.push(current);
            if (typeof options.onObservedFrame === "function") options.onObservedFrame(current, step + 1);
          }
          if (observed) pendingTerminal = observed;
          if (pendingTerminal && terminalBoundaryReady(currentInspect, pendingTerminal)) return { ok: true, terminal: pendingTerminal, canonicalState: current, steps: step + 1, evidence: session.evidence, observedFrames, displayFrames, match: session.match };
          if (choice.choiceId !== "SHOT" && choice.id !== "SHOT" && currentInspect.phase === "play" && currentInspect.ball.owner !== null && !currentInspect.ball.flight && inspectInBounds(currentInspect) && step >= (options.minimumSteps || 2)) return { ok: true, terminal: { type: "controlledPossession", ownerId: session.mapping.canonicalForA(currentInspect.ball.owner) }, canonicalState: current, steps: step + 1, evidence: session.evidence, observedFrames, displayFrames, match: session.match };
        }
        return { ok: false, code: "SCENE_UNRESOLVED_FAIL_CLOSED", evidence: session.evidence };
      }
      function run(canonical, choice, options = {}) {
        const retained = begin(canonical, choice.playerId, options);
        if (!retained.ok) return retained;
        const accepted = submit(retained, choice, options);
        if (!accepted.ok) return { ...accepted, evidence: accepted.evidence || retained.evidence };
        return resolve(retained, choice, options);
      }
      module.exports = Object.freeze({ SUPPORTED, TERMINALS, makeSceneState, canonicalFromA, buildScenePlayerIdMapping, begin, createRetained, hydrateRetained, inspect: inspect2, submit, resolve, run, actionFor, terminalFromEvents, inspectInBounds });
    }
  });

  // prototype/hybrid_v48/replay_buffer.js
  var require_replay_buffer = __commonJS({
    "prototype/hybrid_v48/replay_buffer.js"(exports, module) {
      "use strict";
      var { clone: clone2, assertNoFuture } = require_canonical_match_state();
      function freezeFrame(frame) {
        assertNoFuture(frame, "frame");
        return Object.freeze(clone2(frame));
      }
      var ReplayBuffer = class {
        constructor(limit = 180) {
          this.limit = limit;
          this.frames = [];
          this.captures = [];
        }
        append(frame) {
          const f = freezeFrame(frame);
          this.frames.push(f);
          if (this.frames.length > this.limit) this.frames.shift();
          return f;
        }
        captureImportant(event) {
          if (!event || !event.type) throw new Error("REPLAY_EVENT_REQUIRED");
          const capture = Object.freeze({ event: freezeFrame(event), frames: Object.freeze(this.frames.slice()) });
          this.captures.push(capture);
          return capture;
        }
        current() {
          return this.frames.slice();
        }
      };
      module.exports = Object.freeze({ ReplayBuffer });
    }
  });

  // prototype/hybrid_v48/scene_trigger.js
  var require_scene_trigger = __commonJS({
    "prototype/hybrid_v48/scene_trigger.js"(exports, module) {
      "use strict";
      var IMPORTANT = /* @__PURE__ */ new Set(["goal", "save", "claim", "block", "corner", "goalKick", "throwIn", "freeKick", "offside"]);
      function presentTrigger(state, protagonistId) {
        if (state.ball.ownerId === protagonistId) return { kind: "CONTROLLED_POSSESSION", playerId: protagonistId };
        return null;
      }
      function classifyImportant(event) {
        return event && IMPORTANT.has(event.type) ? { type: event.type, event } : null;
      }
      module.exports = Object.freeze({ IMPORTANT, presentTrigger, classifyImportant });
    }
  });

  // prototype/hybrid_v48/hybrid_match_controller.js
  var require_hybrid_match_controller = __commonJS({
    "prototype/hybrid_v48/hybrid_match_controller.js"(exports, module) {
      "use strict";
      var Donor = require_donor_adapter();
      var Choices = require_choice_adapter();
      var AScene = require_a_scene_adapter();
      var { ReplayBuffer } = require_replay_buffer();
      var { presentTrigger, classifyImportant } = require_scene_trigger();
      var HOST_SECONDS_PER_DONOR_ITERATION = 1;
      var HOST_HALF_TIME_SECONDS = 45 * 60;
      var HOST_FULL_TIME_SECONDS = 90 * 60;
      var STATES = Object.freeze({ MACRO_RUNNING: "MACRO_RUNNING", INTERACTIVE_PENDING: "INTERACTIVE_PENDING", SCENE_RUNNING: "SCENE_RUNNING", SCENE_COMMIT: "SCENE_COMMIT", REPLAY_AVAILABLE: "REPLAY_AVAILABLE", FULL_TIME: "FULL_TIME", FAILED_CLOSED: "FAILED_CLOSED" });
      var HybridMatchController = class {
        constructor({ donor, donorContract = {}, aEngine, aOptions = {}, protagonistId, replayLimit = 180, matchId = "v48-g1" }) {
          if (!donor || typeof donor.readState !== "function" || typeof donor.advance !== "function" || typeof donor.pause !== "function" || typeof donor.resume !== "function") throw new Error("DONOR_CONTROL_CONTRACT_REQUIRED");
          this.donor = donor;
          this.donorContract = donorContract;
          this.aEngine = aEngine;
          this.aOptions = aOptions;
          this.protagonistId = protagonistId;
          this.replay = new ReplayBuffer(replayLimit);
          this.state = STATES.MACRO_RUNNING;
          this.pending = null;
          this.error = null;
          this.hostClock = { label: "V48 Hybrid host match clock", seconds: 0, halfTimeTransitions: 0, fullTimeTransitions: 0 };
          this.handoffCount = 0;
          this.matchId = matchId;
          this.generation = 0;
          this.sceneCounter = 0;
          this.retainedSession = null;
        }
        hostClockStatus() {
          return { ...this.hostClock, half: this.hostClock.seconds < HOST_HALF_TIME_SECONDS ? 1 : 2 };
        }
        advanceHostClock() {
          this.hostClock.seconds = Math.min(HOST_FULL_TIME_SECONDS, this.hostClock.seconds + HOST_SECONDS_PER_DONOR_ITERATION);
          if (this.hostClock.seconds === HOST_HALF_TIME_SECONDS && this.hostClock.halfTimeTransitions === 0) this.hostClock.halfTimeTransitions = 1;
          if (this.hostClock.seconds === HOST_FULL_TIME_SECONDS && this.hostClock.fullTimeTransitions === 0) {
            this.hostClock.fullTimeTransitions = 1;
            this.donor.pause();
            this.state = STATES.FULL_TIME;
            return true;
          }
          return false;
        }
        observe() {
          const canonical = Donor.toCanonical(this.donor.readState(), this.donorContract);
          this.replay.append({ tick: canonical.tick, clock: canonical.clock, score: canonical.score, ball: canonical.ball, players: canonical.players.map((p) => ({ id: p.id, x: p.x, y: p.y })) });
          return canonical;
        }
        openSceneFromCurrent(canonical, trigger = { kind: "G1_CURRENT_CONTROLLED_OWNER", playerId: this.protagonistId }) {
          if (this.state !== STATES.MACRO_RUNNING) return { ok: false, code: "SCENE_OPEN_REQUIRES_MACRO_RUNNING" };
          if (canonical.ball.ownerId !== this.protagonistId || canonical.ball.mode !== "controlled") return { ok: false, code: "PROTAGONIST_NOT_CURRENT_OWNER" };
          this.donor.pause();
          const session = this.retainedSession ? AScene.hydrateRetained(this.retainedSession, canonical, { engine: this.aEngine, ...this.aOptions }) : AScene.createRetained(canonical, this.protagonistId, { engine: this.aEngine, ...this.aOptions });
          if (!session.ok) return this.fail(session.code);
          this.retainedSession = session;
          const shown = AScene.inspect(session);
          if (!AScene.inspectInBounds(shown) || shown.players.length !== 22) return this.fail("A_HANDOFF_RENDER_CONTRACT_FAILED");
          const aCurrent = AScene.canonicalFromA(shown, { scenePlayerIdMapping: session.mapping });
          const generation = ++this.generation, sceneId = `${this.matchId}:scene:${++this.sceneCounter}`, choiceRevision = 1;
          const sourceStateDigest = JSON.stringify({ players: aCurrent.players.map((p) => [p.id, p.x, p.y]), ball: aCurrent.ball, score: aCurrent.score });
          const candidates = Choices.generate(aCurrent, this.protagonistId).filter((c) => ["SAFE_PASS", "PROGRESSIVE_PASS"].includes(c.id) && Number.isInteger(c.targetId)).map((c) => Object.freeze({ ...c, choiceId: c.id, generation, sceneId, choiceRevision, sourceStateDigest }));
          if (!candidates.length) return this.fail("G1_NO_EXECUTABLE_GROUNDED_PASS");
          this.pending = { canonical: aCurrent, trigger, candidates, session, shownMatch: session.match, generation, sceneId, choiceRevision, sourceStateDigest, submitted: false };
          this.state = STATES.INTERACTIVE_PENDING;
          return { ok: true, interactive: true, candidates, aInspect: shown, aMatch: session.match, hostClock: this.hostClockStatus(), generation, sceneId, choiceRevision, sourceStateDigest };
        }
        openTestOnlyCurrentDock() {
          return this.openSceneFromCurrent(this.observe(), { kind: "G1_TEST_ONLY_CURRENT_DOCK", playerId: this.protagonistId });
        }
        advanceMacro() {
          if (this.state !== STATES.MACRO_RUNNING) return { ok: false, code: "MACRO_NOT_RUNNING" };
          this.donor.advance();
          const canonical = this.observe();
          if (this.advanceHostClock()) return { ok: true, fullTime: true, hostClock: this.hostClockStatus() };
          const trigger = presentTrigger(canonical, this.protagonistId);
          if (trigger) return this.openSceneFromCurrent(canonical, trigger);
          return { ok: true, interactive: false, hostClock: this.hostClockStatus() };
        }
        submitAction({ choiceId, targetId = null, aim = null, playerId: playerId2 = this.protagonistId, generation, sceneId, choiceRevision, sourceStateDigest }) {
          if (this.state !== STATES.INTERACTIVE_PENDING || !this.pending) return { ok: false, code: "NO_INTERACTIVE_HANDOFF" };
          if (playerId2 !== this.protagonistId) return { ok: false, code: "PROTAGONIST_AUTHORITY_REJECTED" };
          if (this.pending.submitted || generation !== this.pending.generation || sceneId !== this.pending.sceneId || choiceRevision !== this.pending.choiceRevision || sourceStateDigest !== this.pending.sourceStateDigest) return { ok: false, code: "STALE_OR_DOUBLE_CHOICE_REJECTED" };
          const candidate = this.pending.candidates.find((c) => c.id === choiceId && (c.targetId ?? null) === (targetId ?? null));
          if (!candidate) return { ok: false, code: "EXACT_CHOICE_OR_TARGET_REJECTED" };
          if (["PASS", "PROGRESSIVE_PASS", "THROUGH_PASS", "SAFE_PASS"].includes(choiceId) && targetId == null) return { ok: false, code: "EXACT_TARGET_REQUIRED" };
          if (!["SAFE_PASS", "PROGRESSIVE_PASS"].includes(choiceId)) return { ok: false, code: "G1_UNSUPPORTED_CHOICE_CLASS" };
          this.pending.submitted = true;
          this.state = STATES.SCENE_RUNNING;
          const choice = { choiceId, targetId, playerId: playerId2, aim: null };
          const held = this.pending.session;
          if (held.match !== this.pending.shownMatch) return this.fail("A_MATCH_IDENTITY_LOST");
          const accepted = AScene.submit(held, choice, { engine: this.aEngine, ...this.aOptions });
          if (!accepted.ok) return this.fail(accepted.code);
          if (accepted.match !== this.pending.shownMatch) return this.fail("A_MATCH_IDENTITY_LOST");
          const scene = AScene.resolve(held, choice, { engine: this.aEngine, ...this.aOptions });
          if (!scene.ok) return this.fail(scene.code, { terminal: scene.terminal || null });
          this.lastScene = scene;
          this.state = STATES.SCENE_COMMIT;
          const patched = Donor.patchBack(this.donor.readState(), scene.canonicalState, scene, this.donorContract);
          if (!patched.ok) return this.fail(patched.code, { terminal: scene.terminal, terminalType: patched.terminalType, terminalContract: patched.terminalContract });
          if (typeof this.donor.patchState !== "function") return this.fail("DONOR_PATCH_CONTRACT_REQUIRED", { terminal: scene.terminal });
          this.donor.patchState(patched.state);
          const important = classifyImportant(scene.terminal);
          if (important) this.replay.captureImportant(important.event);
          this.pending = null;
          this.handoffCount++;
          this.donor.resume();
          this.state = STATES.MACRO_RUNNING;
          return { ok: true, terminal: scene.terminal, state: this.state, replayAvailable: this.replay.captures.length > 0, sceneFrames: scene.observedFrames || [], displayFrames: scene.displayFrames || [], evidence: scene.evidence };
        }
        fail(code, detail = {}) {
          this.error = code;
          this.state = STATES.FAILED_CLOSED;
          return { ok: false, code, state: this.state, ...detail };
        }
      };
      module.exports = Object.freeze({ HybridMatchController, STATES, HOST_SECONDS_PER_DONOR_ITERATION, HOST_HALF_TIME_SECONDS, HOST_FULL_TIME_SECONDS });
    }
  });

  // prototype/hybrid_v48/index.js
  var require_hybrid_v48 = __commonJS({
    "prototype/hybrid_v48/index.js"(exports, module) {
      "use strict";
      module.exports = Object.freeze({
        CanonicalMatchState: require_canonical_match_state(),
        DonorAdapter: require_donor_adapter(),
        ChoiceAdapter: require_choice_adapter(),
        ASceneAdapter: require_a_scene_adapter(),
        ReplayBuffer: require_replay_buffer().ReplayBuffer,
        SceneTrigger: require_scene_trigger(),
        HybridMatchController: require_hybrid_match_controller().HybridMatchController,
        STATES: require_hybrid_match_controller().STATES,
        HOST_SECONDS_PER_DONOR_ITERATION: require_hybrid_match_controller().HOST_SECONDS_PER_DONOR_ITERATION,
        HOST_HALF_TIME_SECONDS: require_hybrid_match_controller().HOST_HALF_TIME_SECONDS,
        HOST_FULL_TIME_SECONDS: require_hybrid_match_controller().HOST_FULL_TIME_SECONDS
      });
    }
  });

  // frl_a_validation/engine_b_candidate.js
  var require_engine_b_candidate = __commonJS({
    "frl_a_validation/engine_b_candidate.js"(exports, module) {
      (function(root, factory) {
        "use strict";
        const api = factory();
        if (typeof module === "object" && module.exports) module.exports = api;
        else root.AstraFootball = api;
      })(typeof globalThis !== "undefined" ? globalThis : exports, function() {
        "use strict";
        var _s;
        const DT = 0.05;
        const RESTORE = /* @__PURE__ */ Symbol("private restore construction");
        const CLOCK_RATE = 5400 / 1320;
        const ROLES = Object.freeze(["GK", "LB", "LCB", "RCB", "RB", "DM", "LCM", "RCM", "LF", "CF", "RF"]);
        const HOME = [[5, 34], [25, 9], [23, 25], [23, 43], [25, 59], [38, 34], [50, 23], [50, 45], [71, 8], [74, 34], [71, 60]];
        const DUTIES = Object.freeze(["GK", "SUPPORT", "RUN", "CARRY", "PRESS", "MARK", "COVER", "RECOVERY", "RECEIVE", "RESTART"]);
        const NOTABLE = /* @__PURE__ */ new Set(["shot", "goal", "save", "claim", "tackle", "loose", "foul", "block", "corner", "offside"]);
        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
        const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const copy = (value) => JSON.parse(JSON.stringify(value));
        const round2 = (n) => Math.round(n * 1e3) / 1e3;
        function hashSeed(seed) {
          let n = 2166136261;
          for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
          return n >>> 0 || 1;
        }
        function random(s) {
          let x = s.rng.state;
          x ^= x << 13;
          x ^= x >>> 17;
          x ^= x << 5;
          s.rng.state = x >>> 0;
          s.rng.draws++;
          return s.rng.state / 4294967296;
        }
        function direction(s, team) {
          return (team === 0 ? 1 : -1) * (s.half === 1 ? 1 : -1);
        }
        function local(s, team, x, y) {
          return direction(s, team) === 1 ? { x, y } : { x: 105 - x, y: 68 - y };
        }
        function world(s, team, x, y) {
          return local(s, team, x, y);
        }
        function opponents(s, p) {
          return s.players.filter((q) => q.team !== p.team);
        }
        function teammates(s, p) {
          return s.players.filter((q) => q.team === p.team && q.id !== p.id);
        }
        function event(s, type, team, text, playerId2 = null, detail = {}) {
          const e = {
            id: s.events.length,
            tick: s.tick,
            time: round2(s.time),
            clock: round2(s.clock),
            half: s.half,
            type,
            team,
            text,
            playerId: playerId2,
            notable: NOTABLE.has(type),
            ...detail
          };
          s.events.push(e);
          s.currentEvent = e.id;
          return e;
        }
        function makeStats() {
          return {
            goals: 0,
            shots: 0,
            shotsOnTarget: 0,
            saves: 0,
            claims: 0,
            passes: 0,
            completedPasses: 0,
            carries: 0,
            takeOns: 0,
            challenges: 0,
            retained: 0,
            defenderWins: 0,
            looseOutcomes: 0,
            fouls: 0,
            deflectionsOut: 0,
            blocks: 0,
            possessionTicks: 0,
            corners: 0,
            throwIns: 0,
            goalKicks: 0,
            freeKicks: 0,
            kickoffs: 0,
            offsides: 0
          };
        }
        function createState(seed) {
          const s = {
            version: "ASTRA-659-1",
            seed: String(seed),
            rng: { algorithm: "xorshift32", state: hashSeed(seed), draws: 0 },
            tick: 0,
            time: 0,
            clock: 0,
            half: 1,
            phase: "restart",
            paused: true,
            score: [0, 0],
            possession: null,
            lastPossession: null,
            transitionAt: 0,
            currentEvent: null,
            input: null,
            teams: [{ name: "Red", formation: "4-1-2-3", roles: [...ROLES] }, { name: "Blue", formation: "4-1-2-3", roles: [...ROLES] }],
            players: [],
            ball: {
              x: 52.5,
              y: 34,
              z: 0.15,
              vx: 0,
              vy: 0,
              vz: 0,
              owner: null,
              mode: "dead",
              lastTouch: null,
              releasedAt: -100,
              flight: null
            },
            restart: null,
            events: [],
            history: [],
            stats: [makeStats(), makeStats()],
            responsibilityVacancies: [],
            diagnostics: {
              contacts: 0,
              markingSamples: 0,
              markingGlueTicks: 0,
              handoffs: 0,
              wideThreatSamples: 0,
              wideAbandonmentTicks: 0,
              massChaseTicks: 0,
              shapeSamples: 0,
              widths: [0, 0],
              depths: [0, 0],
              minWidth: [100, 100],
              maxDepth: [0, 0],
              ballTruthConflicts: 0,
              lowPressureChallenges: 0,
              playerDistance: Array(22).fill(0),
              maxStationarySeconds: Array(22).fill(0),
              stationarySeconds: Array(22).fill(0)
            }
          };
          for (let team = 0; team < 2; team++) for (let i = 0; i < 11; i++) {
            const pos2 = world(s, team, ...HOME[i]);
            s.players.push({
              id: team * 11 + i,
              team,
              role: ROLES[i],
              slot: i,
              x: pos2.x,
              y: pos2.y,
              vx: 0,
              vy: 0,
              target: { ...pos2 },
              duty: i === 0 ? "GK" : "SUPPORT",
              markId: null,
              pressId: null,
              // A present-tense explanation for a defender's target.  It is deliberately
              // state, rather than a second movement system or a future tactical plan.
              defensiveContext: null,
              // One current responsibility contract per player.  It is serialized
              // MatchState, never a parallel tactical simulation or future plan.
              responsibility: {
                version: 0,
                epoch: 0,
                kind: i === 0 ? "GK" : "INITIAL",
                subjectId: null,
                acquiredAt: 0,
                releaseReason: "INITIAL",
                pressPhase: null,
                handoff: null,
                region: null
              },
              facingRadians: team === 0 ? 0 : Math.PI,
              facingSource: i === 0 ? "HOME_GOAL" : "MOVEMENT",
              // Rendering may smooth only a stable defensive display angle.  The
              // authoritative facingRadians/source above always remains current.
              renderFacingRadians: team === 0 ? 0 : Math.PI,
              renderFacingSource: i === 0 ? "HOME_GOAL" : "MOVEMENT",
              // A short-lived, current action direction.  This is MatchState authority
              // for a completed/selected action, never a visual-only renderer hint.
              facingIntent: null,
              decisionIn: 0.2 + random(s) * 0.5,
              challengeIn: 0,
              controlSince: -100,
              intent: null,
              // Present-tense movement intent is serialized state, not a future plan.
              // It prevents the shared 20 Hz tactical sample from becoming a shared 20 Hz motor command.
              movementIntent: null,
              attributes: {
                pace: 5.1 + random(s) * 1.6,
                control: 0.55 + random(s) * 0.4,
                passing: 0.55 + random(s) * 0.4,
                shooting: 0.5 + random(s) * 0.45,
                tackling: 0.5 + random(s) * 0.45,
                keeping: i === 0 ? 0.7 + random(s) * 0.25 : 0.1
              }
            });
          }
          startRestart(s, "kickoff", 0, { x: 52.5, y: 34 }, true);
          setTargets(s);
          integratePlayers(s);
          integrateBall(s);
          record(s);
          return s;
        }
        function startRestart(s, type, team, spot, reset = false) {
          s.phase = "restart";
          s.possession = null;
          s.input = null;
          s.ball.owner = null;
          s.ball.mode = "dead";
          s.ball.flight = null;
          s.ball.vx = s.ball.vy = s.ball.vz = 0;
          for (const p of s.players) invalidateCurrentContract(s, p, "RESTART_SETUP");
          const taker = s.players.filter((p) => p.team === team && (type === "goalKick" ? p.role === "GK" : p.role !== "GK")).sort((a, b) => type === "kickoff" ? a.role === "CF" ? -1 : b.role === "CF" ? 1 : a.id - b.id : distance(a, spot) - distance(b, spot))[0];
          s.restart = {
            type,
            team,
            spot: { x: clamp(spot.x, 0.2, 104.8), y: clamp(spot.y, 0.2, 67.8) },
            takerId: taker.id,
            elapsed: 0,
            wait: type === "kickoff" ? 2.5 : 1.5,
            reset
          };
          const key = { kickoff: "kickoffs", goalKick: "goalKicks", throwIn: "throwIns", corner: "corners", freeKick: "freeKicks" }[type];
          if (key) s.stats[team][key]++;
          event(s, type, team, `${s.teams[team].name} ${type.replace(/([A-Z])/g, " $1").toLowerCase()}`, taker.id);
        }
        function setPossession(s, p, arrival = null) {
          if (s.lastPossession !== p.team) {
            s.transitionAt = s.time;
            s.lastPossession = p.team;
          }
          s.possession = p.team;
          s.ball.owner = p.id;
          s.ball.mode = "controlled";
          s.ball.flight = null;
          s.ball.lastTouch = p.id;
          s.ball.vx = s.ball.vy = s.ball.vz = 0;
          p.controlSince = s.time;
          p.intent = null;
          p.facingIntent = null;
          if (arrival && Math.hypot(arrival.dx, arrival.dy) > 0.04) {
            p.facingIntent = { source: "RECEIVE", dx: arrival.dx, dy: arrival.dy, until: s.time + 0.16 };
            setFacing(p, arrival.dx, arrival.dy, "RECEIVE");
          } else setFacing(p, direction(s, p.team), 0, "POSSESSION_TRANSITION");
          p.decisionIn = 0.2 + random(s) * 0.4;
          for (const q of s.players) if (q.id !== p.id) invalidateCurrentContract(s, q, "POSSESSION_CHANGED");
          publishCurrentAction(s, p, "CARRY", { ...p.target }, arrival ? "RECEIVED_BALL_OWNER" : "POSSESSION_OWNER");
        }
        function shapeTarget(s, p, attacking) {
          const b = local(s, p.team, s.ball.x, s.ball.y);
          const i = p.slot;
          if (i === 0) return world(
            s,
            p.team,
            attacking ? clamp(b.x * 0.15, 4, 15) : clamp(3 + b.x * 0.07, 2, 8),
            clamp(34 + (b.y - 34) * (attacking ? 0.16 : 0.23), 26, 42)
          );
          const line = attacking ? clamp(b.x - 29, 21, 58) : clamp(b.x - 17, 12, 45);
          let x = i <= 4 ? line : i === 5 ? line + 12 : i <= 7 ? line + 23 : line + 36;
          if (attacking && (i === 1 || i === 4)) x += 5;
          if (attacking && i >= 8) x = Math.max(x, b.x + 10);
          let y = HOME[i][1];
          if (!attacking) y = 34 + (y - 34) * 0.8;
          y += (b.y - 34) * (i <= 4 ? 0.14 : 0.22);
          if (attacking && i > 4) {
            x += Math.sin(s.time * 0.36 + i * 1.7) * 2.4;
            y += Math.sin(s.time * 0.27 + i) * 2;
          }
          return world(s, p.team, clamp(x, 4, 98), clamp(y, 4, 64));
        }
        function localVelocity(s, team, p) {
          return direction(s, team) === 1 ? { x: p.vx, y: p.vy } : { x: -p.vx, y: -p.vy };
        }
        function contractEpoch(s) {
          return `${s.phase}:${s.lastPossession ?? "none"}:${s.ball.owner ?? "loose"}`;
        }
        function homeResponsibility(p) {
          const channel = p.role === "LB" ? "LEFT_CHANNEL" : p.role === "RB" ? "RIGHT_CHANNEL" : p.role === "LCB" || p.role === "RCB" ? "CENTRAL_BACK" : p.role === "DM" ? "CENTRAL_SCREEN" : "ROLE_SPACE";
          return { role: p.role, channel, region: { x: HOME[p.slot][0], y: HOME[p.slot][1] } };
        }
        function regionFor(s, team, p, anchor) {
          const linePeers = s.players.filter((q) => q.team === team && q.role !== "GK" && Math.abs(q.slot - p.slot) <= 2);
          const span = Math.max(7, linePeers.length > 1 ? linePeers.reduce((n, q) => n + distance(q, p), 0) / (linePeers.length - 1) : 11);
          return { x: round2(anchor.x), y: round2(anchor.y), span: round2(span), lane: p.role === "LB" ? "LEFT" : p.role === "RB" ? "RIGHT" : p.slot <= 5 ? "CENTRAL" : p.slot <= 7 ? "MID" : "FRONT" };
        }
        function assignmentSnapshot(p) {
          return {
            duty: p.duty,
            target: { ...p.target },
            markId: p.markId ?? null,
            pressId: p.pressId ?? null,
            responsibility: copy(p.responsibility),
            defensiveContext: copy(p.defensiveContext)
          };
        }
        function beginAssignmentPlanning(s) {
          const planning = {
            sequence: 0,
            proposals: /* @__PURE__ */ new Map(),
            proposalIndex: /* @__PURE__ */ new Map(),
            priorFinal: /* @__PURE__ */ new Map(),
            vacancies: copy(Array.isArray(s.responsibilityVacancies) ? s.responsibilityVacancies : []),
            committing: false
          };
          for (const p of s.players) planning.priorFinal.set(p.id, assignmentSnapshot(p));
          Object.defineProperty(s, "_assignmentPlanning", { value: planning, writable: true, configurable: true, enumerable: false });
          return planning;
        }
        function proposalRelationKey(duty, kind, extra) {
          const subjectId = extra.subjectId ?? null;
          if (Number.isInteger(subjectId)) return `${duty}|SUBJECT:${subjectId}`;
          if (extra.region) return `${duty}|REGION:${extra.region.lane || ""}:${round2(extra.region.x ?? 0)}:${round2(extra.region.y ?? 0)}`;
          return `${duty}|KIND:${kind}`;
        }
        function recordAssignmentProposal(s, team, p, duty, target, kind, extra = {}) {
          const planning = s._assignmentPlanning;
          if (!planning || planning.committing) return null;
          const subjectId = extra.subjectId ?? null;
          const normalized = {
            ...extra,
            pressureTargetId: extra.pressureTargetId ?? (duty === "PRESS" ? subjectId : null),
            markTargetId: extra.markTargetId ?? (duty === "MARK" ? subjectId : null)
          };
          normalized.watchTargetId = extra.watchTargetId ?? normalized.markTargetId ?? null;
          const key = proposalRelationKey(duty, kind, normalized), sequence = ++planning.sequence;
          const proposal = {
            sequence,
            playerId: p.id,
            team,
            duty,
            target: world(s, team, target.x, target.y),
            kind,
            extra: copy(normalized),
            relationKey: key,
            sources: [extra.writer || kind]
          };
          if (!planning.proposals.has(p.id)) planning.proposals.set(p.id, []);
          const list = planning.proposals.get(p.id), indexKey = `${p.id}|${key}`, priorIndex = planning.proposalIndex.get(indexKey);
          if (priorIndex !== void 0) {
            proposal.sources = [.../* @__PURE__ */ new Set([...list[priorIndex].sources || [], ...proposal.sources])];
            list[priorIndex] = proposal;
          } else {
            planning.proposalIndex.set(indexKey, list.length);
            list.push(proposal);
          }
          return proposal;
        }
        function proposalResponsibility(s, p, proposal, priorResponsibility = null) {
          const extra = proposal.extra || {}, prior = priorResponsibility || p.responsibility || { version: 0, acquiredAt: s.time };
          const epoch = contractEpoch(s), subjectId = extra.subjectId ?? null;
          const signature = `${epoch}|${proposal.kind}|${subjectId}|${extra.pressPhase || ""}|${extra.handoff?.to ?? ""}`;
          const priorSignature = `${prior.epoch}|${prior.kind}|${prior.subjectId}|${prior.pressPhase || ""}|${prior.handoff?.to ?? ""}`;
          const same = signature === priorSignature;
          return {
            version: same ? prior.version : (prior.version || 0) + 1,
            epoch,
            kind: proposal.kind,
            duty: proposal.duty,
            subjectId,
            homeResponsibility: homeResponsibility(p),
            acquiredAt: same ? prior.acquiredAt : s.time,
            releaseReason: extra.releaseReason || null,
            pressPhase: extra.pressPhase || null,
            handoff: extra.handoff || null,
            region: extra.region || null,
            protectedBy: extra.protectedBy ?? null,
            challengeIntent: !!extra.challengeIntent,
            pressureTargetId: extra.pressureTargetId ?? null,
            markTargetId: extra.markTargetId ?? null,
            watchTargetId: extra.watchTargetId ?? null,
            transition: {
              previousKind: prior.kind ?? null,
              previousSubjectId: prior.subjectId ?? null,
              previousDuty: prior.duty ?? null,
              reason: extra.reason || extra.releaseReason || "CURRENT_ASSIGNMENT",
              writer: extra.writer || proposal.kind,
              acquisitionBasis: extra.acquisitionBasis || null
            }
          };
        }
        function writeAssignment(s, p, proposal, priorSnapshot = null, finalMeta = null) {
          const prior = priorSnapshot?.responsibility || p.responsibility;
          const responsibility = proposalResponsibility(s, p, proposal, prior);
          p.duty = proposal.duty;
          p.target = { ...proposal.target };
          p.markId = proposal.duty === "MARK" ? responsibility.markTargetId ?? responsibility.subjectId : null;
          p.pressId = proposal.duty === "PRESS" ? responsibility.pressureTargetId ?? responsibility.subjectId : null;
          p.responsibility = responsibility;
          const extra = proposal.extra || {};
          p.defensiveContext = {
            responsibility: proposal.kind,
            homeResponsibility: homeResponsibility(p),
            homeZone: { x: HOME[p.slot][0], y: HOME[p.slot][1] },
            contractVersion: responsibility.version,
            ...extra.handoff ? {
              handoffTo: p.id === extra.handoff.from ? extra.handoff.to : null,
              handoffFrom: extra.handoff.from,
              handoffReason: extra.handoff.reason
            } : { handoffTo: null },
            ...extra.pressPhase ? { pressPhase: extra.pressPhase } : {},
            ...extra.reason ? { reason: extra.reason } : {},
            ...extra.pressureOwner === void 0 ? {} : { pressureOwner: extra.pressureOwner },
            ...extra.markShadow === void 0 ? {} : { markShadow: extra.markShadow },
            ...extra.threatLevel === void 0 ? {} : { threatLevel: round2(extra.threatLevel) },
            ...extra.attackTrigger === void 0 ? {} : { attackTrigger: extra.attackTrigger },
            ...extra.recoverableEnvelope === void 0 ? {} : { recoverableEnvelope: extra.recoverableEnvelope },
            ...extra.protectedBy === void 0 ? {} : { centralProtectedBy: extra.protectedBy },
            pressureTargetId: responsibility.pressureTargetId,
            markTargetId: responsibility.markTargetId,
            watchTargetId: responsibility.watchTargetId,
            ...finalMeta ? { finalAssignment: copy(finalMeta) } : {}
          };
        }
        function publishResponsibility(s, team, p, duty, target, kind, extra = {}) {
          const proposal = recordAssignmentProposal(s, team, p, duty, target, kind, extra) || { playerId: p.id, team, duty, target: world(s, team, target.x, target.y), kind, extra: copy(extra), sources: [extra.writer || kind] };
          if (s._assignmentPlanning && !s._assignmentPlanning.committing) return proposal;
          writeAssignment(s, p, proposal);
          return proposal;
        }
        function invalidateCurrentContract(s, p, reason) {
          p.markId = null;
          p.pressId = null;
          p.facingIntent = null;
          p.intent = null;
          p.movementIntent = null;
          p.motionDemand = null;
          const prior = p.responsibility || { version: 0 };
          p.responsibility = {
            version: prior.version + 1,
            epoch: contractEpoch(s),
            kind: "INVALIDATED",
            duty: null,
            subjectId: null,
            homeResponsibility: homeResponsibility(p),
            acquiredAt: s.time,
            releaseReason: reason,
            pressPhase: null,
            handoff: null,
            region: null,
            protectedBy: null,
            challengeIntent: false,
            pressureTargetId: null,
            markTargetId: null,
            watchTargetId: null
          };
          p.defensiveContext = {
            responsibility: "INVALIDATED",
            contractVersion: p.responsibility.version,
            reason,
            pressureTargetId: null,
            markTargetId: null,
            watchTargetId: null
          };
        }
        function publishCurrentAction(s, p, duty, target, kind) {
          publishResponsibility(s, p.team, p, duty, local(s, p.team, target.x, target.y), kind, {
            subjectId: null,
            reason: kind,
            releaseReason: "CURRENT_ACTION",
            markShadow: false
          });
        }
        function finalLineCentralThreats(s, team) {
          return s.players.filter((p) => p.team !== team && p.role !== "GK").map((p) => {
            const q = local(s, team, p.x, p.y), velocity = localVelocity(s, team, p);
            const urgency = clamp((58 - q.x) / 38, 0, 1) + clamp(-velocity.x / 5, 0, 0.7) + clamp(1 - Math.abs(q.y - 34) / 12, 0, 0.4);
            return { p, q, velocity, urgency };
          }).filter((t) => {
            const strikerLike = ["CF", "ST"].includes(t.p.role);
            const currentCentralRun = t.q.x <= 47 && (t.velocity.x < -0.25 || t.q.x <= 35);
            return t.q.x >= 6 && t.q.x <= 58 && Math.abs(t.q.y - 34) <= 12 && (strikerLike || currentCentralRun);
          }).sort((a, b) => b.urgency - a.urgency || a.q.x - b.q.x || Math.abs(a.q.y - 34) - Math.abs(b.q.y - 34) || a.p.id - b.p.id);
        }
        function finalLineProtectorGeometry(s, team, defender, threat) {
          if (!defender || defender.team !== team || defender.role === "GK") return false;
          const q = local(s, team, defender.x, defender.y);
          return q.x <= threat.q.x - 0.35 && Math.hypot(q.x - threat.q.x, q.y - threat.q.y) <= 15 && Math.abs(q.y - threat.q.y) <= 13;
        }
        function proposalOwnsThreat(proposal, threatId) {
          const extra = proposal?.extra || {};
          return extra.subjectId === threatId || extra.markTargetId === threatId || extra.watchTargetId === threatId;
        }
        function proposalTargetProtectsThreat(s, team, proposal, threat) {
          if (!proposal) return false;
          const target = local(s, team, proposal.target.x, proposal.target.y);
          return target.x <= threat.q.x - 0.35 && Math.hypot(target.x - threat.q.x, target.y - threat.q.y) <= 17 && Math.abs(target.y - threat.q.y) <= 13;
        }
        function arbitrationProposal(s, team, p, duty, target, kind, extra = {}) {
          const subjectId = extra.subjectId ?? null;
          const normalized = {
            ...extra,
            pressureTargetId: extra.pressureTargetId ?? (duty === "PRESS" ? subjectId : null),
            markTargetId: extra.markTargetId ?? (duty === "MARK" ? subjectId : null)
          };
          normalized.watchTargetId = extra.watchTargetId ?? normalized.markTargetId ?? null;
          return {
            sequence: ++s._assignmentPlanning.sequence,
            playerId: p.id,
            team,
            duty,
            target: world(s, team, target.x, target.y),
            kind,
            extra: normalized,
            relationKey: proposalRelationKey(duty, kind, normalized),
            sources: [extra.writer || "TEAM_FINAL_ARBITRATION"]
          };
        }
        function retainedFinalLineProposal(s, team, p, threat, prior) {
          const anchor = v3DefensiveAnchor(s, p.team, p);
          return arbitrationProposal(
            s,
            team,
            p,
            prior.duty || "COVER",
            v3ShadowTarget(anchor, threat, null),
            prior.kind || "SCREEN_LANE",
            {
              subjectId: threat.p.id,
              region: anchor,
              releaseReason: prior.releaseReason || "CURRENT_CREDIBLE_TAKEOVER_REQUIRED",
              pressPhase: prior.pressPhase,
              challengeIntent: prior.challengeIntent,
              markTargetId: prior.markTargetId,
              watchTargetId: prior.watchTargetId ?? threat.p.id,
              pressureTargetId: prior.pressureTargetId,
              protectedBy: prior.protectedBy,
              reason: "CURRENT_VALID_PRIOR_RELATION_RETAINED",
              writer: "TEAM_FINAL_ARBITRATION",
              acquisitionBasis: "CURRENT_BODY_AND_TARGET_PROTECT_SAME_THREAT"
            }
          );
        }
        function latestProposal(planning, playerId2, predicate = null) {
          const list = (planning.proposals.get(playerId2) || []).filter((proposal) => !predicate || predicate(proposal));
          return list.slice().sort((a, b) => b.sequence - a.sequence)[0] || null;
        }
        function remainingSpaceGeometry(s, team, p, proposal, deepest, centralY) {
          const body = local(s, team, p.x, p.y), target = local(s, team, proposal.target.x, proposal.target.y);
          return {
            bodySafe: body.x <= deepest.q.x - 0.35 && Math.abs(body.y - centralY) <= 16,
            targetSafe: target.x <= deepest.q.x - 0.35 && Math.abs(target.y - centralY) <= 16
          };
        }
        function arbitrateTeamAssignments(s, team, planning, protectedIds) {
          const ours = s.players.filter((p) => p.team === team), outfield = ours.filter((p) => p.role !== "GK");
          const finals = /* @__PURE__ */ new Map(), threats = finalLineCentralThreats(s, team), direct = /* @__PURE__ */ new Map(), used = /* @__PURE__ */ new Set();
          for (const p of ours) {
            const candidate = latestProposal(planning, p.id);
            if (candidate) finals.set(p.id, candidate);
          }
          for (const threat of threats) {
            const incumbents = outfield.filter((p) => !protectedIds.has(p.id) && !used.has(p.id) && responsibilityOwnsThreat({ responsibility: planning.priorFinal.get(p.id)?.responsibility }, threat.p.id) && finalLineProtectorGeometry(s, team, p, threat)).sort((a, b) => distance(a, threat.p) - distance(b, threat.p) || a.id - b.id);
            const incumbent = incumbents[0];
            if (!incumbent) continue;
            const proposal = retainedFinalLineProposal(s, team, incumbent, threat, planning.priorFinal.get(incumbent.id).responsibility);
            if (!proposalTargetProtectsThreat(s, team, proposal, threat)) continue;
            finals.set(incumbent.id, proposal);
            direct.set(incumbent.id, threat);
            used.add(incumbent.id);
          }
          const open = threats.filter((threat) => ![...direct.values()].some((item) => item.p.id === threat.p.id));
          const acquired = /* @__PURE__ */ new Map();
          const tryAcquire = (threat, seen) => {
            const choices = outfield.filter((p) => !protectedIds.has(p.id) && !used.has(p.id)).flatMap((p) => (planning.proposals.get(p.id) || []).filter((proposal) => proposalOwnsThreat(proposal, threat.p.id) && finalLineProtectorGeometry(s, team, p, threat) && proposalTargetProtectsThreat(s, team, proposal, threat)).map((proposal) => ({ p, proposal, score: distance(p, threat.p), prior: acquired.get(p.id) }))).sort((a, b) => a.score - b.score || b.proposal.sequence - a.proposal.sequence || a.p.id - b.p.id);
            for (const choice of choices) {
              if (seen.has(choice.p.id)) continue;
              seen.add(choice.p.id);
              const priorThreat = acquired.get(choice.p.id)?.threat;
              if (!priorThreat || tryAcquire(priorThreat, seen)) {
                acquired.set(choice.p.id, { threat, proposal: choice.proposal });
                return true;
              }
            }
            return false;
          };
          for (const threat of open) tryAcquire(threat, /* @__PURE__ */ new Set());
          for (const [playerId2, item] of acquired) {
            finals.set(playerId2, item.proposal);
            direct.set(playerId2, item.threat);
            used.add(playerId2);
          }
          for (const threat of threats.filter((item) => ![...direct.values()].some((assigned) => assigned.p.id === item.p.id))) {
            const choices = outfield.filter((p) => !protectedIds.has(p.id) && !used.has(p.id) && finalLineProtectorGeometry(s, team, p, threat)).map((p) => {
              const proposal2 = finals.get(p.id), lowPriority = proposal2 && /^DEFAULT_/.test(proposal2.kind);
              return { p, proposal: proposal2, lowPriority, score: distance(p, threat.p) };
            }).filter((item) => item.lowPriority).sort((a, b) => a.score - b.score || a.p.id - b.p.id);
            const choice = choices[0];
            if (!choice) continue;
            const anchor = v3DefensiveAnchor(s, team, choice.p);
            const proposal = arbitrationProposal(
              s,
              team,
              choice.p,
              "COVER",
              v3ShadowTarget(anchor, threat, null),
              "SCREEN_LANE",
              {
                subjectId: threat.p.id,
                region: anchor,
                reason: "CURRENT_FINAL_LINE_COVERAGE_ACQUIRE",
                releaseReason: "CURRENT_CREDIBLE_TAKEOVER_REQUIRED",
                markShadow: false,
                markTargetId: null,
                watchTargetId: threat.p.id,
                writer: "TEAM_FINAL_ARBITRATION",
                acquisitionBasis: "CURRENT_DANGEROUS_CENTRAL_THREAT_ONE_TO_ONE_PROTECTOR"
              }
            );
            finals.set(choice.p.id, proposal);
            direct.set(choice.p.id, threat);
            used.add(choice.p.id);
          }
          const remainingSpace = { required: false, currentlySecured: true, targetSafe: true, supporterId: null };
          const hasDefaultSupport = outfield.some((p) => /^DEFAULT_SUPPORT$/.test(finals.get(p.id)?.kind || ""));
          if (threats.length && [...direct.values()].length && hasDefaultSupport) {
            const deepest = threats.slice().sort((a, b) => a.q.x - b.q.x || a.p.id - b.p.id)[0];
            const centralY = threats.reduce((sum, threat) => sum + threat.q.y, 0) / threats.length;
            const eligible = outfield.filter((p) => !protectedIds.has(p.id) && !direct.has(p.id) && finals.has(p.id));
            const safe = eligible.map((p) => ({ p, geometry: remainingSpaceGeometry(s, team, p, finals.get(p.id), deepest, centralY) })).filter((item) => item.geometry.bodySafe && item.geometry.targetSafe);
            if (!safe.length) {
              remainingSpace.required = true;
              remainingSpace.currentlySecured = false;
              const choices = eligible.filter((p) => /^DEFAULT_(SUPPORT|COVER)$/.test(finals.get(p.id).kind)).map((p) => {
                const q = local(s, team, p.x, p.y), anchor = v3DefensiveAnchor(s, team, p);
                const target = {
                  x: clamp(deepest.q.x - 2.2, 4, 65),
                  y: clamp(anchor.y * 0.55 + centralY * 0.45, 8, 60)
                };
                return { p, q, anchor, target, score: Math.hypot(q.x - target.x, q.y - target.y) + Math.abs(q.y - centralY) * 0.35 };
              }).sort((a, b) => a.score - b.score || a.p.id - b.p.id);
              const choice = choices[0];
              if (choice) {
                const bodySafe = choice.q.x <= deepest.q.x - 0.35 && Math.abs(choice.q.y - centralY) <= 16;
                const proposal = arbitrationProposal(
                  s,
                  team,
                  choice.p,
                  bodySafe ? "COVER" : "RECOVERY",
                  choice.target,
                  "REST_DEFENCE_SPACE",
                  {
                    subjectId: null,
                    region: { x: round2(choice.target.x), y: round2(choice.target.y), span: 16, lane: "CENTRAL_SPACE" },
                    reason: "DEFAULT_TARGET_REJECTED_REMAINING_SPACE_UNSAFE",
                    releaseReason: "CURRENT_STRUCTURE_SAFE_OR_THREAT_ENDED",
                    markShadow: false,
                    markTargetId: null,
                    watchTargetId: null,
                    writer: "TEAM_FINAL_ARBITRATION",
                    acquisitionBasis: "CURRENT_BODY_AND_PROPOSED_TARGET_REMAINING_SPACE"
                  }
                );
                finals.set(choice.p.id, proposal);
                remainingSpace.supporterId = choice.p.id;
                remainingSpace.targetSafe = remainingSpaceGeometry(s, team, choice.p, proposal, deepest, centralY).targetSafe;
              } else remainingSpace.targetSafe = false;
            }
          }
          return { finals, diagnostic: {
            snapshotTick: s.tick,
            threatIds: threats.map((threat) => threat.p.id),
            directAssignments: [...direct].map(([playerId2, threat]) => ({ playerId: playerId2, threatId: threat.p.id })),
            protectedPlayerIds: [...protectedIds].filter((id) => s.players[id]?.team === team),
            remainingSpace
          } };
        }
        function finalAssignmentCommit(s, owner) {
          const planning = s._assignmentPlanning;
          if (!planning) return;
          const flightReceiver = s.ball.owner === null && s.ball.flight?.type === "pass" ? s.players[s.ball.flight.targetId] : null;
          if (owner) publishCurrentAction(
            s,
            owner,
            "CARRY",
            owner.intent && owner.intent.until > s.time ? owner.intent.aim : latestProposal(planning, owner.id)?.target || planning.priorFinal.get(owner.id).target,
            owner.intent && owner.intent.until > s.time ? "SELECTED_CARRY_OWNER" : "CURRENT_BALL_OWNER"
          );
          if (flightReceiver) {
            const incomingTarget = { x: clamp(s.ball.x + s.ball.vx * 0.22, 1, 104), y: clamp(s.ball.y + s.ball.vy * 0.22, 1, 67) };
            publishResponsibility(
              s,
              flightReceiver.team,
              flightReceiver,
              "RECEIVE",
              local(s, flightReceiver.team, incomingTarget.x, incomingTarget.y),
              "INTENDED_PASS_RECEIVE",
              {
                subjectId: flightReceiver.id,
                reason: "CURRENT_FLIGHT_TARGET",
                releaseReason: "FLIGHT_END_OR_CONTROL",
                writer: "CURRENT_ACTION_PROPOSAL"
              }
            );
          }
          const protectedIds = new Set([owner?.id, flightReceiver?.id].filter(Number.isInteger));
          const teamDecisions = /* @__PURE__ */ new Map([
            [0, arbitrateTeamAssignments(s, 0, planning, protectedIds)],
            [1, arbitrateTeamAssignments(s, 1, planning, protectedIds)]
          ]);
          for (const vacancy of planning.vacancies.filter((item) => item.state === "RELEASING" && Number.isInteger(item.subjectId))) {
            const decision = teamDecisions.get(vacancy.team), fb = s.players[vacancy.homeOwnerId], threat = s.players[vacancy.subjectId];
            const finalFb = decision?.finals.get(vacancy.homeOwnerId), anchor = fb && v3DefensiveAnchor(s, vacancy.team, fb);
            if (!decision || !fb || !threat || !anchor || !finalFb) {
              vacancy.returnOwnershipEstablished = false;
              continue;
            }
            const tq = local(s, vacancy.team, threat.x, threat.y), bq = local(s, vacancy.team, fb.x, fb.y);
            const target = local(s, vacancy.team, finalFb.target.x, finalFb.target.y);
            vacancy.returnOwnershipEstablished = proposalOwnsThreat(finalFb, threat.id) && Math.hypot(bq.x - tq.x, bq.y - tq.y) <= anchor.span * 1.45 && target.x <= tq.x - 0.35 && Math.abs(target.y - tq.y) <= anchor.span * 1.2;
            const central = decision.diagnostic.directAssignments.find((item) => item.threatId !== vacancy.subjectId);
            vacancy.centralGuardId = central?.playerId ?? null;
          }
          planning.committing = true;
          for (const p of s.players) {
            const teamDecision = teamDecisions.get(p.team), proposal = teamDecision.finals.get(p.id);
            if (!proposal) throw new Error(`Missing final assignment proposal for player ${p.id}`);
            const proposals = planning.proposals.get(p.id) || [];
            writeAssignment(s, p, proposal, planning.priorFinal.get(p.id), {
              commitWriter: "TEAM_FINAL_ASSIGNMENT",
              snapshotTick: s.tick,
              proposalCount: proposals.length,
              proposalKinds: proposals.map((item) => item.kind),
              proposalSources: [...new Set(proposals.flatMap((item) => item.sources || []))],
              selectedKind: proposal.kind,
              selectedSource: proposal.sources?.[0] || proposal.extra?.writer || null,
              teamArbitration: teamDecision.diagnostic
            });
          }
          s.responsibilityVacancies = planning.vacancies;
          delete s._assignmentPlanning;
        }
        function shadowTarget(anchor, threat) {
          const q = threat.q;
          return {
            x: clamp(Math.min(anchor.x + anchor.span * 0.22, q.x - Math.max(1.4, anchor.span * 0.16)), 4, 65),
            y: clamp(anchor.y * 0.58 + q.y * 0.42, 4, 64)
          };
        }
        function recoverableWideEnvelope(s, team, fb, winger, owner) {
          const fq = local(s, team, fb.x, fb.y), wq = local(s, team, winger.x, winger.y);
          const fv = localVelocity(s, team, fb), wv = localVelocity(s, team, winger);
          const reengage = { x: wq.x - 1.8, y: wq.y };
          const delta = { x: reengage.x - fq.x, y: reengage.y - fq.y }, gap = Math.hypot(delta.x, delta.y);
          const toward = gap ? (fv.x * delta.x + fv.y * delta.y) / gap : 0;
          const turnCost = Math.max(0, -toward) / Math.max(3.5, fb.attributes.pace) * 0.42;
          const accelerationCost = Math.max(0, fb.attributes.pace - Math.hypot(fv.x, fv.y)) / Math.max(20, fb.attributes.pace * 5);
          const recoverySeconds = gap / Math.max(3.8, fb.attributes.pace * 0.82) + turnCost + accelerationCost;
          const ballGap = owner ? distance(owner, winger) : distance(s.ball, winger);
          const launchSpeed = Math.max(9, Math.hypot(s.ball.vx, s.ball.vy));
          const passWindow = ballGap / launchSpeed + 0.38;
          const threatRun = Math.max(0, -wv.x) * 0.11;
          return recoverySeconds + threatRun <= passWindow;
        }
        function pressPlan(s, team, p, owner, anchor, coverage) {
          const q = local(s, team, p.x, p.y), carrier = local(s, team, owner.x, owner.y), v = localVelocity(s, team, p);
          const gap = Math.hypot(carrier.x - q.x, carrier.y - q.y), span = anchor.span;
          const leaving = Math.hypot(q.x - anchor.x, q.y - anchor.y);
          const closesCentral = Math.abs(carrier.y - 34) < span * 0.9 || anchor.lane === (carrier.y < 34 ? "LEFT" : "RIGHT");
          const roleRisk = (p.role === "LCB" || p.role === "RCB") && !coverage ? span * 0.7 : 0;
          const eligible = closesCentral && gap <= span * 1.55 && leaving <= span * 1.35 && !(roleRisk && gap > span * 0.58);
          if (!eligible) return null;
          const toCarrier = gap ? { x: (carrier.x - q.x) / gap, y: (carrier.y - q.y) / gap } : { x: 0, y: 0 };
          const closing = v.x * toCarrier.x + v.y * toCarrier.y;
          const stopping = closing > 0 ? closing * closing / Math.max(8, p.attributes.pace * 2.1) : 0;
          const centralBias = clamp((34 - carrier.y) * 0.055, -1.25, 1.25);
          const desiredGap = 1.28 + stopping;
          const phase = gap > desiredGap + 0.55 ? "APPROACH" : gap > 1.22 ? "CONTAIN" : "CHALLENGE";
          const offset = phase === "APPROACH" ? desiredGap : Math.max(1.15, desiredGap);
          const target = { x: clamp(carrier.x - offset, 3, 72), y: clamp(carrier.y + centralBias, 4, 64) };
          return { gap, eligible, phase, target, score: gap + leaving * 0.42 + roleRisk, challengeIntent: phase === "CHALLENGE" && closing < p.attributes.pace * 0.58 };
        }
        function v3DefensiveAnchor(s, team, p) {
          const b = local(s, team, s.ball.x, s.ball.y), h = HOME[p.slot];
          const back = p.slot <= 4, midfield = p.slot >= 5 && p.slot <= 7;
          const depthShift = back ? clamp((52 - b.x) * 0.16, -3.5, 6.4) : midfield ? clamp((52 - b.x) * 0.22, -5, 8) : clamp((52 - b.x) * 0.12, -3, 4);
          const lateralWeight = p.role === "LB" || p.role === "RB" ? 0.3 : p.role === "LCB" || p.role === "RCB" ? 0.16 : midfield ? 0.25 : 0.11;
          const centralBias = p.role === "LCB" ? 1.1 : p.role === "RCB" ? -1.1 : p.role === "DM" ? (34 - h[1]) * 0.18 : 0;
          const target = {
            x: clamp(h[0] + depthShift + (p.slot === 1 || p.slot === 4 ? (b.x - 52) * 0.035 : 0), 4, 82),
            y: clamp(h[1] + (b.y - h[1]) * lateralWeight + centralBias, 4, 64)
          };
          return regionFor(s, team, p, target);
        }
        function v3Danger(s, team, carrier) {
          const q = local(s, team, carrier.x, carrier.y), v = localVelocity(s, team, carrier);
          const box = clamp((39 - q.x) / 32, 0, 1);
          const facesGoal = clamp((-v.x + 0.8) / 4.4, 0, 1);
          const lane = clamp(1 - Math.abs(q.y - 34) / 27, 0, 1);
          return clamp(box * 0.55 + facesGoal * 0.18 + lane * 0.27, 0, 1);
        }
        function v3PressurePlan(s, team, p, carrier, anchor, hasCentralCover, incoming) {
          const q = local(s, team, p.x, p.y), c = local(s, team, carrier.x, carrier.y), v = localVelocity(s, team, p);
          const dx = c.x - q.x, dy = c.y - q.y, gap = Math.hypot(dx, dy), span = anchor.span;
          const leaving = Math.hypot(q.x - anchor.x, q.y - anchor.y);
          const sameLane = anchor.lane === "CENTRAL" || anchor.lane === "LEFT" && c.y < 40 || anchor.lane === "RIGHT" && c.y > 28 || anchor.lane === "MID" && Math.abs(c.y - anchor.y) < span * 0.95;
          const eligible = sameLane && gap <= span * 1.28 && leaving <= span * 1.18 && (!["LCB", "RCB"].includes(p.role) || hasCentralCover || gap < span * 0.55);
          if (!eligible) return null;
          const unit = gap > 0.01 ? { x: dx / gap, y: dy / gap } : { x: 0, y: 0 };
          const closing = v.x * unit.x + v.y * unit.y;
          const stopping = closing > 0 ? closing * closing / Math.max(10, p.attributes.pace * 3.1) : 0;
          const danger = v3Danger(s, team, carrier);
          const baseline = 2.25 + clamp((anchor.span - 7) * 0.055, 0, 0.42);
          const desiredGap = clamp(baseline - danger * 1.12 + stopping * 0.48 + (incoming ? 0.18 : 0), 1.08, 3.05);
          const laneSide = clamp((34 - c.y) * 0.07, -1.05, 1.05);
          const goalSide = Math.max(0.72, desiredGap * (danger > 0.56 ? 1.05 : 0.88));
          const target = { x: clamp(c.x - goalSide, 2.5, 72), y: clamp(c.y + laneSide, 4, 64) };
          let phase = gap > desiredGap + 0.72 ? "PRIMARY_CONTAIN" : gap > desiredGap + 0.18 ? "CLOSE_DOWN" : danger > 0.48 ? "TIGHT_MARK" : "PRIMARY_CONTAIN";
          if (gap <= Math.max(1.12, desiredGap - 0.38) && danger > 0.63 && closing < p.attributes.pace * 0.52) phase = "CHALLENGE";
          return {
            gap,
            desiredGap,
            danger,
            phase,
            target,
            score: gap + leaving * 0.48 + (p.role === "DM" ? 0.16 : 0),
            challengeIntent: phase === "CHALLENGE",
            eligible
          };
        }
        function v3ShadowTarget(anchor, threat, pressurePoint) {
          const q = threat.q;
          return {
            x: clamp(Math.min(anchor.x + anchor.span * 0.18, q.x - Math.max(1.15, anchor.span * 0.13)), 4, 68),
            y: clamp(anchor.y * 0.62 + q.y * 0.38 + (pressurePoint ? (q.y - pressurePoint.y) * 0.08 : 0), 4, 64)
          };
        }
        function goalSideWideTarget(anchor, threat, side, centralWeight = 0.42) {
          const x = clamp(Math.min(anchor.x + anchor.span * 0.18, threat.q.x - Math.max(1.15, anchor.span * 0.14)), 4, 68);
          const nearPostY = side > 0 ? 52 : 16;
          const routeAtDepth = threat.q.y + (nearPostY - threat.q.y) * clamp((threat.q.x - x) / Math.max(1, threat.q.x), 0, 1);
          const blendedY = anchor.y * centralWeight + threat.q.y * (1 - centralWeight) + side * 0.28;
          const corridorY = side > 0 ? Math.max(nearPostY, Math.min(blendedY, routeAtDepth + 0.55)) : Math.min(nearPostY, Math.max(blendedY, routeAtDepth - 0.55));
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
          return s.players.some((p) => {
            if (p.team !== team || p.id === fb.id || !["LB", "LCB", "RCB", "RB", "DM", "LCM", "RCM"].includes(p.role)) return false;
            const prior = priorContracts.get(p.id);
            const r = prior?.responsibility || p.responsibility || {};
            if (!(r.markTargetId === threatId || r.watchTargetId === threatId)) return false;
            const a = anchors.get(p.id), pq = local(s, team, p.x, p.y), target = local(s, team, prior?.target?.x ?? p.target.x, prior?.target?.y ?? p.target.y);
            const laneDistance = Math.hypot(target.x - Math.min(tq.x - 0.8, target.x), target.y - tq.y);
            const localEnough = Math.hypot(pq.x - tq.x, pq.y - tq.y) <= a.span * 1.45 && laneDistance <= a.span * 1.1;
            const otherId = r.watchTargetId ?? r.markTargetId;
            const other = Number.isInteger(otherId) && otherId !== threatId ? s.players[otherId] : null;
            const otherMoreDangerous = other && other.team !== team && local(s, team, other.x, other.y).x < tq.x - 2;
            return localEnough && !otherMoreDangerous;
          });
        }
        function applyV3Defence(s, team, carrier, anchors, incoming = false, priorFinal = null) {
          const ours = s.players.filter((p) => p.team === team && p.role !== "GK"), backs = ours.filter((p) => ["LB", "LCB", "RCB", "RB"].includes(p.role));
          const cbs = backs.filter((p) => p.role === "LCB" || p.role === "RCB"), dm = ours.find((p) => p.role === "DM");
          const cq = local(s, team, carrier.x, carrier.y), threats = s.players.filter((p) => p.team !== team && p.role !== "GK").map((p) => ({ p, q: local(s, team, p.x, p.y) }));
          const primaryThreat = { p: carrier, q: cq };
          const central = threats.filter((t) => t.p !== carrier && Math.abs(t.q.y - 34) < 10).sort((a, b) => a.q.x - b.q.x || a.p.id - b.p.id)[0] || null;
          const priorContracts = new Map(ours.map((p) => {
            const prior = priorFinal?.get(p.id);
            return [p.id, {
              responsibility: copy(prior?.responsibility || p.responsibility),
              target: { ...prior?.target || p.target },
              duty: prior?.duty || p.duty
            }];
          }));
          const coverCandidates = [...cbs, dm].filter(Boolean).sort((a, b) => Math.abs(local(s, team, a.x, a.y).y - 34) - Math.abs(local(s, team, b.x, b.y).y - 34) || a.id - b.id);
          const hasCentralCover = coverCandidates.length > 1;
          const danger = v3Danger(s, team, carrier);
          const ballSide = cq.y < 34 ? -1 : 1;
          const retainedWide = /* @__PURE__ */ new Map();
          for (const fb of ours.filter((p) => p.role === "LB" || p.role === "RB")) {
            const side = fb.role === "LB" ? -1 : 1, a = anchors.get(fb.id), priorState = priorContracts.get(fb.id), priorId = priorState?.responsibility?.watchTargetId ?? priorState?.responsibility?.markTargetId;
            const prior = Number.isInteger(priorId) ? s.players[priorId] : null;
            const localPrior = prior && prior.team !== team && prior !== carrier && dangerousWideThreat(s, team, prior, side) && Math.abs(local(s, team, prior.x, prior.y).y - a.y) <= a.span * 1.5;
            if (localPrior && !eligibleThreatAcquirer(s, team, fb, prior.id, anchors, priorContracts)) retainedWide.set(fb.id, { p: prior, q: local(s, team, prior.x, prior.y) });
          }
          const plans = ours.filter((p) => !retainedWide.has(p.id)).map((p) => ({ p, plan: v3PressurePlan(s, team, p, carrier, anchors.get(p.id), hasCentralCover, incoming) })).filter((x) => x.plan).sort((a, b) => a.plan.score - b.plan.score || a.p.id - b.p.id);
          const primary = plans[0] || null;
          if (primary) publishResponsibility(s, team, primary.p, "PRESS", primary.plan.target, primary.plan.phase, { subjectId: carrier.id, region: anchors.get(primary.p.id), pressPhase: primary.plan.phase, challengeIntent: primary.plan.challengeIntent, reason: incoming ? "INCOMING_PASS_ARRIVAL" : "CURRENT_CARRIER_THREAT", pressureOwner: primary.p.id, threatLevel: danger, markShadow: false, releaseReason: "COVER_OR_JURISDICTION_CHANGED", writer: "V3_PRIMARY_PROPOSAL", acquisitionBasis: "CURRENT_CARRIER_LANE" });
          const secondaryAssignments = /* @__PURE__ */ new Map();
          for (const fb of ours.filter((p) => retainedWide.has(p.id))) {
            const side = fb.role === "LB" ? -1 : 1, held = retainedWide.get(fb.id), a = anchors.get(fb.id);
            const secondary = threats.filter((t) => t.p !== carrier && t.p !== held.p && (side < 0 ? t.q.y < 34 : t.q.y >= 34)).filter((t) => Math.abs(t.q.y - held.q.y) < a.span * 1.35 && t.q.x <= a.x + a.span * 1.45).sort((x, y) => Math.hypot(x.q.x - a.x, x.q.y - a.y) - Math.hypot(y.q.x - a.x, y.q.y - a.y) || x.p.id - y.p.id)[0];
            if (!secondary) continue;
            const candidates = ours.filter((p) => p !== primary?.p && (p.role === "DM" || (side > 0 ? p.role === "RCM" : p.role === "LCM"))).filter((p) => !secondaryAssignments.has(p.id)).sort((x, y) => distance(x, secondary.p) - distance(y, secondary.p) || x.id - y.id);
            if (candidates[0]) secondaryAssignments.set(candidates[0].id, { threat: secondary, side, fbId: fb.id });
          }
          for (const p of ours) {
            if (p === primary?.p) continue;
            const a = anchors.get(p.id), pq = local(s, team, p.x, p.y), side = p.role === "LB" ? -1 : p.role === "RB" ? 1 : 0;
            const localThreat = retainedWide.get(p.id) || (incoming && side !== 0 ? [primaryThreat, ...threats.filter((t) => t.p !== carrier)] : threats.filter((t) => t.p !== carrier)).filter((t) => side === 0 ? Math.abs(t.q.y - a.y) < a.span * 0.9 : side < 0 ? t.q.y < 34 : t.q.y >= 34).sort((x, y) => Math.hypot(x.q.x - a.x, x.q.y - a.y) - Math.hypot(y.q.x - a.x, y.q.y - a.y) || x.p.id - y.p.id)[0] || null;
            const wasDirect = /PRIMARY_CONTAIN|CLOSE_DOWN|TIGHT_MARK|CHALLENGE|LOOSE_MARK_SCREEN/.test(priorContracts.get(p.id)?.responsibility?.kind || "");
            const secondary = secondaryAssignments.get(p.id);
            if (secondary) {
              const shadow = goalSideWideTarget(a, secondary.threat, secondary.side, 0.58);
              publishResponsibility(s, team, p, "MARK", shadow, "SECONDARY_WIDE_COMPENSATION", {
                subjectId: secondary.threat.p.id,
                region: a,
                reason: "FB_RETAINS_DANGEROUS_WINGER_MIDFIELD_ABSORB_SECOND_RUNNER",
                pressureOwner: primary?.p.id ?? null,
                markShadow: true,
                markTargetId: secondary.threat.p.id,
                watchTargetId: secondary.threat.p.id,
                releaseReason: "SECONDARY_THREAT_EXIT"
              });
            } else if ((p.role === "LB" || p.role === "RB") && localThreat) {
              const shadow = goalSideWideTarget(a, localThreat, side, side !== ballSide ? 0.52 : 0.42);
              const kind = side !== ballSide ? "WIDE_WATCH_COVER" : "LOOSE_MARK_SCREEN";
              publishResponsibility(s, team, p, "MARK", shadow, kind, { subjectId: localThreat.p.id, region: a, reason: side !== ballSide ? "FAR_SIDE_WATCH_AND_SWITCH_LANE" : incoming ? "PASS_TARGET_OR_NEARBY_RUNNER" : "LOCAL_RUNNER_AND_LANE", pressureOwner: primary?.p.id ?? null, threatLevel: danger, markShadow: true, watchTargetId: localThreat.p.id, releaseReason: "THREAT_LEFT_ZONE" });
            } else if (localThreat && Math.abs(localThreat.q.y - a.y) <= a.span * 1.22 && localThreat.q.x <= a.x + a.span * 1.18) {
              const shadow = v3ShadowTarget(a, localThreat, primaryThreat.q);
              publishResponsibility(s, team, p, "MARK", shadow, "LOOSE_MARK_SCREEN", { subjectId: localThreat.p.id, region: a, reason: incoming ? "PASS_TARGET_OR_NEARBY_RUNNER" : "LOCAL_RUNNER_AND_LANE", pressureOwner: primary?.p.id ?? null, threatLevel: danger, markShadow: true, releaseReason: "THREAT_LEFT_ZONE" });
            } else if ((p.role === "LCB" || p.role === "RCB" || p.role === "DM") && (central || Math.abs(cq.y - 34) < 13)) {
              const screenY = central ? central.q.y * 0.3 + 34 * 0.7 : cq.y * 0.24 + 34 * 0.76;
              publishResponsibility(s, team, p, "COVER", { x: clamp(Math.min(a.x, cq.x - 2.1), 4, 68), y: clamp(a.y * 0.68 + screenY * 0.32, 8, 60) }, "SCREEN_LANE", { subjectId: central?.p.id ?? carrier.id, region: a, reason: "CENTRAL_PASS_AND_GOAL_LANE", pressureOwner: primary?.p.id ?? null, threatLevel: danger, markShadow: false, releaseReason: "LANE_REBALANCE" });
            } else if (wasDirect) {
              publishResponsibility(s, team, p, "RECOVERY", a, "RECOVER_HANDOFF", { region: a, reason: "PRIMARY_RELEASED_OR_THREAT_EXIT", pressureOwner: primary?.p.id ?? null, threatLevel: danger, releaseReason: "RETURN_TO_ROLE_SPACE" });
            } else {
              publishResponsibility(s, team, p, "COVER", a, "ZONE_HOLD", { region: a, reason: "ROLE_ZONE_AND_TEAM_SPACING", pressureOwner: primary?.p.id ?? null, threatLevel: danger, releaseReason: "CURRENT_ZONE_VALID" });
            }
            const proposed = latestProposal(s._assignmentPlanning, p.id);
            if (proposed && Math.hypot(proposed.target.x - carrier.x, proposed.target.y - carrier.y) < 0.08) {
              publishResponsibility(
                s,
                team,
                p,
                proposed.duty,
                { x: pq.x, y: a.y },
                proposed.kind,
                { ...proposed.extra, writer: "V3_CARRIER_TARGET_SEPARATION" }
              );
            }
          }
          for (const p of ours) {
            const prior = priorContracts.get(p.id), before = prior?.responsibility, after = latestProposal(s._assignmentPlanning, p.id);
            const boundaryKinds = /* @__PURE__ */ new Set(["LOOSE_MARK_SCREEN", "SCREEN_LANE"]);
            if (!before?.duty || !after || before.subjectId !== after.extra?.subjectId || before.kind === after.kind || !boundaryKinds.has(before.kind) || !boundaryKinds.has(after.kind) || distance(prior.target, after.target) >= 0.65) continue;
            publishResponsibility(
              s,
              team,
              p,
              before.duty,
              local(s, team, prior.target.x, prior.target.y),
              before.kind,
              {
                subjectId: before.subjectId,
                region: before.region || anchors.get(p.id),
                reason: "SAME_SUBJECT_BOUNDARY_HYSTERESIS",
                releaseReason: "MEANINGFUL_LANE_OR_SUBJECT_CHANGE_REQUIRED",
                markShadow: before.markTargetId !== null,
                pressureTargetId: before.pressureTargetId,
                markTargetId: before.markTargetId,
                watchTargetId: before.watchTargetId,
                pressPhase: before.pressPhase,
                challengeIntent: before.challengeIntent,
                protectedBy: before.protectedBy,
                writer: "C1B_BOUNDARY_HYSTERESIS",
                acquisitionBasis: "PRIOR_CURRENT_RELATION_STILL_GEOMETRICALLY_NEAR"
              }
            );
          }
        }
        function applyElasticDefence(s, team, owner, presser, anchors) {
          const defenders = s.players.filter((p) => p.team === team && ["LB", "LCB", "RCB", "RB"].includes(p.role));
          const cbs = defenders.filter((p) => p.role === "LCB" || p.role === "RCB");
          const dm = s.players.find((p) => p.team === team && p.role === "DM");
          const threats = s.players.filter((p) => p.team !== team && p.role !== "GK").map((p) => ({ p, q: local(s, team, p.x, p.y) }));
          const central = threats.filter((t) => t.p !== owner && Math.abs(t.q.y - 34) < 6).sort((a, b) => a.q.x + Math.abs(a.q.y - 34) * 0.5 - (b.q.x + Math.abs(b.q.y - 34) * 0.5))[0] || null;
          const wide = (side) => threats.filter((t) => side < 0 ? t.q.y < 34 : t.q.y >= 34).filter((t) => t.p !== owner).sort((a, b) => a.q.x + Math.abs(a.q.y - HOME[side < 0 ? 1 : 4][1]) * 0.35 - (b.q.x + Math.abs(b.q.y - HOME[side < 0 ? 1 : 4][1]) * 0.35))[0] || null;
          const protectCentral = (excluded = null) => {
            if (!central) return null;
            const candidates = [...cbs.filter((p) => p !== excluded && p !== presser), dm].filter(Boolean);
            return candidates.sort((a, b) => distance(a, central.p) - distance(b, central.p) || a.id - b.id)[0] || null;
          };
          for (const fb of defenders.filter((p) => p.role === "LB" || p.role === "RB")) {
            const side = fb.role === "LB" ? -1 : 1, winger = wide(side), farSide = owner && (local(s, team, owner.x, owner.y).y < 34 ? 1 : -1) === side;
            const anchor = anchors.get(fb.id);
            if (fb === presser) {
              continue;
            }
            const withinJurisdiction = winger && Math.abs(winger.q.y - anchor.y) <= anchor.span * 1.25 && winger.q.x <= anchor.x + anchor.span * 1.15;
            if (withinJurisdiction && !farSide) publishResponsibility(s, team, fb, "MARK", shadowTarget(anchor, winger), "WIDE_SHADOW", { subjectId: winger.p.id, region: anchor });
            else if (farSide) publishResponsibility(s, team, fb, "COVER", { x: clamp(anchor.x - 1.5, 4, 65), y: clamp(34 + (anchor.y - 34) * 0.52, 10, 58) }, "FAR_SIDE_CENTRAL_PROTECTION", { region: anchor, releaseReason: "FAR_SIDE_RESERVATION" });
            else publishResponsibility(s, team, fb, "RECOVERY", anchor, "RETURN_TO_REGION", { region: anchor, releaseReason: winger ? "THREAT_LEFT_JURISDICTION" : "NO_LOCAL_WIDE_THREAT" });
          }
          const centralGuard = protectCentral();
          if (centralGuard && centralGuard !== presser) publishResponsibility(s, team, centralGuard, "MARK", shadowTarget(anchors.get(centralGuard.id), central), "CENTRAL_LANE_SHADOW", { subjectId: central.p.id, region: anchors.get(centralGuard.id) });
          for (const cb of cbs) if (cb !== presser && cb !== centralGuard) {
            const partner = centralGuard || dm;
            const a = anchors.get(cb.id);
            publishResponsibility(s, team, cb, "COVER", { x: clamp(a.x - 0.8, 4, 65), y: clamp(a.y * 0.72 + (partner ? local(s, team, partner.x, partner.y).y : 34) * 0.28, 8, 60) }, "ADJACENT_COVER", { region: a, protectedBy: centralGuard?.id ?? null });
          }
          if (dm && dm !== presser && dm !== centralGuard) publishResponsibility(s, team, dm, "COVER", anchors.get(dm.id), "CENTRAL_LANE_COVER", { region: anchors.get(dm.id) });
        }
        function vacancyLedger(s) {
          if (s._assignmentPlanning) return s._assignmentPlanning.vacancies;
          if (!Array.isArray(s.responsibilityVacancies)) s.responsibilityVacancies = [];
          return s.responsibilityVacancies;
        }
        function vacancyKey(team, fb) {
          return `${team}:${fb.id}:WIDE_CHANNEL`;
        }
        function prepareVacancyTick(s) {
          for (const v of vacancyLedger(s)) {
            v.confirmedAt = null;
            if (v.state === "ACTIVE" && s.ball.owner !== null && s.players[s.ball.owner].team !== v.team) {
              v.state = "RELEASING";
              v.releaseAt = s.time;
              v.releaseReason = "POSSESSION_LOST";
            }
          }
        }
        function confirmVacancy(s, team, fb, winger, reason) {
          const ledger = vacancyLedger(s), key = vacancyKey(team, fb);
          let v = ledger.find((x) => x.key === key);
          if (!v) {
            v = {
              key,
              team,
              homeOwnerId: fb.id,
              homeRole: fb.role,
              channel: fb.role === "RB" ? "RIGHT_CHANNEL" : "LEFT_CHANNEL",
              state: "ACTIVE",
              reason,
              subjectId: winger?.id ?? null,
              openedAt: s.time,
              releaseAt: null,
              contributors: []
            };
            ledger.push(v);
          }
          v.state = "ACTIVE";
          v.reason = reason;
          v.subjectId = winger?.id ?? null;
          v.confirmedAt = s.time;
          v.releaseAt = null;
          v.releaseReason = null;
          return v;
        }
        function finishVacancyTick(s) {
          const filtered = vacancyLedger(s).filter((v) => {
            if (v.state === "ACTIVE" && v.confirmedAt !== s.time) {
              v.state = "RELEASING";
              v.releaseAt = s.time;
              v.releaseReason = "ORIGINAL_FB_RETURN_OR_TRIGGER_END";
            }
            if (v.state === "RELEASING" && !Number.isFinite(v.releaseAt)) v.releaseAt = s.time;
            const fb = s.players[v.homeOwnerId], subject = Number.isInteger(v.subjectId) ? s.players[v.subjectId] : null;
            const side = fb?.role === "RB" ? 1 : -1;
            const stillDangerous = !!(fb && subject && dangerousWideThreat(s, v.team, subject, side));
            return v.state !== "RELEASING" || !stillDangerous || !v.returnOwnershipEstablished || s.time - v.releaseAt < 0.8;
          });
          if (s._assignmentPlanning) s._assignmentPlanning.vacancies = filtered;
          else s.responsibilityVacancies = filtered;
        }
        function applyVacancyCompensation(s, team, anchors) {
          const ours = s.players.filter((p) => p.team === team), ledger = vacancyLedger(s).filter((v) => v.team === team);
          for (const v of ledger) {
            const fb = s.players[v.homeOwnerId], winger = v.subjectId === null ? null : s.players[v.subjectId];
            const side = fb?.role === "RB" ? 1 : -1;
            const cb = ours.find((p) => p.role === (side > 0 ? "RCB" : "LCB"));
            const dm = ours.find((p) => p.role === "DM");
            const cm = ours.find((p) => p.role === (side > 0 ? "RCM" : "LCM"));
            const threat = winger ? local(s, team, winger.x, winger.y) : { x: 56, y: side > 0 ? 56 : 12 };
            const contributors = [cb, dm, cm].filter(Boolean);
            const centralThreat = s.players.filter((p) => p.team !== team && p.role !== "GK").filter((p) => p !== winger && Math.abs(local(s, team, p.x, p.y).y - 34) < 8).sort((a, b) => local(s, team, a.x, a.y).x - local(s, team, b.x, b.y).x || a.id - b.id)[0] || null;
            const fbAnchor = fb && anchors.get(fb.id);
            let centralGuard = null, returnAcquired = false;
            if (v.state === "RELEASING" && fb && winger && fbAnchor) {
              publishResponsibility(
                s,
                team,
                fb,
                "MARK",
                goalSideWideTarget(fbAnchor, { q: threat }, side, 0.42),
                "HANDOFF_RETURN_WIDE_MARK",
                {
                  subjectId: winger.id,
                  region: fbAnchor,
                  reason: "FB_RETURN_ACQUIRES_WIDE_THREAT",
                  markShadow: true,
                  markTargetId: winger.id,
                  watchTargetId: winger.id,
                  handoff: { from: cb?.id ?? null, to: fb.id, subjectId: winger.id, reason: "RETURN_WIDE_HANDOFF" }
                }
              );
              const returnProposal = latestProposal(s._assignmentPlanning, fb.id, (proposal) => proposalOwnsThreat(proposal, winger.id));
              const body = local(s, team, fb.x, fb.y), target = returnProposal && local(s, team, returnProposal.target.x, returnProposal.target.y);
              returnAcquired = !!(returnProposal && Math.hypot(body.x - threat.x, body.y - threat.y) <= fbAnchor.span * 1.45 && target.x <= threat.x - 0.35 && Math.abs(target.y - threat.y) <= fbAnchor.span * 1.2);
              if (centralThreat) {
                centralGuard = [dm, ...s.players.filter((p) => p.team === team && (p.role === "LCB" || p.role === "RCB") && p !== cb)].filter((p) => p && p.duty !== "PRESS").sort((a, b) => distance(a, centralThreat) - distance(b, centralThreat) || a.id - b.id)[0] || null;
                if (centralGuard) {
                  const guardAnchor = anchors.get(centralGuard.id);
                  publishResponsibility(
                    s,
                    team,
                    centralGuard,
                    "MARK",
                    v3ShadowTarget(guardAnchor, { q: local(s, team, centralThreat.x, centralThreat.y) }, threat),
                    "HANDOFF_CENTRAL_GUARD",
                    {
                      subjectId: centralThreat.id,
                      region: guardAnchor,
                      reason: "FB_RETURN_PROTECT_CENTRAL_STRIKER",
                      markShadow: true,
                      markTargetId: centralThreat.id,
                      watchTargetId: centralThreat.id,
                      handoff: { from: cb?.id ?? null, to: centralGuard.id, subjectId: centralThreat.id, reason: "CENTRAL_GUARD_BEFORE_WIDE_RELEASE" }
                    }
                  );
                }
              }
            }
            const releaseReady = v.state !== "RELEASING" || returnAcquired && (!centralThreat || !!centralGuard);
            v.returnOwnershipEstablished = returnAcquired;
            v.centralGuardId = centralGuard?.id ?? null;
            v.contributors = contributors.map((p, index) => ({
              playerId: p.id,
              role: p.role,
              share: index === 0 ? "WIDE_MARK_OWNER" : index === 1 ? "HALFSPACE_SCREEN" : "LANE_SHARE",
              watchTargetId: index === 0 ? winger?.id ?? null : null
            }));
            for (const p of contributors) {
              const a = anchors.get(p.id);
              if (!a) continue;
              const q = local(s, team, p.x, p.y), release = v.state === "RELEASING" && releaseReady;
              let target, kind, reason;
              if (p === centralGuard) continue;
              if (v.state === "RELEASING" && !releaseReady && p === cb) {
                target = goalSideWideTarget(a, { q: threat }, side, 0.52);
                kind = "HANDOFF_WIDE_RETAIN_UNTIL_ACQUIRED";
                reason = "ACQUIRE_BEFORE_RELEASE_WAIT";
              } else if (release) {
                const weight = p.role === "DM" ? 0.54 : p.role === "RCM" || p.role === "LCM" ? 0.63 : 0.43;
                target = { x: q.x * (1 - weight) + a.x * weight, y: q.y * (1 - weight) + a.y * weight };
                kind = "VACANCY_RELEASE";
                reason = v.releaseReason || "ORIGINAL_FB_RETURN";
              } else if (p === cb) {
                target = {
                  x: clamp(Math.min(threat.x - 2.8, a.x + 2.4), 4, 68),
                  y: clamp(a.y * 0.32 + threat.y * 0.68, side > 0 ? 43 : 7, side > 0 ? 61 : 25)
                };
                kind = "VACANCY_REMOTE_WATCH";
                reason = "VACATED_WIDE_CHANNEL_REMOTE_WATCH";
              } else if (p === dm) {
                target = { x: clamp(Math.min(threat.x - 5.2, a.x + 3.1), 6, 70), y: clamp(a.y * 0.56 + threat.y * 0.44, 10, 58) };
                kind = "VACANCY_HALFSPACE_SCREEN";
                reason = "VACATED_WIDE_CHANNEL_HALFSPACE_SCREEN";
              } else {
                target = { x: clamp(Math.min(threat.x - 7.4, a.x + 4.2), 9, 74), y: clamp(a.y * 0.73 + threat.y * 0.27, 10, 58) };
                kind = "VACANCY_LANE_SHARE";
                reason = "VACATED_WIDE_CHANNEL_LANE_SHARE";
              }
              const wideOwner = p === cb && !release;
              publishResponsibility(
                s,
                team,
                p,
                wideOwner ? "MARK" : release ? "RECOVERY" : "COVER",
                target,
                kind,
                {
                  subjectId: winger?.id ?? null,
                  region: a,
                  reason,
                  pressureOwner: null,
                  markShadow: wideOwner,
                  markTargetId: wideOwner ? winger?.id ?? null : null,
                  watchTargetId: wideOwner ? winger?.id ?? null : null,
                  releaseReason: release ? "GRADUAL_ROLE_REJOIN" : "VACANCY_HANDED_BACK",
                  handoff: { from: fb?.id ?? null, to: p.id, subjectId: winger?.id ?? null, reason: v.channel }
                }
              );
            }
          }
        }
        function applyFullbackAttackResponsibility(s, team, owner, anchors) {
          const b = local(s, team, s.ball.x, s.ball.y);
          const defenders = s.players.filter((p) => p.team === team && ["LB", "LCB", "RCB", "RB"].includes(p.role));
          const cbs = defenders.filter((p) => p.role === "LCB" || p.role === "RCB");
          const dm = s.players.find((p) => p.team === team && p.role === "DM");
          const threats = s.players.filter((p) => p.team !== team && p.role !== "GK").map((p) => ({ p, q: local(s, team, p.x, p.y) }));
          const central = threats.filter((t) => Math.abs(t.q.y - 34) < 6).sort((a, b2) => a.q.x - b2.q.x)[0]?.p || null;
          for (const fb of defenders.filter((p) => p.role === "LB" || p.role === "RB")) {
            if (fb.id === owner.id) continue;
            const side = fb.role === "LB" ? -1 : 1;
            const winger = threats.filter((t) => side < 0 ? t.q.y < 34 : t.q.y >= 34).sort((a, b2) => a.q.x - b2.q.x)[0]?.p;
            if (!winger) continue;
            const anchor = anchors.get(fb.id);
            const fq = local(s, team, fb.x, fb.y), oq = local(s, team, owner.x, owner.y);
            const possessionOurs = owner.team === team && s.possession === team;
            const wideProgression = (side < 0 ? oq.y < 29 : oq.y > 39) && oq.x > 43;
            const receivingWidePass = owner.id === fb.id || wideProgression && distance(fb, owner) < 16;
            const crossingContinuation = owner.id === fb.id && oq.x > 68;
            const validExcursionReason = receivingWidePass || crossingContinuation || wideProgression && distance(fb, owner) < 16;
            const wingerQ = local(s, team, winger.x, winger.y);
            const presentThreat = wingerQ.x < 60 || distance(owner, winger) < 28;
            const cb = cbs.slice().sort((a, b2) => distance(a, winger) - distance(b2, winger) || a.id - b2.id)[0];
            const centralBackup = central && [...cbs.filter((p) => p !== cb), dm].filter(Boolean).sort((a, b2) => distance(a, central) - distance(b2, central) || a.id - b2.id)[0];
            const cbAnchor = cb && anchors.get(cb.id), backupAnchor = centralBackup && anchors.get(centralBackup.id);
            const attackTrigger = possessionOurs && validExcursionReason && presentThreat;
            const handoff = !!(attackTrigger && cb && centralBackup && cb !== centralBackup && cbAnchor && backupAnchor && distance(cb, winger) <= cbAnchor.span * 1.12 && Math.abs(local(s, team, centralBackup.x, centralBackup.y).y - 34) <= backupAnchor.span * 1.22);
            const coverPresent = !!(handoff || cb && dm && cbAnchor && distance(cb, winger) <= cbAnchor.span * 1.42);
            const envelope = !handoff && attackTrigger && coverPresent && recoverableWideEnvelope(s, team, fb, winger, owner);
            if (handoff) {
              const transfer = { from: fb.id, to: cb.id, subjectId: winger.id, reason: "WIDE_ATTACK_COVER_ACCEPTED" };
              publishResponsibility(s, team, cb, "MARK", shadowTarget(cbAnchor, { q: local(s, team, winger.x, winger.y) }), "CB_HANDOFF_WIDE", { subjectId: winger.id, region: cbAnchor, handoff: transfer, protectedBy: centralBackup.id });
              if (central) publishResponsibility(s, team, centralBackup, "MARK", shadowTarget(backupAnchor, { q: local(s, team, central.x, central.y) }), "CENTRAL_HANDOFF_BACKUP", { subjectId: central.id, region: backupAnchor, handoff: { from: cb.id, to: centralBackup.id, subjectId: central.id, reason: "CENTRAL_LANE_RETAINED" } });
            }
            if (attackTrigger && (handoff || envelope)) {
              const forward = clamp(Math.max(fq.x + 4, Math.min(oq.x + 3, 88)), 4, 94);
              const vacancy = confirmVacancy(s, team, fb, winger, handoff ? "ATTACK_SUPPORT_WITH_CB_DM_HANDOFF" : "ATTACK_SUPPORT_RECOVERABLE_ENVELOPE");
              publishResponsibility(
                s,
                team,
                fb,
                "RUN",
                { x: forward, y: clamp(oq.y * 0.76 + HOME[fb.slot][1] * 0.24, 3, 65) },
                "ATTACKING_WIDE_SUPPORT",
                {
                  region: anchor,
                  attackTrigger: true,
                  recoverableEnvelope: envelope,
                  handoff: { from: fb.id, to: cb?.id ?? null, subjectId: winger.id, reason: vacancy.channel }
                }
              );
            } else {
              publishResponsibility(
                s,
                team,
                fb,
                "MARK",
                shadowTarget(anchor, { q: local(s, team, winger.x, winger.y) }),
                attackTrigger ? "RECOVERABLE_ENVELOPE_BLOCK" : "WIDE_RESPONSIBILITY_RETAINED",
                { subjectId: winger.id, region: anchor, attackTrigger, recoverableEnvelope: envelope, releaseReason: "ATTACK_SUPPORT_NOT_SAFE" }
              );
            }
          }
        }
        function stabilizeMovementIntents(s) {
          for (const p of s.players) {
            if (p.role === "GK" || s.phase !== "play" || p.duty === "RECEIVE" || p.duty === "CARRY") {
              p.movementIntent = {
                target: { ...p.target },
                duty: p.duty,
                markId: p.markId,
                pressId: p.pressId,
                responsibilityVersion: p.responsibility?.version ?? 0,
                responsibility: p.responsibility ? copy(p.responsibility) : null,
                defensiveContext: p.defensiveContext ? copy(p.defensiveContext) : null,
                reviewAt: s.time,
                turnNow: false
              };
              continue;
            }
            const raw = {
              target: { ...p.target },
              duty: p.duty,
              markId: p.markId,
              pressId: p.pressId,
              responsibilityVersion: p.responsibility?.version ?? 0,
              responsibility: p.responsibility ? copy(p.responsibility) : null,
              defensiveContext: p.defensiveContext ? copy(p.defensiveContext) : null
            };
            const old = p.movementIntent;
            const b = local(s, p.team, s.ball.x, s.ball.y);
            const ballSide = b.y < 31 ? -1 : b.y > 37 ? 1 : 0;
            const defensive = s.ball.owner !== null && s.players[s.ball.owner].team !== p.team;
            const ballDistance = distance(p, s.ball);
            const lineRole = p.slot <= 4 ? "BACK_LINE" : p.slot <= 7 ? "MID_BLOCK" : "FRONT";
            const marked = raw.markId === null ? null : s.players[raw.markId];
            const cadence = raw.duty === "MARK" ? lineRole === "BACK_LINE" ? 0.19 : lineRole === "MID_BLOCK" ? 0.15 : 0.12 : raw.duty === "RECOVERY" ? 0.1 : lineRole === "BACK_LINE" ? 0.2 : lineRole === "MID_BLOCK" ? 0.17 : 0.14;
            const relationshipDistance = marked ? clamp(distance(p, marked) / 90, 0, 0.1) : 0;
            const reviewWindow = cadence + relationshipDistance + clamp(ballDistance / 180, 0, 0.16) + (ballSide === 0 ? 0.03 : 0);
            const delta = old ? distance(raw.target, old.target) : Infinity;
            const meaningfulDelta = raw.duty === "MARK" ? 0.32 : lineRole === "BACK_LINE" ? 0.48 : 0.4;
            const relationshipKey = `${raw.duty}|${raw.responsibility?.subjectId ?? ""}|${raw.markId ?? ""}|${raw.pressId ?? ""}|${raw.responsibility?.watchTargetId ?? ""}|${raw.responsibility?.pressureTargetId ?? ""}|${raw.responsibility?.pressPhase ?? ""}`;
            const dutyChanged = !old || relationshipKey !== old.relationshipKey;
            const replacement = old && raw.markId !== old.markId ? s.players[raw.markId] : null;
            const urgentMarkChange = !!replacement && distance(p, replacement) < 5 && distance(replacement, s.ball) < 4;
            const relationshipChanged = dutyChanged || urgentMarkChange;
            const sideChanged = old && old.ballSide !== ballSide && (defensive || raw.duty === "RECOVERY") && ballDistance < 18;
            const urgent = defensive && ballDistance < 10 && (raw.duty === "PRESS" || raw.duty === "RECOVERY");
            const majorRelocation = delta >= meaningfulDelta * (raw.duty === "MARK" ? 6 : 3);
            const materialAdjustment = delta >= meaningfulDelta;
            const accept = !old || relationshipChanged || majorRelocation || sideChanged || urgent || s.time >= old.reviewAt && materialAdjustment;
            if (accept) {
              p.movementIntent = {
                ...raw,
                relationshipKey,
                ballSide,
                reviewAt: s.time + reviewWindow,
                turnNow: !!old && (relationshipChanged || majorRelocation || sideChanged)
              };
            } else {
              p.movementIntent = { ...old, turnNow: false };
            }
          }
        }
        function defensiveAnchors(s, team) {
          const out = /* @__PURE__ */ new Map();
          for (const p of s.players.filter((p2) => p2.team === team && p2.role !== "GK")) {
            out.set(p.id, v3DefensiveAnchor(s, team, p));
          }
          return out;
        }
        function allocateLooseBall(s, team, ours, anchors) {
          const targetId = s.ball.flight?.type === "pass" ? s.ball.flight.targetId : null;
          const predicted = { x: s.ball.x + s.ball.vx * 0.22, y: s.ball.y + s.ball.vy * 0.22 };
          const candidates = ours.map((p) => {
            const a = anchors.get(p.id), q = local(s, team, p.x, p.y), b = local(s, team, predicted.x, predicted.y);
            const travel = Math.hypot(q.x - b.x, q.y - b.y), departure = Math.hypot(q.x - a.x, q.y - a.y);
            const corridor = a.lane === "CENTRAL" || a.lane === "LEFT" && b.y < 38 || a.lane === "RIGHT" && b.y > 30 || a.lane === "MID" && Math.abs(b.y - a.y) < a.span;
            return { p, a, travel, departure, corridor, score: travel + departure * 0.35 + (corridor ? 0 : a.span) };
          }).filter((x) => x.corridor && x.travel <= x.a.span * 1.75).sort((a, b) => a.score - b.score || a.p.id - b.p.id);
          const intended = targetId === null ? null : ours.find((p) => p.id === targetId);
          const selected2 = intended ? [{ p: intended, a: anchors.get(intended.id) }] : candidates.slice(0, 1);
          const helper = candidates.find((x) => !selected2.some((y) => y.p.id === x.p.id) && x.a.lane !== selected2[0]?.a.lane && x.travel < x.a.span * 1.05);
          if (helper) selected2.push(helper);
          for (const item of selected2) publishResponsibility(s, team, item.p, "RECEIVE", local(s, team, predicted.x, predicted.y), "LOOSE_BALL_CLAIM", { subjectId: targetId, region: item.a, releaseReason: "CLAIM_UNTIL_CONTROL_OR_CORRIDOR_EXIT" });
        }
        function setFacing(p, dx, dy, source) {
          if (Math.hypot(dx, dy) > 0.04) p.facingRadians = Math.atan2(dy, dx);
          p.facingSource = source;
          const desired = p.facingRadians;
          const explicit = /* @__PURE__ */ new Set(["PASS", "SHOT", "CARRY", "RECEIVE", "POSSESSION_TRANSITION"]);
          const prior = p.renderFacingRadians;
          if (!Number.isFinite(prior) || explicit.has(source) || p.renderFacingSource !== source) {
            p.renderFacingRadians = desired;
          } else if (source === "CONTAIN_MARK_HALF_OPEN" || source === "RECOVERY") {
            let delta = desired - prior;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            if (Math.abs(delta) > 0.055) p.renderFacingRadians = prior + Math.sign(delta) * Math.min(Math.abs(delta), 0.22);
          } else {
            p.renderFacingRadians = desired;
          }
          p.renderFacingSource = source;
        }
        function updateMatchFacing(s) {
          for (const p of s.players) {
            if (p.role === "GK") {
              const defending2 = s.ball.owner === null || s.players[s.ball.owner]?.team !== p.team;
              setFacing(p, s.ball.x - p.x, s.ball.y - p.y, defending2 ? s.ball.flight?.type === "shot" ? "SHOT" : "BALL" : "BUILD_OUT");
              continue;
            }
            const action = p.facingIntent;
            if (action && action.until > s.time) {
              setFacing(p, action.dx, action.dy, action.source);
              continue;
            }
            if (action && action.until <= s.time) p.facingIntent = null;
            if (s.ball.owner === p.id || p.duty === "CARRY") {
              setFacing(p, p.target.x - p.x, p.target.y - p.y, "CARRY");
              continue;
            }
            if (p.duty === "RECEIVE") {
              const arrival = { x: s.ball.vx, y: s.ball.vy }, next = { x: p.target.x - p.x, y: p.target.y - p.y };
              setFacing(p, arrival.x * 0.66 + next.x * 0.34, arrival.y * 0.66 + next.y * 0.34, "RECEIVE");
              continue;
            }
            const r = p.responsibility || {}, watchId = r.watchTargetId ?? r.markTargetId ?? null;
            const watch = Number.isInteger(watchId) ? s.players[watchId] : null;
            const defending = s.ball.owner === null || s.players[s.ball.owner]?.team !== p.team;
            if (defending && (p.duty === "PRESS" || p.duty === "MARK" || watch)) {
              const ballWeight = p.duty === "PRESS" ? 0.76 : 0.58, threatDx = watch ? watch.x - p.x : 0, threatDy = watch ? watch.y - p.y : 0;
              setFacing(
                p,
                (s.ball.x - p.x) * ballWeight + threatDx * (1 - ballWeight),
                (s.ball.y - p.y) * ballWeight + threatDy * (1 - ballWeight),
                "CONTAIN_MARK_HALF_OPEN"
              );
              continue;
            }
            if (defending && p.duty === "RECOVERY") {
              const threatDx = watch ? watch.x - p.x : 0, threatDy = watch ? watch.y - p.y : 0;
              setFacing(p, (p.target.x - p.x) * 0.64 + threatDx * 0.36, (p.target.y - p.y) * 0.64 + threatDy * 0.36, "RECOVERY");
              continue;
            }
            setFacing(p, p.target.x - p.x, p.target.y - p.y, "MOVEMENT");
          }
        }
        function setTargets(s) {
          const owner = s.ball.owner === null ? null : s.players[s.ball.owner];
          const attackTeam = owner ? owner.team : s.possession ?? s.lastPossession;
          const play = s.phase === "play";
          const planning = beginAssignmentPlanning(s);
          if (play) prepareVacancyTick(s);
          for (const p of s.players) {
            const target = shapeTarget(s, p, p.team === attackTeam);
            const duty = p.role === "GK" ? "GK" : p.team === attackTeam ? "SUPPORT" : "COVER";
            publishResponsibility(
              s,
              p.team,
              p,
              duty,
              local(s, p.team, target.x, target.y),
              p.role === "GK" ? "CURRENT_GK" : `DEFAULT_${duty}`,
              { subjectId: null, reason: "CURRENT_SHAPE_DEFAULT", releaseReason: "CURRENT_DEFAULT", writer: "SHAPE_DEFAULT_PROPOSAL" }
            );
          }
          if (!play) {
            if (!s.restart) {
              delete s._assignmentPlanning;
              return;
            }
            const r = s.restart;
            for (const p of s.players) {
              let target = latestProposal(planning, p.id).target;
              if (r.type === "kickoff") {
                const h = HOME[p.slot];
                target = world(s, p.team, p.slot === 0 ? 5 : h[0] * 0.63, h[1]);
                if (p.team === r.team && p.role === "CF") target = { x: 52.5 - direction(s, p.team) * 0.5, y: 34 };
                if (p.team === r.team && p.role === "RCM") target = world(s, p.team, 47, 39);
              } else if (r.type === "corner") {
                if (p.team === r.team && p.slot >= 7) target = world(s, p.team, 94 + p.slot % 2 * 3, 27 + (p.slot - 7) * 4);
                if (p.team !== r.team && p.slot > 0 && p.slot <= 7) target = world(s, p.team, 6 + p.slot % 3 * 3, 22 + p.slot * 3);
              }
              if (p.id === r.takerId) target = { ...r.spot };
              if (p.team !== r.team && p.role !== "GK") {
                const d = distance(target, r.spot), radius = r.type === "throwIn" ? 2.5 : 9.15;
                if (d < radius) {
                  const dx = target.x - r.spot.x || -direction(s, r.team), dy = target.y - r.spot.y;
                  const norm = Math.hypot(dx, dy);
                  target = { x: clamp(r.spot.x + dx / norm * radius, 1, 104), y: clamp(r.spot.y + dy / norm * radius, 1, 67) };
                }
              }
              publishCurrentAction(s, p, "RESTART", target, "RESTART_SETUP");
            }
            finalAssignmentCommit(s, null);
            return;
          }
          for (let team = 0; team < 2; team++) {
            const ours = s.players.filter((p) => p.team === team && p.role !== "GK");
            const anchors = defensiveAnchors(s, team);
            if (owner && owner.team !== team) {
              applyV3Defence(s, team, owner, anchors, false, planning.priorFinal);
            } else if (owner && owner.team === team) {
              const o = local(s, team, owner.x, owner.y);
              for (const p of ours) {
                if (p.id === owner.id) {
                  const close = opponents(s, p).filter((q) => distance(q, p) < 5);
                  let avoidY = 0;
                  for (const q of close) avoidY += (p.y - q.y) / Math.max(1, distance(q, p)) * 2;
                  const goalY = o.x > 77 ? (34 - o.y) * 0.25 : 0;
                  const aim = world(s, team, clamp(o.x + 9, 1, 102), clamp(o.y + goalY, 3, 65));
                  const target = p.intent && p.intent.until > s.time ? { ...p.intent.aim } : { x: aim.x, y: clamp(aim.y + avoidY, 2, 66) };
                  if (p.intent && p.intent.until <= s.time) p.intent = null;
                  publishCurrentAction(
                    s,
                    p,
                    "CARRY",
                    target,
                    p.intent && p.intent.until > s.time ? "SELECTED_CARRY_OWNER" : "CURRENT_BALL_OWNER"
                  );
                } else if (p.slot >= 8) {
                  const shape = latestProposal(planning, p.id, (proposal) => proposal.kind === "DEFAULT_SUPPORT");
                  const target = local(s, team, shape.target.x, shape.target.y);
                  const defenders = s.players.filter((q) => q.team !== team).map((q) => local(s, team, q.x, q.y).x).sort((a, b) => b - a);
                  target.x = Math.min(target.x, Math.max(o.x, defenders[1] - 0.8));
                  if (o.x > 78) target.y = p.role === "CF" ? 34 : p.role === "LF" ? 22 : 46;
                  publishResponsibility(
                    s,
                    team,
                    p,
                    "RUN",
                    target,
                    "DEFAULT_RUN",
                    { subjectId: null, reason: "CURRENT_ATTACK_RUN", releaseReason: "CURRENT_DEFAULT", writer: "ATTACK_RUN_PROPOSAL" }
                  );
                }
              }
              applyFullbackAttackResponsibility(s, team, owner, anchors);
            } else if (s.ball.owner === null) {
              const receiver = s.ball.flight?.type === "pass" ? s.players[s.ball.flight.targetId] : null;
              if (receiver && receiver.team !== team) {
                applyV3Defence(s, team, receiver, anchors, true, planning.priorFinal);
              } else allocateLooseBall(s, team, ours, anchors);
            }
            const keeper = s.players[team * 11];
            const kb = local(s, team, s.ball.x, s.ball.y);
            if (kb.x < 18 && kb.y > 13 && kb.y < 55 && s.ball.owner === null) {
              const target = {
                x: clamp(s.ball.x + s.ball.vx * 0.08, team === (s.half === 1 ? 0 : 1) ? 1 : 87, team === (s.half === 1 ? 0 : 1) ? 18 : 104),
                y: clamp(s.ball.y + s.ball.vy * 0.1, 23, 45)
              };
              publishResponsibility(
                s,
                team,
                keeper,
                "GK",
                local(s, team, target.x, target.y),
                "CURRENT_GK_BALL",
                { subjectId: null, reason: "CURRENT_LOOSE_BALL_POSITION", releaseReason: "CURRENT_GK", writer: "GK_TARGET_PROPOSAL" }
              );
            }
          }
          for (let team = 0; team < 2; team++) applyVacancyCompensation(s, team, defensiveAnchors(s, team));
          finishVacancyTick(s);
          finalAssignmentCommit(s, owner);
          updateMatchFacing(s);
          stabilizeMovementIntents(s);
        }
        function integratePlayers(s) {
          const resetting = s.restart && s.restart.reset;
          const bodyClearance = 0.7;
          const desired = s.players.map((p) => {
            if (resetting) {
              p.motionDemand = null;
              return { x: p.target.x, y: p.target.y, vx: 0, vy: 0, reset: true };
            }
            const motorTarget = s.phase === "play" && p.movementIntent?.target ? p.movementIntent.target : p.target;
            let driveTarget = motorTarget;
            if (s.phase === "play" && p.role !== "GK" && p.duty !== "CARRY") {
              for (const q of s.players) {
                if (q.id === p.id || q.role === "GK" || distance(motorTarget, q) >= bodyClearance) continue;
                const sx = p.x - q.x, sy = p.y - q.y, separation = Math.hypot(sx, sy);
                if (separation >= bodyClearance && separation > 1e-9) {
                  driveTarget = { x: q.x + sx / separation * bodyClearance, y: q.y + sy / separation * bodyClearance };
                  break;
                }
              }
            }
            let dx = driveTarget.x - p.x, dy = driveTarget.y - p.y;
            const dist = Math.hypot(dx, dy);
            const max = p.attributes.pace * (p.duty === "CARRY" ? 0.73 : p.duty === "SUPPORT" || p.duty === "MARK" ? 0.78 : 1);
            let vx = dist > 0.1 ? dx / dist * Math.min(max, dist * 2.5) : 0;
            let vy = dist > 0.1 ? dy / dist * Math.min(max, dist * 2.5) : 0;
            let accelerationRate = 9;
            if (s.phase === "play" && p.role !== "GK" && p.duty !== "CARRY") {
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
              const dutyUrgency = p.duty === "PRESS" || p.duty === "RECEIVE" ? 0.85 : p.duty === "RECOVERY" ? 0.8 : p.duty === "RUN" ? 0.35 : 0.15;
              const urgency = clamp(Math.max(
                dutyUrgency * (0.55 + involvement * 0.45),
                dist / 18,
                involvement * 0.55 + pressure * 0.3,
                traffic * 0.7
              ), 0, 1);
              const response = (0.18 + (1 - p.attributes.control) * 0.3 + (1 - p.attributes.passing) * 0.15) * (1 - urgency * 0.7);
              const demand = p.motionDemand || { vx: p.vx, vy: p.vy };
              const immediateLowSpeedTurn = !!p.movementIntent?.turnNow && Math.hypot(p.vx, p.vy) < 0.85 && dist > 0.1;
              const blend2 = 1 - Math.exp(-DT / response);
              if (immediateLowSpeedTurn) {
                demand.vx = vx;
                demand.vy = vy;
              } else {
                demand.vx += (vx - demand.vx) * blend2;
                demand.vy += (vy - demand.vy) * blend2;
              }
              p.motionDemand = demand;
              vx = demand.vx;
              vy = demand.vy;
              accelerationRate = immediateLowSpeedTurn ? 80 : 6.8 + urgency * 2.2 + (p.attributes.pace - 5.1) * 0.5;
            } else {
              p.motionDemand = null;
            }
            for (const q of s.players) {
              if (q.id === p.id) continue;
              dx = p.x - q.x;
              dy = p.y - q.y;
              const d = Math.hypot(dx, dy);
              if (d < 1.05 && d > 0.01) {
                vx += dx / d * (1.05 - d) * 3;
                vy += dy / d * (1.05 - d) * 3;
              }
            }
            const acceleration = accelerationRate * DT, change = Math.hypot(vx - p.vx, vy - p.vy);
            const blend = change > acceleration ? acceleration / change : 1;
            vx = p.vx + (vx - p.vx) * blend;
            vy = p.vy + (vy - p.vy) * blend;
            const speed = Math.hypot(vx, vy);
            if (speed > max) {
              vx *= max / speed;
              vy *= max / speed;
            }
            return { x: clamp(p.x + vx * DT, 0.25, 104.75), y: clamp(p.y + vy * DT, 0.25, 67.75), vx, vy };
          });
          if (!resetting && s.phase === "play") {
            let yieldMetres = 0, contacts = 0;
            const validStart = (a, b) => distance(a, b) >= bodyClearance - 1e-9;
            for (let iteration = 0; iteration < 12; iteration++) {
              let changed = false;
              for (let i = 0; i < s.players.length; i++) for (let j = i + 1; j < s.players.length; j++) {
                const a = s.players[i], b = s.players[j];
                if (a.role === "GK" || b.role === "GK" || !validStart(a, b)) continue;
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
                desired[i].x += nx * removeA;
                desired[i].y += ny * removeA;
                desired[j].x -= nx * removeB;
                desired[j].y -= ny * removeB;
                yieldMetres += removeA + removeB;
                contacts++;
                changed = true;
              }
              if (!changed) break;
            }
            let residual = 0, malformed = 0;
            for (let i = 0; i < s.players.length; i++) for (let j = i + 1; j < s.players.length; j++) {
              const a = s.players[i], b = s.players[j];
              if (a.role === "GK" || b.role === "GK") continue;
              const startDistance = distance(a, b);
              if (startDistance < bodyClearance - 1e-9) {
                malformed++;
                continue;
              }
              const sx = a.x - b.x, sy = a.y - b.y;
              const rx = desired[i].x - a.x - (desired[j].x - b.x);
              const ry = desired[i].y - a.y - (desired[j].y - b.y);
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
            if (!n.reset && s.phase === "play") {
              s.diagnostics.playerDistance[i] += d;
              s.diagnostics.stationarySeconds[i] = d < 8e-3 ? s.diagnostics.stationarySeconds[i] + DT : 0;
              s.diagnostics.maxStationarySeconds[i] = Math.max(s.diagnostics.maxStationarySeconds[i], s.diagnostics.stationarySeconds[i]);
            }
            p.x = n.x;
            p.y = n.y;
            p.vx = n.vx;
            p.vy = n.vy;
            p.decisionIn -= DT;
            p.challengeIn = Math.max(0, p.challengeIn - DT);
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
          const pos2 = local(s, p.team, p.x, p.y);
          return teammates(s, p).map((q) => {
            const d = distance(p, q), t = local(s, p.team, q.x, q.y);
            const space = Math.min(...opponents(s, p).map((o) => distance(o, q)));
            const lane = laneClearance(s, p, q);
            const progress = t.x - pos2.x;
            const central = pos2.x > 77 ? (Math.abs(pos2.y - 34) - Math.abs(t.y - 34)) * 0.11 : 0;
            const score = Math.min(progress, 22) * 0.12 + Math.min(space, 10) * 0.35 + Math.min(lane, 7) * 0.55 - Math.abs(d - 16) * 0.09 + central - (q.role === "GK" ? 1.8 : 0);
            return { q, d, lane, score };
          }).filter((o) => o.d > 4 && o.d < (restart ? 55 : 40)).sort((a, b) => b.score - a.score || a.q.id - b.q.id);
        }
        function launch(s, p, type, target, loft = 0) {
          const b = s.ball;
          const pressure = Math.min(...opponents(s, p).map((q) => distance(q, p)));
          let tx = target.x, ty = target.y;
          const accuracy = type === "shot" ? p.attributes.shooting : p.attributes.passing;
          const spread = (1 - accuracy) * (type === "shot" ? 7 : 3) + Math.max(0, 2.5 - pressure) * 0.35;
          tx += (random(s) - 0.5) * spread * (type === "shot" ? 0 : 1);
          ty += (random(s) - 0.5) * spread;
          const dx = tx - b.x, dy = ty - b.y, length = Math.hypot(dx, dy);
          const speed = type === "shot" ? 23 + p.attributes.shooting * 8 : clamp(10 + length * 0.36, 12, 23);
          b.vx = dx / Math.max(0.1, length) * speed;
          b.vy = dy / Math.max(0.1, length) * speed;
          b.vz = loft;
          b.owner = null;
          b.mode = "flight";
          b.lastTouch = p.id;
          b.releasedAt = s.time;
          b.flight = { type, team: p.team, kickerId: p.id, targetId: target.id ?? null, offsideIds: [] };
          p.facingIntent = { source: type === "shot" ? "SHOT" : "PASS", dx, dy, until: s.time + 0.34 };
          setFacing(p, dx, dy, p.facingIntent.source);
          p.decisionIn = 0.6;
          if (type === "pass") {
            const defenders = opponents(s, p).map((q) => local(s, p.team, q.x, q.y).x).sort((a, b2) => b2 - a);
            const bx = local(s, p.team, b.x, b.y).x;
            b.flight.offsideIds = teammates(s, p).filter((q) => {
              const x = local(s, p.team, q.x, q.y).x;
              return x > 52.5 && x > bx && x > defenders[1];
            }).map((q) => q.id);
            s.stats[p.team].passes++;
            event(s, "pass", p.team, `${p.role} → ${target.role || "space"}${loft > 0 ? " · lofted pass" : ""}`, p.id, { targetId: target.id ?? null });
          } else {
            s.stats[p.team].shots++;
            const e = event(s, "shot", p.team, `${p.role} shoots`, p.id);
            b.flight.shotEventId = e.id;
            b.flight.onTargetCounted = false;
          }
        }
        function act(s) {
          if (s.ball.owner === null || s.phase !== "play") return;
          const p = s.players[s.ball.owner];
          if (s.input) {
            const input = s.input;
            s.input = null;
            if (input.playerId === p.id) {
              if (input.type === "pass") launch(s, p, "pass", s.players[input.targetId], input.loft || 0);
              if (input.type === "shot") launch(s, p, "shot", input.aim, input.loft);
              if (input.type === "carry") {
                p.intent = { aim: { ...input.aim }, until: s.time + 0.5 };
                p.target = { ...input.aim };
                p.facingIntent = null;
                publishCurrentAction(s, p, "CARRY", p.target, "SELECTED_CARRY_OWNER");
                p.movementIntent = {
                  target: { ...p.target },
                  duty: "CARRY",
                  markId: null,
                  pressId: null,
                  responsibilityVersion: p.responsibility.version,
                  responsibility: copy(p.responsibility),
                  defensiveContext: copy(p.defensiveContext),
                  relationshipKey: "CARRY|SELECTED",
                  ballSide: null,
                  reviewAt: s.time,
                  turnNow: true
                };
                p.motionDemand = null;
                setFacing(p, p.target.x - p.x, p.target.y - p.y, "CARRY");
                p.decisionIn = 0.5;
              }
              return;
            }
          }
          if (p.decisionIn > 0) return;
          const pos2 = local(s, p.team, p.x, p.y);
          const near = opponents(s, p).slice().sort((a, b) => distance(a, p) - distance(b, p))[0];
          const pressure = distance(p, near);
          const goal = world(s, p.team, 105, 34);
          const goalDistance = distance(p, goal), angle = Math.abs(pos2.y - 34);
          const lane = laneClearance(s, p, goal);
          const options = passOptions(s, p), best = options[0];
          if (p.role !== "GK" && goalDistance < 27 && angle < 19 && (lane > 1.5 || goalDistance < 12 || pressure < 2)) {
            const keeper = s.players[(1 - p.team) * 11];
            const aimY = 34 + (keeper.y < 34 ? 1 : -1) * (1 + p.attributes.shooting * 1.5);
            launch(s, p, "shot", { x: goal.x, y: aimY }, 3 + random(s) * 3);
            return;
          }
          const held = s.time - p.controlSince;
          const ahead = (near.x - p.x) * direction(s, p.team) > -0.5;
          const isolated = opponents(s, p).filter((q) => distance(q, p) < 7).length === 1;
          if (p.role !== "GK" && pressure > 1.8 && pressure < 4.5 && ahead && isolated && p.attributes.control > near.attributes.tackling && (!best || best.lane < 2.2 || best.score < 5)) {
            s.stats[p.team].takeOns++;
            event(s, "takeOn", p.team, `${p.role} takes on ${near.role}`, p.id);
            p.decisionIn = 0.55;
            return;
          }
          if (best && (p.role === "GK" || pressure < 4 || held > 2.8 || best.score > 7 && held > 0.7 || pos2.x > 94)) {
            const candidates = options.slice(0, 3);
            const weights = candidates.map((o) => Math.exp((o.score - best.score) * 1.3));
            let r = random(s) * weights.reduce((a, b) => a + b, 0), chosen = candidates[0];
            for (let i = 0; i < candidates.length; i++) {
              r -= weights[i];
              if (r <= 0) {
                chosen = candidates[i];
                break;
              }
            }
            const cross = pos2.x > 76 && angle > 17 && local(s, p.team, chosen.q.x, chosen.q.y).x > 83;
            const t = { ...chosen.q, x: chosen.q.x + chosen.q.vx * 0.25, y: chosen.q.y + chosen.q.vy * 0.25 };
            launch(s, p, "pass", t, cross ? 5.5 + chosen.d * 0.1 : 0);
            return;
          }
          if (pressure < 3.5 && ahead) {
            s.stats[p.team].takeOns++;
            event(s, "takeOn", p.team, `${p.role} takes on ${near.role}`, p.id);
          } else s.stats[p.team].carries++;
          p.decisionIn = 0.5 + random(s) * 0.6;
        }
        function challenge(s) {
          if (s.ball.owner === null || s.phase !== "play") return;
          const p = s.players[s.ball.owner];
          if (s.time - p.controlSince < 0.25) return;
          const candidates = opponents(s, p).filter((q2) => q2.role !== "GK" && q2.challengeIn === 0 && distance(q2, p) < 1.45 && (q2.duty === "PRESS" && q2.responsibility?.challengeIntent || q2.duty === "RECEIVE" || s.ball.flight && q2.markId === p.id)).sort((a, b) => distance(a, p) - distance(b, p));
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
            event(s, "foul", q.team, `${q.role} fouls ${p.role}`, q.id);
            startRestart(s, "freeKick", p.team, { x: p.x, y: p.y });
          } else if (r < foul + clean) {
            s.stats[q.team].defenderWins++;
            event(s, "tackle", q.team, `${q.role} wins the ball from ${p.role}`, q.id);
            setPossession(s, q);
            q.decisionIn = 0.4;
          } else if (r < foul + clean + 0.25) {
            s.stats[q.team].looseOutcomes++;
            event(s, "loose", q.team, `${q.role} pokes it loose`, q.id);
            const angle = Math.atan2(p.y - q.y, p.x - q.x) + (random(s) - 0.5) * 2;
            s.ball.owner = null;
            s.ball.mode = "loose";
            s.ball.flight = null;
            s.possession = null;
            s.ball.vx = Math.cos(angle) * 6;
            s.ball.vy = Math.sin(angle) * 6;
            s.ball.vz = 0.7;
            s.ball.lastTouch = q.id;
            s.ball.releasedAt = s.time;
          } else {
            s.stats[q.team].retained++;
            event(s, "retain", p.team, `${p.role} shields against ${q.role}`, p.id);
          }
        }
        function segmentClosest(ax, ay, bx, by, px, py) {
          const dx = bx - ax, dy = by - ay;
          const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(1e-6, dx * dx + dy * dy), 0, 1);
          return { t, distance: Math.hypot(px - ax - dx * t, py - ay - dy * t) };
        }
        function countOnTarget(s, flight) {
          if (flight && flight.type === "shot" && !flight.onTargetCounted) {
            s.stats[flight.team].shotsOnTarget++;
            flight.onTargetCounted = true;
          }
        }
        function touchFreeBall(s, old) {
          const b = s.ball;
          if (s.time - b.releasedAt < 0.12) return false;
          const speed = Math.hypot(b.vx, b.vy);
          const hits = [];
          for (const p2 of s.players) {
            if (p2.id === b.lastTouch && s.time - b.releasedAt < 0.45) continue;
            const own = local(s, p2.team, p2.x, p2.y);
            const keeper = p2.role === "GK" && own.x < 16.5 && Math.abs(own.y - 34) < 20.16;
            const nearest = segmentClosest(old.x, old.y, b.x, b.y, p2.x, p2.y);
            const z = old.z + (b.z - old.z) * nearest.t;
            const reach = keeper ? 0.95 + p2.attributes.keeping * 0.65 : 0.7;
            if (nearest.distance < reach && z < (keeper ? 2.5 : 1.55)) hits.push({ p: p2, keeper, ...nearest, z });
          }
          hits.sort((a, c) => a.t - c.t || a.distance - c.distance || a.p.id - c.p.id);
          if (!hits.length) return false;
          const h = hits[0], p = h.p, flight = b.flight;
          b.x = old.x + (b.x - old.x) * h.t;
          b.y = old.y + (b.y - old.y) * h.t;
          b.z = Math.max(0.15, h.z);
          if (flight && flight.type === "pass" && flight.team === p.team && flight.offsideIds.includes(p.id)) {
            s.stats[p.team].offsides++;
            event(s, "offside", p.team, `${p.role} involved from an offside position`, p.id);
            startRestart(s, "freeKick", 1 - p.team, { x: p.x, y: p.y });
            return true;
          }
          if (h.keeper) {
            const shot = flight && flight.type === "shot" && flight.team !== p.team;
            if (shot) {
              countOnTarget(s, flight);
              s.stats[p.team].saves++;
            }
            const difficulty = speed / 34 + h.distance / 3 + b.z / 7;
            const clean = random(s) < clamp(p.attributes.keeping + 0.35 - difficulty * 0.48, 0.15, 0.95);
            if (clean) {
              s.stats[p.team].claims++;
              event(s, shot ? "save" : "claim", p.team, `${p.role} ${shot ? "saves and holds" : "claims the ball"}`, p.id);
              setPossession(s, p);
              p.decisionIn = 0.7;
            } else {
              event(s, shot ? "save" : "block", p.team, `${p.role} parries`, p.id);
              const normal = { x: b.x - p.x, y: b.y - p.y };
              const n = Math.hypot(normal.x, normal.y) || 1;
              b.vx = normal.x / n * Math.max(4, speed * 0.45);
              b.vy = normal.y / n * Math.max(4, speed * 0.45) + (random(s) - 0.5) * 3;
              b.vz = 1.5;
              b.mode = "loose";
              b.owner = null;
              b.lastTouch = p.id;
              b.releasedAt = s.time;
              b.flight = null;
              s.possession = null;
            }
          } else if (flight && flight.type === "shot" && flight.team !== p.team) {
            s.stats[p.team].blocks++;
            event(s, "block", p.team, `${p.role} blocks the shot`, p.id);
            b.vx *= -0.3;
            b.vy = b.vy * 0.4 + (random(s) - 0.5) * 7;
            b.vz = 1.2;
            b.mode = "loose";
            b.flight = null;
            b.lastTouch = p.id;
            b.releasedAt = s.time;
            s.possession = null;
          } else {
            const intendedReceipt = !!(flight && flight.type === "pass" && flight.team === p.team && flight.targetId === p.id);
            const nearestOpponent = s.players.filter((q) => q.team !== p.team).reduce((gap, q) => Math.min(gap, distance(p, q)), Infinity);
            const pressurePenalty = clamp((3.2 - nearestOpponent) / 12, 0, 0.18);
            const control = p.attributes.control + (intendedReceipt ? 0.58 : 0.46) - speed / 70 - b.z * 0.15 - pressurePenalty;
            if (random(s) < clamp(control, 0.18, 0.97)) {
              if (flight && flight.type === "pass" && flight.team === p.team) s.stats[p.team].completedPasses++;
              else if (flight && flight.team !== p.team) event(s, "tackle", p.team, `${p.role} intercepts`, p.id, { interception: true });
              const arrival = { dx: b.vx, dy: b.vy };
              setPossession(s, p, intendedReceipt ? arrival : null);
              if (intendedReceipt) {
                p.facingIntent = { source: "RECEIVE", dx: arrival.dx, dy: arrival.dy, until: s.time + 0.16 };
                setFacing(p, arrival.dx, arrival.dy, "RECEIVE");
              }
            } else {
              b.vx *= 0.35;
              b.vy = b.vy * 0.35 + (random(s) - 0.5) * 3;
              b.vz = 0.5;
              b.mode = "loose";
              b.lastTouch = p.id;
              b.releasedAt = s.time;
              b.flight = null;
              s.possession = null;
              event(s, "loose", p.team, `${p.role}: heavy first touch`, p.id);
            }
          }
          return true;
        }
        function boundary(s, old) {
          const b = s.ball;
          const crossings = [];
          if (b.x < 0) crossings.push({ t: (0 - old.x) / (b.x - old.x), axis: "x", edge: 0 });
          if (b.x > 105) crossings.push({ t: (105 - old.x) / (b.x - old.x), axis: "x", edge: 105 });
          if (b.y < 0) crossings.push({ t: (0 - old.y) / (b.y - old.y), axis: "y", edge: 0 });
          if (b.y > 68) crossings.push({ t: (68 - old.y) / (b.y - old.y), axis: "y", edge: 68 });
          crossings.sort((a, c2) => a.t - c2.t);
          if (!crossings.length) return false;
          const c = crossings[0], x = old.x + (b.x - old.x) * c.t, y = old.y + (b.y - old.y) * c.t;
          const z = old.z + (b.z - old.z) * c.t;
          const lastTeam = b.lastTouch === null ? 0 : s.players[b.lastTouch].team;
          if (c.axis === "y") {
            startRestart(s, "throwIn", 1 - lastTeam, { x, y: c.edge });
          } else {
            const attacking = direction(s, 0) === (c.edge === 105 ? 1 : -1) ? 0 : 1;
            if (Math.abs(y - 34) < 3.66 && z < 2.44) {
              countOnTarget(s, b.flight);
              s.score[attacking]++;
              s.stats[attacking].goals++;
              event(
                s,
                "goal",
                attacking,
                `${s.teams[attacking].name} GOAL · ${s.score[0]}–${s.score[1]}`,
                b.lastTouch,
                { ownGoal: lastTeam !== attacking }
              );
              startRestart(s, "kickoff", 1 - attacking, { x: 52.5, y: 34 }, true);
            } else if (lastTeam !== attacking) {
              s.stats[lastTeam].deflectionsOut++;
              startRestart(s, "corner", attacking, { x: c.edge, y: y < 34 ? 0 : 68 });
            } else {
              const spot = world(s, 1 - attacking, 5.5, 34);
              startRestart(s, "goalKick", 1 - attacking, spot);
            }
          }
          return true;
        }
        function integrateBall(s) {
          const b = s.ball;
          if (s.phase !== "play") {
            if (s.restart) {
              b.x = s.restart.spot.x;
              b.y = s.restart.spot.y;
              b.z = 0.15;
            }
            return;
          }
          if (b.owner !== null) {
            const p = s.players[b.owner], speed = Math.hypot(p.vx, p.vy);
            const old2 = { x: b.x, y: b.y, z: b.z };
            b.x = p.x + (speed > 0.4 ? p.vx / speed : direction(s, p.team)) * 0.55;
            b.y = p.y + (speed > 0.4 ? p.vy / speed : 0) * 0.55;
            b.z = 0.15;
            boundary(s, old2);
            return;
          }
          const old = { x: b.x, y: b.y, z: b.z };
          b.x += b.vx * DT;
          b.y += b.vy * DT;
          b.z += b.vz * DT;
          b.vz -= 9.81 * DT;
          if (b.z < 0.15) {
            b.z = 0.15;
            b.vz = Math.abs(b.vz) > 1.4 ? -b.vz * 0.32 : 0;
          }
          const damping = b.z < 0.2 ? Math.exp(-0.52 * DT) : Math.exp(-0.07 * DT);
          b.vx *= damping;
          b.vy *= damping;
          let edgeT = 1;
          for (const [axis, max] of [["x", 105], ["y", 68]]) {
            if (b[axis] < 0) edgeT = Math.min(edgeT, (0 - old[axis]) / (b[axis] - old[axis]));
            if (b[axis] > max) edgeT = Math.min(edgeT, (max - old[axis]) / (b[axis] - old[axis]));
          }
          const end = { x: b.x, y: b.y, z: b.z };
          if (edgeT < 1) {
            b.x = old.x + (b.x - old.x) * edgeT;
            b.y = old.y + (b.y - old.y) * edgeT;
            b.z = old.z + (b.z - old.z) * edgeT;
          }
          const touched = touchFreeBall(s, old);
          if (s.phase !== "play" || touched) return;
          if (edgeT < 1) {
            b.x = end.x;
            b.y = end.y;
            b.z = end.z;
          }
          boundary(s, old);
        }
        function restartTick(s) {
          if (!s.restart) return;
          const r = s.restart, p = s.players[r.takerId];
          r.elapsed += DT;
          if (r.elapsed < r.wait || distance(p, r.spot) > 1) return;
          s.phase = "play";
          s.restart = null;
          setPossession(s, p);
          const pos2 = local(s, p.team, p.x, p.y);
          const options = passOptions(s, p, true);
          if (r.type === "freeKick" && pos2.x > 79 && Math.abs(pos2.y - 34) < 16) {
            launch(s, p, "shot", world(s, p.team, 105, 34 + (random(s) - 0.5) * 4), 5.5);
          } else if (options.length) {
            let target = options[0].q;
            if (r.type === "kickoff") target = s.players[p.team * 11 + 7];
            if (r.type === "corner") target = s.players[p.team * 11 + 9];
            launch(s, p, "pass", target, r.type === "corner" ? 9 : r.type === "throwIn" ? 3 : 0);
            if (r.type === "throwIn" || r.type === "corner" || r.type === "goalKick") s.ball.flight.offsideIds = [];
          }
        }
        function measure(s) {
          const d = s.diagnostics;
          if (s.phase !== "play") return;
          if (s.ball.owner !== null) s.stats[s.players[s.ball.owner].team].possessionTicks++;
          if (s.ball.owner !== null && s.possession !== s.players[s.ball.owner].team) d.ballTruthConflicts++;
          for (const p of s.players) {
            if (p.duty === "MARK" && p.markId !== null) {
              d.markingSamples++;
              const q = s.players[p.markId];
              if (distance(p.target, q) < 0.1) d.markingGlueTicks++;
            }
            if ((p.role === "LB" || p.role === "RB") && s.possession !== p.team) {
              const threats = opponents(s, p).filter((q) => {
                const b = local(s, p.team, q.x, q.y);
                return b.x < 48 && (p.role === "LB" ? b.y < 16 : b.y > 52);
              });
              if (threats.length) {
                d.wideThreatSamples++;
                const q = local(s, p.team, p.target.x, p.target.y);
                if (p.duty === "PRESS" && (p.role === "LB" ? q.y > 40 : q.y < 28)) d.wideAbandonmentTicks++;
              }
            }
          }
          if (s.tick % 20 !== 0) return;
          d.shapeSamples++;
          for (let team = 0; team < 2; team++) {
            const ps = s.players.filter((p) => p.team === team && p.role !== "GK");
            const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
            const width = Math.max(...ys) - Math.min(...ys), depth = Math.max(...xs) - Math.min(...xs);
            d.widths[team] += width;
            d.depths[team] += depth;
            d.minWidth[team] = Math.min(d.minWidth[team], width);
            d.maxDepth[team] = Math.max(d.maxDepth[team], depth);
            if (ps.filter((p) => distance(p, s.ball) < 7).length >= 6) d.massChaseTicks++;
          }
        }
        function record(s) {
          const frame = Object.freeze({
            tick: s.tick,
            time: round2(s.time),
            clock: round2(s.clock),
            half: s.half,
            phase: s.phase,
            score: Object.freeze([...s.score]),
            possession: s.possession,
            ball: Object.freeze([s.ball.x, s.ball.y, s.ball.z]),
            players: Object.freeze(s.players.flatMap((p) => [p.x, p.y, DUTIES.indexOf(p.duty)])),
            eventId: s.currentEvent
          });
          s.history.push(frame);
          return frame;
        }
        function tick(s) {
          if (s.phase === "full-time") return false;
          s.tick++;
          s.time = s.tick * DT;
          if (s.phase === "half-time") {
            s.restart.elapsed += DT;
            if (s.restart.elapsed >= 3) {
              s.phase = "restart";
              s.restart.elapsed = 0;
            }
          } else {
            s.clock = Math.min(s.half === 1 ? 2700 : 5400, s.clock + DT * CLOCK_RATE);
            if (s.half === 1 && s.clock >= 2700) {
              s.half = 2;
              startRestart(s, "kickoff", 1, { x: 52.5, y: 34 }, true);
              s.phase = "half-time";
              s.restart.elapsed = 0;
              event(s, "halfTime", null, "Half time · teams change ends");
            } else if (s.half === 2 && s.clock >= 5400) {
              s.phase = "full-time";
              s.paused = true;
              s.restart = null;
              s.input = null;
              event(s, "fullTime", null, `Full time · ${s.score[0]}–${s.score[1]}`);
              record(s);
              return true;
            }
          }
          setTargets(s);
          if (s.phase === "play") act(s);
          integratePlayers(s);
          if (s.phase === "play") challenge(s);
          integrateBall(s);
          if (s.phase === "restart") restartTick(s);
          measure(s);
          record(s);
          return true;
        }
        const _Match = class _Match {
          constructor(seed = "astra-659") {
            __privateAdd(this, _s);
            __privateSet(this, _s, seed === RESTORE ? null : createState(seed));
          }
          static restore(serialized) {
            const data = typeof serialized === "string" ? JSON.parse(serialized) : copy(serialized);
            if (data.version !== "ASTRA-659-1" || data.players.length !== 22) throw new Error("Incompatible MatchState");
            const match = new _Match(RESTORE);
            __privateSet(match, _s, data);
            for (const f of data.history) {
              Object.freeze(f.players);
              Object.freeze(f.ball);
              Object.freeze(f.score);
              Object.freeze(f);
            }
            return match;
          }
          pause() {
            __privateGet(this, _s).paused = true;
          }
          resume() {
            if (__privateGet(this, _s).phase !== "full-time") __privateGet(this, _s).paused = false;
          }
          advance() {
            return __privateGet(this, _s).paused ? false : tick(__privateGet(this, _s));
          }
          step() {
            return __privateGet(this, _s).paused ? tick(__privateGet(this, _s)) : false;
          }
          get paused() {
            return __privateGet(this, _s).paused;
          }
          get finished() {
            return __privateGet(this, _s).phase === "full-time";
          }
          get frame() {
            return __privateGet(this, _s).history[__privateGet(this, _s).history.length - 1];
          }
          get previousFrame() {
            return __privateGet(this, _s).history[Math.max(0, __privateGet(this, _s).history.length - 2)];
          }
          inspect() {
            const { history, events, ...current } = __privateGet(this, _s);
            return { ...copy(current), historyLength: history.length, eventCount: events.length };
          }
          eventsSince(id = 0) {
            return __privateGet(this, _s).events.slice(id).map(copy);
          }
          serialize() {
            return JSON.stringify(__privateGet(this, _s));
          }
          history() {
            return __privateGet(this, _s).history.slice();
          }
          // TEST_ONLY hybrid docking: retain this Match (and therefore its private
          // RNG/profile stream) while replacing only a validated present spatial
          // state.  This is deliberately not restore(), does not step, and does not
          // consume randomness.  It is opt-in and exists solely at the G1 boundary.
          hydrateCurrent(current) {
            const s = __privateGet(this, _s), data = typeof current === "string" ? JSON.parse(current) : copy(current);
            if (!data || !Array.isArray(data.players) || data.players.length !== 22 || !data.ball) throw new Error("HYDRATE_CURRENT_SHAPE_INVALID");
            const byId = new Map(data.players.map((p) => [p.id, p]));
            if (byId.size !== 22 || s.players.some((p) => !byId.has(p.id))) throw new Error("HYDRATE_CURRENT_IDENTITY_INVALID");
            for (const p of s.players) {
              const next = byId.get(p.id);
              if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || next.x < 0 || next.x > 105 || next.y < 0 || next.y > 68 || next.team !== p.team) throw new Error("HYDRATE_CURRENT_PLAYER_INVALID");
              p.x = next.x;
              p.y = next.y;
              p.vx = 0;
              p.vy = 0;
              p.target = { x: p.x, y: p.y };
              invalidateCurrentContract(s, p, "EXTERNAL_CURRENT_HYDRATION");
            }
            const b = data.ball;
            if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < 0 || b.x > 105 || b.y < 0 || b.y > 68 || b.mode !== "controlled" || !Number.isInteger(b.owner) || !byId.has(b.owner)) throw new Error("HYDRATE_CURRENT_BALL_INVALID");
            s.ball.x = b.x;
            s.ball.y = b.y;
            s.ball.z = Number.isFinite(b.z) ? b.z : 0.15;
            s.ball.vx = 0;
            s.ball.vy = 0;
            s.ball.vz = 0;
            s.ball.owner = b.owner;
            s.ball.mode = "controlled";
            s.ball.flight = null;
            s.ball.lastTouch = Number.isInteger(b.lastTouch) ? b.lastTouch : b.owner;
            s.ball.releasedAt = -100;
            s.possession = data.possession;
            s.lastPossession = data.possession;
            s.score = [...data.score];
            s.phase = "play";
            s.paused = true;
            s.restart = null;
            s.input = null;
            setTargets(s);
            return this.inspect();
          }
          replay(eventId, before = 10, after = 2) {
            const e = __privateGet(this, _s).events[eventId];
            if (!e) return null;
            const from = Math.max(0, e.time - before), to = Math.min(__privateGet(this, _s).time, e.time + after);
            return Object.freeze({
              event: Object.freeze(copy(e)),
              from,
              to,
              frames: Object.freeze(__privateGet(this, _s).history.filter((f) => f.time >= from - 1e-3 && f.time <= to + 1e-3))
            });
          }
          // One selected present-tense action, never a selected result. No RNG or movement here.
          // A future choice detector calls inspect -> pause -> submitAction -> resume.
          submitAction(action) {
            const s = __privateGet(this, _s);
            if (!s.paused || s.phase !== "play" || s.ball.owner === null || !action || !Number.isInteger(action.playerId) || action.playerId !== s.ball.owner) return false;
            const p = s.players[action.playerId];
            if (action.type === "pass") {
              const q = s.players[action.targetId];
              if (!q || q.team !== p.team || q.id === p.id) return false;
            } else if (action.type === "shot" || action.type === "carry") {
              if (!action.aim || !Number.isFinite(action.aim.x) || !Number.isFinite(action.aim.y) || action.aim.x < 0 || action.aim.x > 105 || action.aim.y < 0 || action.aim.y > 68) return false;
            } else return false;
            if (action.loft !== void 0 && (!Number.isFinite(action.loft) || action.loft < 0 || action.loft > 12)) return false;
            s.input = { playerId: p.id, type: action.type, ...action.type === "pass" ? { targetId: action.targetId } : { aim: { ...action.aim } }, loft: action.loft ?? (action.type === "shot" ? 4 : 0) };
            return true;
          }
        };
        _s = new WeakMap();
        let Match = _Match;
        return Object.freeze({
          Match,
          createMatch: (seed) => new Match(seed),
          DT,
          CLOCK_RATE,
          ROLES,
          DUTIES,
          PITCH: Object.freeze({ length: 105, width: 68, goalWidth: 7.32 }),
          VERSION: "ASTRA-659-1"
        });
      });
    }
  });

  // prototype/hybrid_v48/historical_frl_a_renderer.js
  var require_historical_frl_a_renderer = __commonJS({
    "prototype/hybrid_v48/historical_frl_a_renderer.js"(exports, module) {
      "use strict";
      function createHistoricalRenderer2(canvas2, documentRef = document) {
        if (!canvas2 || typeof canvas2.getContext !== "function") throw new Error("FRL_A_RENDERER_CANVAS_REQUIRED");
        const ctx2 = canvas2.getContext("2d");
        const $2 = (id) => documentRef.getElementById(id);
        const SCALE = 7.25, OX = 42, OY = 42;
        const roles = ["GK", "LB", "LCB", "RCB", "RB", "DM", "LCM", "RCM", "LF", "CF", "RF"];
        const point2 = (p) => ({ x: OX + p.x * SCALE, y: OY + p.y * SCALE });
        function pitch() {
          ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
          ctx2.fillStyle = "#12382b";
          ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
          for (let i = 0; i < 10; i++) {
            ctx2.fillStyle = i % 2 ? "#286649" : "#2c6e4e";
            ctx2.fillRect(OX + i * 10.5 * SCALE, OY, 10.5 * SCALE, 68 * SCALE);
          }
          ctx2.strokeStyle = "#d5e7d1";
          ctx2.lineWidth = 1.8;
          const rect = (x, y, w, h) => ctx2.strokeRect(OX + x * SCALE, OY + y * SCALE, w * SCALE, h * SCALE);
          rect(0, 0, 105, 68);
          rect(0, 13.84, 16.5, 40.32);
          rect(88.5, 13.84, 16.5, 40.32);
          rect(0, 24.84, 5.5, 18.32);
          rect(99.5, 24.84, 5.5, 18.32);
          ctx2.beginPath();
          ctx2.moveTo(OX + 52.5 * SCALE, OY);
          ctx2.lineTo(OX + 52.5 * SCALE, OY + 68 * SCALE);
          ctx2.stroke();
          ctx2.beginPath();
          ctx2.arc(OX + 52.5 * SCALE, OY + 34 * SCALE, 9.15 * SCALE, 0, Math.PI * 2);
          ctx2.stroke();
          for (const x of [11, 52.5, 94]) {
            ctx2.beginPath();
            ctx2.arc(OX + x * SCALE, OY + 34 * SCALE, 2.8, 0, Math.PI * 2);
            ctx2.fillStyle = "#e0ecdc";
            ctx2.fill();
          }
          ctx2.fillStyle = "#afccb8";
          ctx2.font = "12px system-ui";
          ctx2.textAlign = "center";
          ctx2.fillText("ASTRA · INDEPENDENT FOOTBALL", canvas2.width / 2, 24);
        }
        function drawRecoveryArrow(p) {
          const r = p.responsibility || {};
          const target = r.recoveryTarget || r.target;
          if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
          const a = point2(p), b = point2(target);
          ctx2.save();
          ctx2.strokeStyle = "#9ed7a5";
          ctx2.fillStyle = "#9ed7a5";
          ctx2.setLineDash([6, 4]);
          ctx2.lineWidth = 1.4;
          ctx2.beginPath();
          ctx2.moveTo(a.x, a.y);
          ctx2.lineTo(b.x, b.y);
          ctx2.stroke();
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          ctx2.setLineDash([]);
          ctx2.beginPath();
          ctx2.moveTo(b.x, b.y);
          ctx2.lineTo(b.x - 7 * Math.cos(angle - 0.45), b.y - 7 * Math.sin(angle - 0.45));
          ctx2.lineTo(b.x - 7 * Math.cos(angle + 0.45), b.y - 7 * Math.sin(angle + 0.45));
          ctx2.closePath();
          ctx2.fill();
          ctx2.restore();
        }
        function draw(inspect2, { protagonistId = null, selectedId = null, phaseLabel = "" } = {}) {
          if (!inspect2 || !Array.isArray(inspect2.players) || inspect2.players.length !== 22 || !inspect2.ball) throw new Error("FRL_A_RENDERER_INSPECT_REQUIRED");
          pitch();
          inspect2.players.forEach(drawRecoveryArrow);
          inspect2.players.forEach((p, i) => {
            const { x, y } = point2(p), red = p.team === 0, role = p.role || roles[i % 11], radius = 11;
            ctx2.fillStyle = "#071c2370";
            ctx2.beginPath();
            ctx2.ellipse(x + 2, y + 4, radius, radius * 0.75, 0, 0, Math.PI * 2);
            ctx2.fill();
            if (p.id === protagonistId || p.id === selectedId) {
              ctx2.strokeStyle = "#ffe085";
              ctx2.lineWidth = 2.5;
              ctx2.beginPath();
              ctx2.arc(x, y, radius + 5, 0, Math.PI * 2);
              ctx2.stroke();
            }
            const g = ctx2.createRadialGradient(x - 4, y - 5, 1, x, y, radius);
            g.addColorStop(0, red ? "#ff9e93" : "#93d4ff");
            g.addColorStop(0.36, red ? "#e84949" : "#2f8bd3");
            g.addColorStop(1, red ? "#8f1728" : "#123e87");
            ctx2.fillStyle = g;
            ctx2.beginPath();
            ctx2.arc(x, y, radius, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.strokeStyle = role === "GK" ? "#ffdc7d" : "#ffffffbb";
            ctx2.lineWidth = role === "GK" ? 2.5 : 1.2;
            ctx2.stroke();
            ctx2.font = "bold 8px system-ui";
            ctx2.textAlign = "center";
            ctx2.textBaseline = "middle";
            ctx2.fillStyle = "#071c23";
            ctx2.fillText(role, x + 0.7, y + 0.7);
            ctx2.fillStyle = "#fff";
            ctx2.fillText(role, x, y);
          });
          const ball = point2(inspect2.ball), lift = Math.min(16, (inspect2.ball.z || 0) * 5);
          ctx2.fillStyle = "#071c2380";
          ctx2.beginPath();
          ctx2.ellipse(ball.x + 2, ball.y + 2, 6, 3, 0, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.strokeStyle = "#ffe87d";
          ctx2.lineWidth = 2;
          ctx2.fillStyle = "#fff";
          ctx2.beginPath();
          ctx2.arc(ball.x, ball.y - lift, 5.5, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.stroke();
          const label = $2("renderer-lineage");
          if (label) label.textContent = `FRL-A Candidate draw lineage 78eba35 · ${phaseLabel}`;
        }
        return Object.freeze({ draw, lineage: "78eba35aea15ba519b443c73d9e4c902d07fe2fa" });
      }
      module.exports = Object.freeze({ createHistoricalRenderer: createHistoricalRenderer2 });
    }
  });

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/intent.js
  function handleBottomGKIntent(playerInformation) {
    if (oppositionNearContext(playerInformation, 10, 25)) {
      return [0, 0, 10, 0, 0, 0, 0, 10, 0, 40, 40];
    }
    return [0, 0, 50, 0, 0, 0, 0, 10, 0, 20, 20];
  }
  function handleBottomAttackingThirdIntent(playerInformation) {
    if (oppositionNearContext(playerInformation, 10, 10)) {
      return [30, 20, 20, 10, 0, 0, 0, 20, 0, 0, 0];
    }
    return [70, 10, 10, 0, 0, 0, 0, 10, 0, 0, 0];
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/logger.js
  var logger = {
    info: (...args) => {
      if (false)
        console.info("[Sim:Info]", ...args);
    },
    warn: (...args) => {
      console.warn("[Sim:Warn]", ...args);
    },
    error: (...args) => {
      console.error("[Sim:Error]", ...args);
    }
  };

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/common/getBallTrajectory.js
  function getBallTrajectory(thisPOS, newPOS, power) {
    const xMovement = (thisPOS[0] - newPOS[0]) ** 2;
    const yMovement = (Math.floor(thisPOS[1]) - Math.floor(newPOS[1])) ** 2;
    const movementDistance = Math.round(Math.sqrt(xMovement + yMovement));
    let arraySize = Math.round(thisPOS[1] - newPOS[1]);
    let effectivePower = power;
    if (movementDistance >= power) {
      effectivePower = Math.floor(power) + Math.floor(movementDistance);
    }
    const height = Math.sqrt(Math.abs((movementDistance / 2) ** 2 - (effectivePower / 2) ** 2));
    if (arraySize < 1) {
      arraySize = 1;
    }
    const yPlaces = Array.from({ length: Math.abs(arraySize) }, (_, i) => i);
    const trajectory = [[thisPOS[0], thisPOS[1], 0]];
    const changeInX = (newPOS[0] - thisPOS[0]) / Math.abs(thisPOS[1] - newPOS[1]);
    const changeInY = (thisPOS[1] - newPOS[1]) / (newPOS[1] - thisPOS[1]);
    const changeInH = height / (yPlaces.length / 2);
    let elevation = 1;
    yPlaces.forEach(() => {
      const lastX = trajectory[trajectory.length - 1][0];
      const lastY = trajectory[trajectory.length - 1][1];
      const lastH = trajectory[trajectory.length - 1][2];
      const xPos = round(lastX + changeInX, 5);
      let yPos = 0;
      if (newPOS[1] > thisPOS[1]) {
        yPos = Math.floor(lastY) - Math.floor(changeInY);
      } else {
        yPos = Math.floor(lastY) + Math.floor(changeInY);
      }
      let hPos;
      if (elevation === 1) {
        hPos = round(lastH + changeInH, 5);
        if (hPos >= height) {
          elevation = 0;
          hPos = height;
        }
      } else {
        hPos = round(lastH - changeInH, 5);
      }
      trajectory.push([xPos, yPos, hPos]);
    });
    return trajectory;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/common.js
  var matchRNG = Math.random;
  function setMatchSeed(seed) {
    matchRNG = function() {
      let t = seed += 1831565813;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function getRandomNumber(min, max) {
    return Math.floor(matchRNG() * (max - min + 1)) + min;
  }
  function round(value, decimals) {
    const p = Math.pow(10, decimals);
    const n = Number(value) * p;
    const rounded = Math.round(n);
    return rounded / p;
  }
  function isBetween(num, low, high) {
    return num > low && num < high;
  }
  function upToMax(num, max) {
    if (num > max) {
      return max;
    }
    return num;
  }
  function upToMin(num, min) {
    if (num < min) {
      return min;
    }
    return num;
  }
  function calculatePower(strength) {
    const hit = getRandomNumber(1, 5);
    return Math.floor(Number(strength)) * hit;
  }
  function aTimesbDividedByC(a, b, c) {
    return a * (b / sumFrom1toX(c));
  }
  function sumFrom1toX(x) {
    return x * (x + 1) / 2;
  }
  function inTopPenalty(matchDetails, item) {
    const [matchWidth, matchHeight] = matchDetails.pitchSize;
    const ballInPenalyBoxX = isBetween(item[0], matchWidth / 4 + 5, matchWidth - matchWidth / 4 - 5);
    const ballInTopPenalyBoxY = isBetween(item[1], -1, matchHeight / 6 + 7);
    return ballInPenalyBoxX && ballInTopPenalyBoxY;
  }
  function inBottomPenalty(matchDetails, item) {
    const [matchWidth, matchHeight] = matchDetails.pitchSize;
    const ballInPenalyBoxX = isBetween(item[0], matchWidth / 4 + 5, matchWidth - matchWidth / 4 - 5);
    const ballInBottomPenalyBoxY = isBetween(item[1], matchHeight - matchHeight / 6 - 7, matchHeight + 1);
    return ballInPenalyBoxX && ballInBottomPenalyBoxY;
  }
  function getRandomTopPenaltyPosition(matchDetails) {
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const boundaryX = [pitchWidth / 4 + 6, pitchWidth - pitchWidth / 4 - 6];
    const boundaryY = [0, pitchHeight / 6 + 6];
    return [getRandomNumber(boundaryX[0], boundaryX[1]), getRandomNumber(boundaryY[0], boundaryY[1])];
  }
  function getRandomBottomPenaltyPosition(matchDetails) {
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const boundaryX = [pitchWidth / 4 + 6, pitchWidth - pitchWidth / 4 - 6];
    const boundaryY = [pitchHeight - pitchHeight / 6 + 6, pitchHeight];
    return [getRandomNumber(boundaryX[0], boundaryX[1]), getRandomNumber(boundaryY[0], boundaryY[1])];
  }
  function isEven(n) {
    return n % 2 === 0;
  }
  function isOdd(n) {
    return Math.abs(n % 2) === 1;
  }
  function removeBallFromAllPlayers(matchDetails) {
    for (const player of matchDetails.kickOffTeam.players) {
      player.hasBall = false;
    }
    for (const player of matchDetails.secondTeam.players) {
      player.hasBall = false;
    }
  }
  function setPlayerXY(player, x, y) {
    safeSet(player, "currentPOS", [x, y]);
  }
  function setBallPosition(ball, x, y, z) {
    const newPos = z !== void 0 ? [x, y, z] : [x, y];
    safeSet(ball, "position", newPos);
  }
  function safeSet(obj, key, value) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    const targetObj = obj;
    if (descriptor && descriptor.configurable === false) {
      try {
        targetObj[key] = value;
      } catch (error) {
        const targetValue = targetObj[key];
        if (Array.isArray(targetValue) && Array.isArray(value)) {
          const targetArray = targetValue;
          value.forEach((val, i) => {
            targetArray[i] = val;
          });
        } else {
          logger.error(`Property ${String(key)} is locked (non-configurable).`, error);
        }
      }
      return;
    }
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  function setPlayerPos(player, pos2) {
    setPlayerXY(player, pos2[0], pos2[1]);
  }
  function destructPos(position) {
    if (!position) {
      throw new Error("Position is undefined");
    }
    const x = position[0];
    if (x === "NP") {
      throw new Error("Not playing.");
    }
    const y = position[1];
    return [x, y];
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/playerDefaults.js
  function initializePlayerObject(position) {
    return {
      position,
      shirtNumber: 55,
      currentPOS: [320, 15],
      originPOS: [320, 5],
      name: "string",
      rating: "99",
      skill: getDefaultPlayerSkills(),
      fitness: 50,
      injured: false,
      playerID: -99,
      intentPOS: [0, 0],
      action: "",
      offside: false,
      hasBall: false,
      stats: getDefaultPlayerStats()
    };
  }
  function getDefaultPlayerSkills() {
    return {
      passing: 80,
      shooting: 80,
      tackling: 80,
      saving: 80,
      agility: 80,
      strength: 80,
      penalty_taking: 80,
      jumping: 90
    };
  }
  function getDefaultPlayerStats() {
    const emptyCounter = { total: 0, on: 0, off: 0, fouls: 0 };
    return {
      goals: 0,
      saves: 0,
      shots: { ...emptyCounter },
      passes: { ...emptyCounter },
      tackles: { ...emptyCounter },
      cards: { yellow: 0, red: 0 }
    };
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/factories/playerFactory.js
  function createPlayer(position) {
    return initializePlayerObject(position);
  }
  function setBPlayer(ballPos) {
    const [ballX, ballY] = ballPos;
    const pos2 = [ballX, ballY];
    const player = createPlayer("LB");
    const patch = {
      name: `Ball`,
      position: `LB`,
      rating: `100`,
      skill: {
        passing: 100,
        shooting: 100,
        saving: 100,
        tackling: 100,
        agility: 100,
        strength: 100,
        penalty_taking: 100,
        jumping: 100
      },
      originPOS: pos2,
      currentPOS: pos2,
      injured: false
    };
    return { ...player, ...patch };
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/setVariables.js
  function resetPlayerPositions(matchDetails) {
    for (const player of matchDetails.kickOffTeam.players) {
      if (player.currentPOS[0] !== "NP") {
        setPlayerPos(player, [...player.originPOS]);
        player.intentPOS = [...player.originPOS];
      }
    }
    for (const player of matchDetails.secondTeam.players) {
      if (player.currentPOS[0] !== "NP") {
        setPlayerPos(player, [...player.originPOS]);
        player.intentPOS = [...player.originPOS];
      }
    }
  }
  function initStats() {
    return {
      goals: 0,
      shots: {
        total: 0,
        on: 0,
        off: 0
      },
      cards: {
        yellow: 0,
        red: 0
      },
      passes: {
        total: 0,
        on: 0,
        off: 0
      },
      tackles: {
        total: 0,
        on: 0,
        off: 0,
        fouls: 0
      }
    };
  }
  function initializePlayerState(player) {
    player.playerID = getRandomNumber(1e12, 999999999999999);
    if (player.currentPOS[0] === "NP") {
      throw new Error("No player position!");
    }
    player.originPOS = [player.currentPOS[0], player.currentPOS[1]];
    player.intentPOS = [player.currentPOS[0], player.currentPOS[1]];
    player.action = `none`;
    player.offside = false;
    player.hasBall = false;
    player.stats = initStats();
    if (player.position === "GK") {
      player.stats.saves = 0;
    }
  }
  function setGameVariables(team) {
    team.players.forEach(initializePlayerState);
    team.intent = `none`;
    team.teamID = getRandomNumber(1e12, 999999999999999);
    return team;
  }
  function koDecider(team1, matchDetails) {
    const playerWithBall = getRandomNumber(9, 10);
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.Player = team1.players[playerWithBall].playerID;
    matchDetails.ball.withTeam = team1.teamID;
    team1.intent = `attack`;
    setPlayerXY(team1.players[playerWithBall], matchDetails.ball.position[0], matchDetails.ball.position[1]);
    team1.players[playerWithBall].intentPOS = [
      matchDetails.ball.position[0],
      matchDetails.ball.position[1]
    ];
    team1.players[playerWithBall].hasBall = true;
    matchDetails.ball.lastTouch.playerName = team1.players[playerWithBall].name;
    matchDetails.ball.lastTouch.playerID = team1.players[playerWithBall].playerID;
    matchDetails.ball.lastTouch.teamID = team1.teamID;
    matchDetails.ball.ballOverIterations = [];
    const waitingPlayer = playerWithBall === 9 ? 10 : 9;
    setPlayerXY(team1.players[waitingPlayer], matchDetails.ball.position[0] + 20, matchDetails.ball.position[1]);
    team1.players[waitingPlayer].intentPOS = [
      matchDetails.ball.position[0] + 20,
      matchDetails.ball.position[1]
    ];
    return team1;
  }
  function populateMatchDetails(team1, team2, pitchDetails) {
    const teamStats = {
      goals: 0,
      shots: {
        total: 0,
        on: 0,
        off: 0
      },
      corners: 0,
      freekicks: 0,
      penalties: 0,
      fouls: 0
    };
    return {
      matchID: getRandomNumber(1e12, 999999999999999),
      kickOffTeam: team1,
      secondTeam: team2,
      pitchSize: [pitchDetails.pitchWidth, pitchDetails.pitchHeight, pitchDetails.goalWidth],
      ball: {
        position: [pitchDetails.pitchWidth / 2, pitchDetails.pitchHeight / 2, 0],
        withPlayer: true,
        Player: ``,
        withTeam: ``,
        direction: `south`,
        ballOverIterations: [],
        lastTouch: {
          playerName: ``,
          playerID: -99,
          teamID: -99
        }
      },
      half: 1,
      kickOffTeamStatistics: structuredClone(teamStats),
      secondTeamStatistics: structuredClone(teamStats),
      iterationLog: []
    };
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/event/goal.js
  function setKickOffTeamGoalScored(matchDetails) {
    const scorer = matchDetails.ball.lastTouch.playerName;
    matchDetails.iterationLog.push(`Goal Scored by - ${scorer} - (${matchDetails.kickOffTeam.name})`);
    const thisIndex = matchDetails.kickOffTeam.players.findIndex(function(thisPlayer) {
      return thisPlayer.name === scorer;
    });
    if (thisIndex > -1) {
      matchDetails.kickOffTeam.players[thisIndex].stats.goals++;
    }
    matchDetails.ball.lastTouch.playerName = ``;
    matchDetails.ball.lastTouch.playerID = -99;
    matchDetails.ball.lastTouch.teamID = -99;
    removeBallFromAllPlayers(matchDetails);
    resetPlayerPositions(matchDetails);
    setBallSpecificGoalScoreValue(matchDetails, matchDetails.secondTeam);
    matchDetails.secondTeam.intent = `attack`;
    matchDetails.kickOffTeam.intent = `defend`;
    matchDetails.kickOffTeamStatistics.goals++;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setSecondTeamGoalScored(matchDetails) {
    const scorer = matchDetails.ball.lastTouch.playerName;
    matchDetails.iterationLog.push(`Goal Scored by - ${scorer} - (${matchDetails.secondTeam.name})`);
    const thisIndex = matchDetails.secondTeam.players.findIndex(function(thisPlayer) {
      return thisPlayer.name === scorer;
    });
    if (thisIndex > -1) {
      matchDetails.secondTeam.players[thisIndex].stats.goals++;
    }
    matchDetails.ball.lastTouch.playerName = "";
    matchDetails.ball.lastTouch.playerID = -99;
    matchDetails.ball.lastTouch.teamID = -99;
    removeBallFromAllPlayers(matchDetails);
    resetPlayerPositions(matchDetails);
    setBallSpecificGoalScoreValue(matchDetails, matchDetails.kickOffTeam);
    matchDetails.kickOffTeam.intent = `attack`;
    matchDetails.secondTeam.intent = `defend`;
    matchDetails.secondTeamStatistics.goals++;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setBallSpecificGoalScoreValue(matchDetails, conceedingTeam) {
    matchDetails.ball.position = [matchDetails.pitchSize[0] / 2, matchDetails.pitchSize[1] / 2, 0];
    matchDetails.ball.ballOverIterations = [];
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.withTeam = conceedingTeam.teamID;
    const playerWithBall = getRandomNumber(9, 10);
    const waitingPlayer = playerWithBall === 9 ? 10 : 9;
    setPlayerXY(conceedingTeam.players[playerWithBall], matchDetails.ball.position[0], matchDetails.ball.position[1]);
    conceedingTeam.players[playerWithBall].hasBall = true;
    matchDetails.ball.lastTouch.playerName = conceedingTeam.players[playerWithBall].name;
    matchDetails.ball.lastTouch.playerID = conceedingTeam.players[playerWithBall].playerID;
    matchDetails.ball.lastTouch.teamID = conceedingTeam.teamID;
    matchDetails.ball.Player = conceedingTeam.players[playerWithBall].playerID;
    setPlayerXY(conceedingTeam.players[waitingPlayer], matchDetails.ball.position[0] + 20, matchDetails.ball.position[1]);
  }
  function resolveGoalScored(matchDetails, isTopGoal) {
    const { half } = matchDetails;
    if (half === 0) {
      throw new Error("cannot set half as 0");
    }
    const isOddHalf = isOdd(half);
    if (isTopGoal) {
      return isOddHalf ? setSecondTeamGoalScored(matchDetails) : setKickOffTeamGoalScored(matchDetails);
    } else {
      return isOddHalf ? setKickOffTeamGoalScored(matchDetails) : setSecondTeamGoalScored(matchDetails);
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/set-pieces/corners.js
  function setTopRightCornerPositions(matchDetails) {
    const { attack, defence } = assignTeamsAndResetPositions(matchDetails);
    const [pitchWidth] = matchDetails.pitchSize;
    setPlayerXY(attack.players[1], pitchWidth, 0);
    setPlayerXY(attack.players[4], pitchWidth - 10, 20);
    setPlayerXY(defence.players[4], pitchWidth - 12, 10);
    matchDetails.ball.position = [pitchWidth, 0, 0];
    setBallSpecificCornerValue(matchDetails, attack);
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function assignTeamsAndResetPositions(matchDetails) {
    removeBallFromAllPlayers(matchDetails);
    const kickOffTeamKeepYPos = matchDetails.kickOffTeam.players[0].originPOS[1];
    const halfPitchSize = matchDetails.pitchSize[1] / 2;
    const attack = kickOffTeamKeepYPos > halfPitchSize ? matchDetails.kickOffTeam : matchDetails.secondTeam;
    const defence = kickOffTeamKeepYPos > halfPitchSize ? matchDetails.secondTeam : matchDetails.kickOffTeam;
    for (const playerNum of [0, 1, 2, 3, 4]) {
      setPlayerPos(attack.players[playerNum], [...attack.players[playerNum].originPOS]);
      setPlayerPos(defence.players[playerNum], [...defence.players[playerNum].originPOS]);
    }
    for (const playerNum of [5, 6, 7, 8, 9, 10]) {
      setPlayerPos(attack.players[playerNum], getRandomTopPenaltyPosition(matchDetails));
      setPlayerPos(defence.players[playerNum], getRandomTopPenaltyPosition(matchDetails));
    }
    return { attack, defence };
  }
  function setTopLeftCornerPositions(matchDetails) {
    const { attack, defence } = assignTeamsAndResetPositions(matchDetails);
    setPlayerXY(attack.players[1], 0, 0);
    setPlayerXY(attack.players[4], 10, 20);
    setPlayerXY(defence.players[1], 12, 10);
    matchDetails.ball.position = [0, 0, 0];
    setBallSpecificCornerValue(matchDetails, attack);
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setBottomLeftCornerPositions(matchDetails) {
    removeBallFromAllPlayers(matchDetails);
    const [, pitchHeight] = matchDetails.pitchSize;
    const kickOffTeamKeepYPos = matchDetails.kickOffTeam.players[0].originPOS[1];
    const halfPitchSize = matchDetails.pitchSize[1] / 2;
    const attack = kickOffTeamKeepYPos < halfPitchSize ? matchDetails.kickOffTeam : matchDetails.secondTeam;
    const defence = kickOffTeamKeepYPos < halfPitchSize ? matchDetails.secondTeam : matchDetails.kickOffTeam;
    for (const playerNum of [0, 1, 2, 3, 4]) {
      setPlayerPos(attack.players[playerNum], [...attack.players[playerNum].originPOS]);
      setPlayerPos(defence.players[playerNum], [...defence.players[playerNum].originPOS]);
    }
    for (const playerNum of [5, 6, 7, 8, 9, 10]) {
      setPlayerPos(attack.players[playerNum], getRandomBottomPenaltyPosition(matchDetails));
      setPlayerPos(defence.players[playerNum], getRandomBottomPenaltyPosition(matchDetails));
    }
    setPlayerXY(attack.players[1], 0, pitchHeight);
    setPlayerXY(attack.players[4], 10, pitchHeight - 20);
    setPlayerXY(defence.players[1], 12, pitchHeight - 10);
    matchDetails.ball.position = [0, pitchHeight, 0];
    setBallSpecificCornerValue(matchDetails, attack);
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setBottomRightCornerPositions(matchDetails) {
    removeBallFromAllPlayers(matchDetails);
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const kickOffTeamKeepYPos = matchDetails.kickOffTeam.players[0].originPOS[1];
    const halfPitchSize = matchDetails.pitchSize[1] / 2;
    const attack = kickOffTeamKeepYPos < halfPitchSize ? matchDetails.kickOffTeam : matchDetails.secondTeam;
    const defence = kickOffTeamKeepYPos < halfPitchSize ? matchDetails.secondTeam : matchDetails.kickOffTeam;
    for (const playerNum of [0, 1, 2, 3, 4]) {
      setPlayerPos(attack.players[playerNum], [...attack.players[playerNum].originPOS]);
      setPlayerPos(defence.players[playerNum], [...defence.players[playerNum].originPOS]);
    }
    for (const playerNum of [5, 6, 7, 8, 9, 10]) {
      setPlayerPos(attack.players[playerNum], getRandomBottomPenaltyPosition(matchDetails));
      setPlayerPos(defence.players[playerNum], getRandomBottomPenaltyPosition(matchDetails));
    }
    setPlayerXY(attack.players[1], pitchWidth, pitchHeight);
    setPlayerXY(attack.players[4], pitchWidth - 10, pitchHeight - 20);
    setPlayerXY(defence.players[4], pitchWidth - 12, pitchHeight - 10);
    matchDetails.ball.position = [pitchWidth, pitchHeight, 0];
    setBallSpecificCornerValue(matchDetails, attack);
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setBallSpecificCornerValue(matchDetails, attack) {
    attack.players[1].hasBall = true;
    matchDetails.ball.lastTouch.playerName = attack.players[1].name;
    matchDetails.ball.lastTouch.playerID = attack.players[1].playerID;
    matchDetails.ball.lastTouch.teamID = attack.teamID;
    matchDetails.ball.ballOverIterations = [];
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.Player = attack.players[1].playerID;
    matchDetails.ball.withTeam = attack.teamID;
    matchDetails.iterationLog.push(`Corner to - ${attack.name}`);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/set-pieces/restarts.js
  function setLeftKickOffTeamThrowIn(matchDetails, ballIntended) {
    removeBallFromAllPlayers(matchDetails);
    const { kickOffTeam, secondTeam } = matchDetails;
    let [, place] = ballIntended;
    const [, pitchHeight] = matchDetails.pitchSize;
    place = place - 30 < 0 ? 30 : place;
    place = place + 10 > pitchHeight + 1 ? pitchHeight - 10 : place;
    const movement = kickOffTeam.players[5].originPOS[1] - place;
    const oppMovement = 0 - movement;
    ballThrowInPosition(matchDetails, kickOffTeam);
    setPlayerPositions(matchDetails, kickOffTeam, movement);
    setPlayerPositions(matchDetails, secondTeam, oppMovement);
    attackLeftThrowInPlayerPosition(pitchHeight, kickOffTeam, place);
    defenceLeftThrowInPlayerPosition(pitchHeight, secondTeam, place);
    matchDetails.ball.position = [0, place, 0];
    setPlayerXY(kickOffTeam.players[5], matchDetails.ball.position[0], matchDetails.ball.position[1]);
    matchDetails.ball.lastTouch.playerName = kickOffTeam.players[5].name;
    matchDetails.ball.lastTouch.playerID = kickOffTeam.players[5].playerID;
    matchDetails.ball.lastTouch.teamID = kickOffTeam.teamID;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setRightKickOffTeamThrowIn(matchDetails, ballIntended) {
    removeBallFromAllPlayers(matchDetails);
    const { kickOffTeam, secondTeam } = matchDetails;
    let [, place] = ballIntended;
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    place = place - 30 < 0 ? 30 : place;
    place = place + 10 > pitchHeight + 1 ? pitchHeight - 10 : place;
    const movement = kickOffTeam.players[5].originPOS[1] - place;
    const oppMovement = 0 - movement;
    ballThrowInPosition(matchDetails, kickOffTeam);
    setPlayerPositions(matchDetails, kickOffTeam, movement);
    setPlayerPositions(matchDetails, secondTeam, oppMovement);
    attackRightThrowInPlayerPosition(matchDetails.pitchSize, kickOffTeam, place);
    defenceRightThrowInPlayerPosition(matchDetails.pitchSize, secondTeam, place);
    matchDetails.ball.position = [pitchWidth, place, 0];
    setPlayerXY(kickOffTeam.players[5], matchDetails.ball.position[0], matchDetails.ball.position[1]);
    matchDetails.ball.lastTouch.playerName = kickOffTeam.players[5].name;
    matchDetails.ball.lastTouch.playerID = kickOffTeam.players[5].playerID;
    matchDetails.ball.lastTouch.teamID = kickOffTeam.teamID;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setLeftSecondTeamThrowIn(matchDetails, ballIntended) {
    removeBallFromAllPlayers(matchDetails);
    const { kickOffTeam, secondTeam } = matchDetails;
    let [, place] = ballIntended;
    const [, pitchHeight] = matchDetails.pitchSize;
    place = place - 30 < 0 ? 30 : place;
    place = place + 10 > pitchHeight + 1 ? pitchHeight - 10 : place;
    const movement = secondTeam.players[5].originPOS[1] - place;
    const oppMovement = 0 - movement;
    ballThrowInPosition(matchDetails, secondTeam);
    setPlayerPositions(matchDetails, secondTeam, movement);
    setPlayerPositions(matchDetails, kickOffTeam, oppMovement);
    attackLeftThrowInPlayerPosition(pitchHeight, secondTeam, place);
    defenceLeftThrowInPlayerPosition(pitchHeight, kickOffTeam, place);
    matchDetails.ball.position = [0, place, 0];
    setPlayerXY(secondTeam.players[5], matchDetails.ball.position[0], matchDetails.ball.position[1]);
    matchDetails.ball.lastTouch.playerName = secondTeam.players[5].name;
    matchDetails.ball.lastTouch.playerID = secondTeam.players[5].playerID;
    matchDetails.ball.lastTouch.teamID = secondTeam.teamID;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setRightSecondTeamThrowIn(matchDetails, ballIntended) {
    removeBallFromAllPlayers(matchDetails);
    const { kickOffTeam, secondTeam } = matchDetails;
    let [, place] = ballIntended;
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    place = place - 30 < 0 ? 30 : place;
    place = place + 10 > pitchHeight + 1 ? pitchHeight - 10 : place;
    const movement = secondTeam.players[5].originPOS[1] - place;
    const oppMovement = 0 - movement;
    ballThrowInPosition(matchDetails, secondTeam);
    setPlayerPositions(matchDetails, secondTeam, movement);
    setPlayerPositions(matchDetails, kickOffTeam, oppMovement);
    attackRightThrowInPlayerPosition(matchDetails.pitchSize, secondTeam, place);
    defenceRightThrowInPlayerPosition(matchDetails.pitchSize, kickOffTeam, place);
    matchDetails.ball.position = [pitchWidth, place, 0];
    setPlayerXY(secondTeam.players[5], matchDetails.ball.position[0], matchDetails.ball.position[1]);
    matchDetails.ball.lastTouch.playerName = secondTeam.players[5].name;
    matchDetails.ball.lastTouch.playerID = secondTeam.players[5].playerID;
    matchDetails.ball.lastTouch.teamID = secondTeam.teamID;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function ballThrowInPosition(matchDetails, attack) {
    matchDetails.ball.ballOverIterations = [];
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.Player = attack.players[5].playerID;
    matchDetails.ball.withTeam = attack.teamID;
    matchDetails.iterationLog.push(`Throw in to - ${attack.name}`);
  }
  function attackLeftThrowInPlayerPosition(pitchHeight, attack, place) {
    setPlayerXY(attack.players[8], 15, place);
    setPlayerXY(attack.players[7], 10, upToMax(place + 10, pitchHeight));
    setPlayerXY(attack.players[9], 10, upToMin(place - 10, 0));
    attack.players[5].hasBall = true;
  }
  function defenceLeftThrowInPlayerPosition(pitchHeight, defence, place) {
    setPlayerXY(defence.players[5], 20, place);
    setPlayerXY(defence.players[7], 30, upToMax(place + 5, pitchHeight));
    setPlayerXY(defence.players[8], 25, upToMin(place - 15, 0));
    setPlayerXY(defence.players[9], 10, upToMin(place - 30, 0));
  }
  function attackRightThrowInPlayerPosition(pitchSize, attack, place) {
    const [pitchWidth, pitchHeight] = pitchSize;
    setPlayerXY(attack.players[8], pitchWidth - 15, place);
    setPlayerXY(attack.players[7], pitchWidth - 10, upToMax(place + 10, pitchHeight));
    setPlayerXY(attack.players[9], pitchWidth - 10, upToMin(place - 10, 0));
    attack.players[5].hasBall = true;
  }
  function defenceRightThrowInPlayerPosition(pitchSize, defence, place) {
    const [pitchWidth, pitchHeight] = pitchSize;
    setPlayerXY(defence.players[5], pitchWidth - 20, place);
    setPlayerXY(defence.players[7], pitchWidth - 30, upToMax(place + 5, pitchHeight));
    setPlayerXY(defence.players[8], pitchWidth - 25, upToMin(place - 15, 0));
    setPlayerXY(defence.players[9], pitchWidth - 10, upToMin(place - 30, 0));
  }
  function setBottomGoalKick(matchDetails) {
    const { kickOffTeam, secondTeam } = matchDetails;
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const side = kickOffTeam.players[0].originPOS[1] < pitchHeight / 2 ? "top" : "bottom";
    const teamTaking = side === "bottom" ? kickOffTeam : secondTeam;
    removeBallFromAllPlayers(matchDetails);
    resetPlayerPositions(matchDetails);
    setPlayerPositions(matchDetails, teamTaking, -80);
    matchDetails.ball.position = [pitchWidth / 2, pitchHeight - 20, 0];
    setBallSpecificGoalKickValue(matchDetails, teamTaking);
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setTopGoalKick(matchDetails) {
    const { kickOffTeam, secondTeam } = matchDetails;
    const [pitchWidth] = matchDetails.pitchSize;
    const side = kickOffTeam.players[0].originPOS[1] < matchDetails.pitchSize[1] / 2 ? "top" : "bottom";
    const teamTaking = side === "top" ? kickOffTeam : secondTeam;
    removeBallFromAllPlayers(matchDetails);
    resetPlayerPositions(matchDetails);
    setPlayerPositions(matchDetails, teamTaking, 80);
    matchDetails.ball.position = [pitchWidth / 2, 20, 0];
    setBallSpecificGoalKickValue(matchDetails, teamTaking);
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setBallSpecificGoalKickValue(matchDetails, attack) {
    const ballPos = matchDetails.ball.position;
    setPlayerXY(attack.players[0], ballPos[0], ballPos[1]);
    attack.players[0].hasBall = true;
    matchDetails.ball.lastTouch.playerName = attack.players[0].name;
    matchDetails.ball.lastTouch.playerID = attack.players[0].playerID;
    matchDetails.ball.lastTouch.teamID = attack.teamID;
    matchDetails.ball.ballOverIterations = [];
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.Player = attack.players[0].playerID;
    matchDetails.ball.withTeam = attack.teamID;
    matchDetails.iterationLog.push(`Goal Kick to - ${attack.name}`);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/boundaryHandler.js
  function resolveBallLocation(matchDetails, kickteamID, ballIntended) {
    const [bXPOS, bYPOS] = ballIntended;
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const context = getBallResolutionContext(matchDetails, kickteamID);
    const { isKOT, kickOffTeamSide, goalInfo } = context;
    if (isOutOfBoundsX(bXPOS, pitchWidth)) {
      return handleTouchline(matchDetails, ballIntended, bXPOS, isKOT);
    }
    if (bYPOS < 0) {
      return handleTopByline({
        matchDetails,
        ballX: bXPOS,
        pitchWidth: goalInfo.halfMWidth,
        leftGoalPost: goalInfo.leftPost,
        rightGoalPost: goalInfo.rightPost,
        isKOT,
        side: kickOffTeamSide,
        ball: {}
      });
    }
    if (bYPOS > pitchHeight) {
      return handleBottomByline({
        matchDetails,
        ballX: bXPOS,
        pitchWidth: goalInfo.halfMWidth,
        leftGoalPost: goalInfo.leftPost,
        rightGoalPost: goalInfo.rightPost,
        isKOT,
        side: kickOffTeamSide,
        ball: {}
      });
    }
    matchDetails.ballIntended = ballIntended;
    return matchDetails;
  }
  function getBallResolutionContext(matchDetails, kickteamID) {
    const { pitchSize, kickOffTeam } = matchDetails;
    const [pitchWidth, pitchHeight, goalWidth] = pitchSize;
    const halfMWidth = pitchWidth / 2;
    return {
      isKOT: String(kickteamID) === String(kickOffTeam.teamID),
      kickOffTeamSide: kickOffTeam.players[0].originPOS[1] < pitchHeight / 2 ? "top" : "bottom",
      goalInfo: {
        halfMWidth,
        leftPost: halfMWidth - goalWidth / 2,
        rightPost: halfMWidth + goalWidth / 2
      }
    };
  }
  function isOutOfBoundsX(x, width) {
    return x < 0 || x > width;
  }
  function handleTouchline(matchDetails, ballIntended, bXPOS, isKOT) {
    if (bXPOS < 0) {
      return isKOT ? setLeftSecondTeamThrowIn(matchDetails, ballIntended) : setLeftKickOffTeamThrowIn(matchDetails, ballIntended);
    }
    return isKOT ? setRightSecondTeamThrowIn(matchDetails, ballIntended) : setRightKickOffTeamThrowIn(matchDetails, ballIntended);
  }
  var BYLINE_CFG = {
    top: {
      goal: (m, isT) => isT ? setSecondTeamGoalScored(m) : setKickOffTeamGoalScored(m),
      left: setTopLeftCornerPositions,
      right: setTopRightCornerPositions,
      kick: setTopGoalKick
    },
    bottom: {
      goal: (m, isT) => isT ? setKickOffTeamGoalScored(m) : setSecondTeamGoalScored(m),
      left: setBottomLeftCornerPositions,
      right: setBottomRightCornerPositions,
      kick: setBottomGoalKick
    }
  };
  function handleByline(bylineConfig) {
    const { side, matchDetails, ballX: bXPOS, halfMW, leftGoalPost: leftP, rightGoalPost: rightP, isKOT, kickOffTS } = bylineConfig;
    if (side !== "top" && side !== "bottom") {
      throw new Error(`Invalid byline side: ${side}`);
    }
    const cfg = BYLINE_CFG[side];
    const isT = kickOffTS === "top";
    if (isBetween(bXPOS, leftP, rightP)) {
      return cfg.goal(matchDetails, isT);
    }
    const isL = bXPOS < halfMW;
    const isCorner = side === "top" ? isKOT === isT : isKOT !== isT;
    if (isCorner) {
      return isL ? cfg.left(matchDetails) : cfg.right(matchDetails);
    }
    return cfg.kick(matchDetails);
  }
  function handleTopByline(bylineConfig) {
    const { matchDetails: m, ballX: x, pitchWidth: w, leftGoalPost: l, rightGoalPost: r, isKOT: k, side: s } = bylineConfig;
    return handleByline({
      side: "top",
      matchDetails: m,
      ballX: x,
      halfMW: w,
      leftGoalPost: l,
      rightGoalPost: r,
      isKOT: k,
      kickOffTS: s
    });
  }
  function handleBottomByline(bylineConfig) {
    const { matchDetails: m, ballX: x, pitchWidth: w, leftGoalPost: l, rightGoalPost: r, isKOT: k, side: s } = bylineConfig;
    return handleByline({
      side: "bottom",
      matchDetails: m,
      ballX: x,
      halfMW: w,
      leftGoalPost: l,
      rightGoalPost: r,
      isKOT: k,
      kickOffTS: s
    });
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/freekick.js
  function setOneHundredYPos(matchDetails, attack, defence, side) {
    const isTop = side === "top";
    const [, pitchHeight] = matchDetails.pitchSize;
    attack.players[0].hasBall = true;
    const { ball } = matchDetails;
    ball.lastTouch.playerName = attack.players[0].name;
    ball.Player = attack.players[0].playerID;
    ball.withTeam = attack.teamID;
    ball.direction = isTop ? "south" : "north";
    for (const player of attack.players) {
      if (player.position === "GK") {
        setPlayerXY(player, ball.position[0], ball.position[1]);
      } else {
        setPlayerXY(player, player.originPOS[0], player.originPOS[1]);
      }
    }
    for (const player of defence.players) {
      if (player.position === "GK") {
        setPlayerXY(player, player.originPOS[0], player.originPOS[1]);
      } else {
        const newY = isTop ? upToMin(player.originPOS[1] - 100, 0) : upToMax(player.originPOS[1] + 100, pitchHeight);
        setPlayerXY(player, player.originPOS[0], newY);
      }
    }
    matchDetails.endIteration = true;
    return matchDetails;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/setFreekicks.js
  function setOneHundredToHalfwayYPos(matchDetails, attack, defence, side) {
    return repositionForDeepSetPiece(matchDetails, attack, defence, side);
  }
  function setHalfwayToOppositeQtrYPos(matchDetails, attack, defence, side) {
    const isTop = side === "top";
    const { ball, pitchWidth, pitchHeight, kickPlayer } = initializeKickerAndBall(matchDetails, attack);
    ball.direction = getBallDirection(ball.position[0], pitchWidth, isTop);
    setPlayerXY(kickPlayer, ball.position[0], ball.position[1]);
    attack.players.forEach((player) => {
      if (player.position === "GK") {
        const gkY = isTop ? pitchHeight * 0.25 : pitchHeight * 0.75;
        setPlayerXY(player, player.originPOS[0], Math.floor(gkY));
      } else if (player.name !== kickPlayer.name) {
        setPlayerXY(player, player.originPOS[0], player.currentPOS[1]);
        setPlayerXY(player, player.currentPOS[0], Math.floor(calculateAttackerY(player, ball, pitchHeight, isTop)));
      }
    });
    defence.players.forEach((player) => {
      if (["GK", "CB", "LB", "RB"].includes(player.position)) {
        setPlayerPos(player, [...player.originPOS]);
      } else {
        const wallY = isTop ? pitchHeight * 0.75 : pitchHeight * 0.25;
        const targetY = ["CM", "LM", "RM"].includes(player.position) ? wallY : pitchHeight * 0.5;
        setPlayerXY(player, player.originPOS[0], player.currentPOS[1]);
        setPlayerXY(player, player.currentPOS[0], Math.floor(targetY));
      }
    });
    matchDetails.endIteration = true;
    return { matchDetails, kickPlayer };
  }
  function getBallDirection(ballX, pitchWidth, isTop) {
    const ballInCentre = isBetween(ballX, pitchWidth / 4 + 5, pitchWidth - pitchWidth / 4 - 5);
    const ballLeft = isBetween(ballX, 0, pitchWidth / 4 + 4);
    if (isTop) {
      if (ballInCentre) {
        return "south";
      }
      return ballLeft ? "southeast" : "southwest";
    }
    if (ballInCentre) {
      return "north";
    }
    return ballLeft ? "northeast" : "northwest";
  }
  function calculateAttackerY(player, ball, pitchHeight, isTop) {
    if (["CB", "LB", "RB"].includes(player.position)) {
      return isTop ? upToMax(ball.position[1] - 100, pitchHeight * 0.5) : upToMin(ball.position[1] + 100, pitchHeight * 0.5);
    }
    const isMidfielder = ["CM", "LM", "RM"].includes(player.position);
    const pushRange = isMidfielder ? [150, 300] : [300, 400];
    let limitFactor;
    if (isMidfielder) {
      limitFactor = isTop ? 0.75 : 0.25;
    } else {
      limitFactor = isTop ? 0.9 : 0.1;
    }
    const push = getRandomNumber(pushRange[0], pushRange[1]);
    const signedPush = isTop ? push : -push;
    return isTop ? upToMax(ball.position[1] + signedPush, pitchHeight * limitFactor) : upToMin(ball.position[1] + signedPush, pitchHeight * limitFactor);
  }
  function setDeepFreekickBallAndKicker(freekickConfig) {
    const { ball, kickPlayer, teamID, pitchWidth, isTop } = freekickConfig;
    kickPlayer.hasBall = true;
    ball.lastTouch.playerName = kickPlayer.name;
    ball.Player = kickPlayer.playerID;
    ball.withTeam = teamID;
    const ballInCentre = isBetween(ball.position[0], pitchWidth / 4 + 5, pitchWidth - pitchWidth / 4 - 5);
    const ballLeft = isBetween(ball.position[0], 0, pitchWidth / 4 + 4);
    if (isTop) {
      if (ballInCentre) {
        ball.direction = "south";
      } else {
        ball.direction = ballLeft ? "southeast" : "southwest";
      }
    } else {
      ball.direction = ballLeft ? "east" : "west";
    }
    const [ballX, ballY] = ball.position;
    setPlayerXY(kickPlayer, ballX, ballY);
  }
  function initializeKickerAndBall(matchDetails, attack) {
    const { ball, pitchSize } = matchDetails;
    const [pitchWidth, pitchHeight] = pitchSize;
    const kickPlayer = attack.players[5];
    setBallPossession(kickPlayer, ball, attack);
    return { ball, pitchWidth, pitchHeight, kickPlayer };
  }
  function setBallPossession(kickPlayer, ball, attack) {
    kickPlayer.hasBall = true;
    ball.lastTouch.playerName = kickPlayer.name;
    ball.Player = kickPlayer.playerID;
    ball.withTeam = attack.teamID;
  }
  function alignPlayersForPenalty(penaltyAlignConfig) {
    const { isTop, attack, pitchHeight, kickPlayer, matchDetails, defence, ball, pitchWidth } = penaltyAlignConfig;
    return setPenaltyPositions({
      isTop,
      team: attack,
      pitchHeight,
      player: kickPlayer,
      matchDetails,
      opp: defence,
      ball,
      pitchWidth
    });
  }
  function setSetPiecePositions(setPieceConfig) {
    const { attack, pitchHeight, kickPlayer, matchDetails, ball, defence, pitchWidth, isTop } = setPieceConfig;
    return repositionTeamsForSetPiece({
      team: attack,
      pitchHeight,
      player: kickPlayer,
      matchDetails,
      ball,
      opp: defence,
      pitchWidth,
      isTop
    });
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/stats.js
  function recordShotStats(matchDetails, player, isOnTarget) {
    const getStats = (half) => {
      if (half === 0) {
        throw new Error(`You cannot supply 0 as a half`);
      }
      return isEven(half) ? matchDetails.kickOffTeamStatistics : matchDetails.secondTeamStatistics;
    };
    const teamStats = getStats(matchDetails.half);
    const entities = [teamStats, player.stats];
    entities.forEach((entity) => {
      if (typeof entity.shots !== "number") {
        entity.shots.total = (entity.shots.total || 0) + 1;
        if (isOnTarget) {
          entity.shots.on = (entity.shots.on || 0) + 1;
        } else {
          entity.shots.off = (entity.shots.off || 0) + 1;
        }
      }
    });
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/penaltyArea.js
  function checkPositionInBottomPenaltyBox(position, pitchWidth, pitchHeight) {
    const yPos = isBetween(position[0], pitchWidth / 4 - 5, pitchWidth - pitchWidth / 4 + 5);
    const xPos = isBetween(position[1], pitchHeight - pitchHeight / 6 + 5, pitchHeight);
    return yPos && xPos;
  }
  function checkPositionInBottomPenaltyBoxClose(penaltyBoxConfig) {
    const { position, pitchWidth, pitchHeight } = penaltyBoxConfig;
    const yPos = isBetween(position[0], pitchWidth / 3 - 5, pitchWidth - pitchWidth / 3 + 5);
    const xPos = isBetween(position[1], pitchHeight - pitchHeight / 12 + 5, pitchHeight);
    return yPos && xPos;
  }
  function checkPositionInTopPenaltyBox(position, pitchWidth, pitchHeight) {
    const xPos = isBetween(position[0], pitchWidth / 4 - 5, pitchWidth - pitchWidth / 4 + 5);
    const yPos = isBetween(position[1], 0, pitchHeight / 6 - 5);
    return yPos && xPos;
  }
  function checkPositionInTopPenaltyBoxClose(position, pitchWidth, pitchHeight) {
    const xPos = isBetween(position[0], pitchWidth / 3 - 5, pitchWidth - pitchWidth / 3 + 5);
    const yPos = isBetween(position[1], 0, pitchHeight / 12 - 5);
    return yPos && xPos;
  }
  function setPenaltyPositions(penaltyConfig) {
    const { isTop, team: attack, pitchHeight, player: kickPlayer, matchDetails, opp: defence, ball, pitchWidth } = penaltyConfig;
    const getRandomPenaltyPosition = isTop ? getRandomBottomPenaltyPosition : getRandomTopPenaltyPosition;
    positionAttackingTeam({
      isTop,
      attack,
      pitchHeight,
      kickPlayer,
      matchDetails,
      getRandomPenaltyPosition
    });
    positionDefendingTeam({
      isTop,
      defence,
      ball,
      pitchHeight,
      pitchWidth,
      matchDetails,
      getRandomPenaltyPosition
    });
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function positionAttackingTeam({ isTop, attack, pitchHeight, kickPlayer, matchDetails, getRandomPenaltyPosition }) {
    const factorGK = isTop ? 0.25 : 0.75;
    const factorWB = isTop ? 0.66 : 0.33;
    for (const player of attack.players) {
      const { position, name, originPOS } = player;
      if (position === "GK") {
        setPlayerXY(player, originPOS[0], Math.floor(pitchHeight * factorGK));
      } else if (position === "CB") {
        setPlayerXY(player, originPOS[0], Math.floor(pitchHeight * 0.5));
      } else if (position === "LB" || position === "RB") {
        setPlayerXY(player, originPOS[0], Math.floor(pitchHeight * factorWB));
      } else if (name !== kickPlayer.name) {
        setPlayerPos(player, getRandomPenaltyPosition(matchDetails));
      }
    }
  }
  function positionDefendingTeam({ isTop, defence, ball, pitchHeight, pitchWidth, matchDetails, getRandomPenaltyPosition }) {
    let playerSpace = -3;
    const midWayX = Math.floor((ball.position[0] - (ball.position[0] - pitchWidth / 2)) / 2);
    for (const player of defence.players) {
      let midWayY;
      if (isTop) {
        const ballDistanceFromGoalY = pitchHeight - ball.position[1];
        midWayY = Math.floor((ball.position[1] - ballDistanceFromGoalY) / 2);
      } else {
        midWayY = Math.floor(ball.position[1] / 2);
      }
      playerSpace = setDefenderSetPiecePosition({
        player,
        midWayFromBalltoGoalX: midWayX,
        playerSpace,
        midWayFromBalltoGoalY: midWayY,
        matchDetails,
        getRandomPenaltyPosition
      });
    }
  }
  function setDefenderSetPiecePosition(defenderPositionConfig) {
    let { playerSpace } = defenderPositionConfig;
    const { player, midWayFromBalltoGoalX, midWayFromBalltoGoalY, matchDetails, getRandomPenaltyPosition } = defenderPositionConfig;
    if (player.position === "GK") {
      const [origX, origY] = player.originPOS;
      setPlayerXY(player, origX, origY);
    } else if (["CB", "LB", "RB"].includes(player.position)) {
      setPlayerXY(player, midWayFromBalltoGoalX + playerSpace, midWayFromBalltoGoalY);
      playerSpace += 2;
    } else {
      setPlayerPos(player, getRandomPenaltyPosition(matchDetails));
    }
    return playerSpace;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/setPieces.js
  function executePenaltyShot(matchDetails, team, player) {
    player.action = `none`;
    matchDetails.iterationLog.push(`Penalty Taken by: ${player.name}`);
    Object.assign(matchDetails.ball.lastTouch, {
      playerName: player.name,
      playerID: player.playerID,
      teamID: team.teamID
    });
    const isOnTarget = player.skill.penalty_taking > getRandomNumber(0, 100);
    recordShotStats(matchDetails, player, isOnTarget);
    const shotPosition = calculatePenaltyTarget(matchDetails.pitchSize, player, isOnTarget);
    matchDetails.iterationLog.push(`Shot ${isOnTarget ? "On" : "Off"} Target at X: ${shotPosition[0]}`);
    const endPos = calcBallMovementOverTime(matchDetails, player.skill.strength, shotPosition, player);
    checkGoalScored(matchDetails);
    return endPos;
  }
  function calculateAttackingSetPieceY(yPositionConfig) {
    const { player, ballY, isTopDirection: isTop, pitchHeight, isGKExecuting } = yPositionConfig;
    const offset = isTop ? 300 : -300;
    const baseNewY = isGKExecuting ? player.originPOS[1] + offset : player.originPOS[1] + (ballY - player.originPOS[1]) + offset;
    const limit = getAttackingLimit(player.position, isTop, pitchHeight);
    return isTop ? upToMax(baseNewY, limit) : upToMin(baseNewY, limit);
  }
  function calculateDefensiveSetPieceY(attackingYConfig) {
    const { player, isTop, pitchHeight, isGKExecuting } = attackingYConfig;
    if (isGKExecuting) {
      if (player.position === "GK") {
        return player.originPOS[1];
      }
      return isTop ? upToMin(player.originPOS[1] - 100, 0) : upToMax(player.originPOS[1] + 100, pitchHeight);
    }
    if (["GK", "CB", "LB", "RB"].includes(player.position)) {
      return player.originPOS[1];
    }
    return getDefensiveTargetY(player.position, isTop, pitchHeight);
  }
  function executeDeepSetPieceSetup(matchDetails, attack, defence, side) {
    const isTop = side === "top";
    const { ball } = matchDetails;
    const [, pitchHeight] = matchDetails.pitchSize;
    const kickPlayer = selectDeepSetPieceKicker(ball, attack, isTop, pitchHeight);
    const isGKExecuting = kickPlayer.position === "GK";
    setBallPossession(kickPlayer, ball, attack);
    ball.direction = isTop ? "south" : "north";
    repositionAttackers({
      team: attack,
      player: kickPlayer,
      ball,
      isTopDirection: isTop,
      pitchHeight,
      isGKExecuting
    });
    repositionDefenders({
      attack: defence,
      kickPlayer,
      ball,
      isTop,
      pitchHeight,
      isGKExecuting
    });
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function selectDeepSetPieceKicker(ball, attack, isTop, pitchHeight) {
    const goalieAreaLimit = isTop ? pitchHeight * 0.25 + 1 : pitchHeight * 0.75 - 1;
    const goalieToKick = isTop ? ball.position[1] <= goalieAreaLimit : ball.position[1] >= goalieAreaLimit;
    return goalieToKick ? attack.players[0] : attack.players[3];
  }
  function repositionAttackers(repositionConfig) {
    const { team: attack, player: kickPlayer, ball, isTopDirection: isTop, pitchHeight, isGKExecuting } = repositionConfig;
    for (const player of attack.players) {
      if (player.name === kickPlayer.name) {
        setPlayerXY(player, ball.position[0], ball.position[1]);
      } else {
        const finalY = calculateAttackingSetPieceY({
          player,
          ballY: ball.position[1],
          isTopDirection: isTop,
          pitchHeight,
          isGKExecuting
        });
        setPlayerXY(player, player.originPOS[0], player.currentPOS[1]);
        setPlayerXY(player, player.currentPOS[0], Math.floor(finalY));
      }
    }
  }
  function repositionDefenders(attackerRepositionConfig) {
    const { attack, ball, isTop, pitchHeight, isGKExecuting } = attackerRepositionConfig;
    for (const player of attack.players) {
      const targetY = calculateDefensiveSetPieceY({
        player,
        ballY: ball.position[1],
        // Use the actual ball Y coordinate
        isTop,
        // Use the boolean flag
        pitchHeight,
        // Use the actual pitch height
        isGKExecuting
      });
      setPlayerXY(player, player.originPOS[0], player.currentPOS[1]);
      setPlayerXY(player, player.currentPOS[0], Math.floor(targetY));
    }
  }
  function getAttackingLimit(pos2, isTop, pitchHeight) {
    if (pos2 === "GK") {
      return isTop ? pitchHeight * 0.25 : pitchHeight * 0.75;
    }
    if (["CB", "LB", "RB"].includes(pos2)) {
      return pitchHeight * 0.5;
    }
    if (["CM", "LM", "RM"].includes(pos2)) {
      return isTop ? pitchHeight * 0.75 : pitchHeight * 0.25;
    }
    return isTop ? pitchHeight * 0.9 : pitchHeight * 0.1;
  }
  function getDefensiveTargetY(pos2, isTop, pitchHeight) {
    const isMid = ["CM", "LM", "RM"].includes(pos2);
    if (isMid) {
      return isTop ? pitchHeight * 0.75 + 5 : pitchHeight * 0.25 - 5;
    }
    return pitchHeight * 0.5;
  }
  function calculateDefensiveWallX(ballX, pitchWidth) {
    const ballDistanceFromGoalX = ballX - pitchWidth / 2;
    return Math.floor((ballX - ballDistanceFromGoalX) / 2);
  }
  function getAttackerSetPieceY(position, pitchHeight, isTop) {
    if (position === "GK") {
      return Math.floor(pitchHeight * (isTop ? 0.25 : 0.75));
    }
    if (position === "CB") {
      return Math.floor(pitchHeight * 0.5);
    }
    if (position === "LB" || position === "RB") {
      return Math.floor(pitchHeight * (isTop ? 0.66 : 0.33));
    }
    return null;
  }
  function repositionTeamsForSetPiece(config) {
    const { team, player, matchDetails, isTop } = config;
    const getRandomPos = isTop ? getRandomBottomPenaltyPosition : getRandomTopPenaltyPosition;
    applyAttackerPositions(team, config.pitchHeight, isTop);
    fillRemainingAttackers(team, player, matchDetails, getRandomPos);
    applyDefenderPositions(config, matchDetails, getRandomPos);
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function applyAttackerPositions(team, pitchHeight, isTop) {
    for (const p of team.players) {
      const targetY = getAttackerSetPieceY(p.position, pitchHeight, isTop);
      if (targetY !== null) {
        setPlayerXY(p, p.originPOS[0], targetY);
      }
    }
  }
  function fillRemainingAttackers(team, kicker, state, getRandomPos) {
    for (const p of team.players) {
      const isBackLine = getAttackerSetPieceY(p.position, 0, false) !== null;
      if (!isBackLine && p.playerID !== kicker.playerID) {
        setPlayerPos(p, getRandomPos(state));
      }
    }
  }
  function applyDefenderPositions(config, state, getRandomPos) {
    const { opp, ball, pitchHeight, pitchWidth, isTop } = config;
    const wallX = calculateDefensiveWallX(ball.position[0], pitchWidth);
    let pSpace = isTop ? upToMax(ball.position[1] + 3, pitchHeight) : upToMin(ball.position[1] - 3, 0);
    for (const p of opp.players) {
      if (p.position === "GK") {
        setPlayerPos(p, [...p.originPOS]);
      } else if (["CB", "LB", "RB"].includes(p.position)) {
        setPlayerXY(p, wallX, pSpace);
        pSpace = isTop ? pSpace - 2 : pSpace + 2;
      } else {
        setPlayerPos(p, getRandomPos(state));
      }
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/penalty.js
  function calculatePenaltyTarget(pitchSize, player, isOnTarget) {
    const [pitchWidth, pitchHeight] = pitchSize;
    const shotPower = calculatePower(player.skill.strength);
    const target = [0, 0];
    if (isOnTarget) {
      target[0] = getRandomNumber(pitchWidth / 2 - 50, pitchWidth / 2 + 50);
    } else {
      const isLeft = getRandomNumber(0, 10) > 5;
      target[0] = isLeft ? getRandomNumber(0, pitchWidth / 2 - 55) : getRandomNumber(pitchWidth / 2 + 55, pitchWidth);
    }
    const isAttackingDown = player.originPOS[1] > pitchHeight / 2;
    target[1] = isAttackingDown ? player.currentPOS[1] - shotPower : player.currentPOS[1] + shotPower;
    return target;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/possession.js
  function setGoalieHasBall(matchDetails, thisGoalie) {
    const { kickOffTeam, secondTeam } = matchDetails;
    const team = kickOffTeam.players[0].playerID === thisGoalie.playerID ? kickOffTeam : secondTeam;
    const opposition = kickOffTeam.players[0].playerID === thisGoalie.playerID ? secondTeam : kickOffTeam;
    thisGoalie.hasBall = true;
    matchDetails.ball.lastTouch.playerName = thisGoalie.name;
    matchDetails.ball.lastTouch.playerID = thisGoalie.playerID;
    matchDetails.ball.lastTouch.teamID = team.teamID;
    const [x, y] = thisGoalie.currentPOS;
    matchDetails.ball.position = [x, y, 0];
    setPlayerXY(thisGoalie, x, y);
    matchDetails.ball.Player = thisGoalie.playerID;
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.withTeam = team.teamID;
    team.intent = "attack";
    opposition.intent = "defend";
    matchDetails.ball.ballOverIterations = [];
    return matchDetails;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/halftime.js
  function switchSide(matchDetails, team) {
    for (const thisPlayer of team.players) {
      if (!thisPlayer.originPOS) {
        throw new Error(`Each player must have an origin position set`);
      }
      thisPlayer.originPOS[1] = matchDetails.pitchSize[1] - thisPlayer.originPOS[1];
      setPlayerPos(thisPlayer, [...thisPlayer.originPOS]);
      thisPlayer.intentPOS = [...thisPlayer.originPOS];
      thisPlayer.fitness = thisPlayer.fitness < 51 ? round(thisPlayer.fitness + 50, 2) : 100;
    }
    return matchDetails;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/setPositions.js
  function keepInBoundaries(matchDetails, kickteamID, ballIntended) {
    return resolveBallLocation(matchDetails, kickteamID, ballIntended);
  }
  function setPlayerPositions(matchDetails, team, extra) {
    for (const thisPlayer of team.players) {
      if (thisPlayer.position === `GK`) {
        setPlayerPos(thisPlayer, [...thisPlayer.originPOS]);
      } else {
        setPlayerXY(thisPlayer, thisPlayer.originPOS[0], thisPlayer.currentPOS[1]);
        setPlayerXY(thisPlayer, thisPlayer.currentPOS[0], thisPlayer.originPOS[1]);
        const playerPos = thisPlayer.currentPOS[1] + extra;
        if (isBetween(playerPos, -1, matchDetails.pitchSize[1] + 1)) {
          setPlayerXY(thisPlayer, thisPlayer.currentPOS[0], playerPos);
        }
        thisPlayer.intentPOS = [thisPlayer.originPOS[0], playerPos];
      }
    }
  }
  function setIntentPosition(matchDetails, closestPlayer) {
    const { ball, kickOffTeam, secondTeam } = matchDetails;
    const kickOffTeamCheck = kickOffTeam.players.find((thisPlayer) => thisPlayer.playerID === ball.Player);
    const secondTeamCheck = secondTeam.players.find((thisPlayer) => thisPlayer.playerID === ball.Player);
    let kickTeam;
    if (kickOffTeamCheck) {
      kickTeam = kickOffTeam;
    } else if (secondTeamCheck) {
      kickTeam = secondTeam;
    } else {
      kickTeam = void 0;
    }
    let defendingTeam;
    if (!kickTeam) {
      defendingTeam = void 0;
    } else {
      defendingTeam = kickTeam.teamID === kickOffTeam.teamID ? secondTeam : kickOffTeam;
    }
    if (defendingTeam) {
      setDefenceRelativePos(matchDetails, defendingTeam, closestPlayer);
    }
    if (kickTeam) {
      setAttackRelativePos(matchDetails, kickTeam);
    }
    if (!kickTeam && !defendingTeam) {
      setLooseintentPOS(matchDetails, kickOffTeam, closestPlayer);
      setLooseintentPOS(matchDetails, secondTeam, closestPlayer);
    }
  }
  function setLooseintentPOS(matchDetails, thisTeam, closestPlayer) {
    const [, pitchHeight] = matchDetails.pitchSize;
    const { ball } = matchDetails;
    const side = thisTeam.players[0].originPOS[1] < pitchHeight / 2 ? "top" : "bottom";
    for (const player of thisTeam.players) {
      if (player.currentPOS[0] === "NP") {
        throw new Error("No player position!");
      }
      if (shouldMoveDirectlyToBall(player, closestPlayer, ball)) {
        player.intentPOS = [ball.position[0], ball.position[1]];
        continue;
      }
      const newYPOS = calculateTacticalYPOS(player, ball, side, pitchHeight);
      player.intentPOS = [player.originPOS[0], newYPOS];
    }
  }
  function shouldMoveDirectlyToBall(player, closest, ball) {
    if (player.playerID === closest.playerID) {
      return true;
    }
    const diffX = ball.position[0] - player.currentPOS[0];
    const diffY = ball.position[1] - player.currentPOS[1];
    return isBetween(diffX, -16, 16) && isBetween(diffY, -16, 16);
  }
  function calculateTacticalYPOS(player, ball, side, pitchHeight) {
    const diffY = ball.position[1] - player.currentPOS[1];
    const southwards = ["south", "southwest", "southeast"].includes(ball.direction);
    const northwards = ["north", "northwest", "northeast"].includes(ball.direction);
    if (side === "top") {
      if (northwards) {
        return player.originPOS[1];
      }
      if (southwards) {
        return setNewRelativeTopYPOS(pitchHeight, player, 20);
      }
    }
    if (side === "bottom") {
      if (northwards) {
        return setNewRelativeBottomYPOS(pitchHeight, player, -20);
      }
      if (southwards) {
        return isBetween(diffY, -100, 100) ? player.originPOS[1] : moveTowardsBall(player, pitchHeight, diffY);
      }
    }
    if (ball.direction === "wait") {
      return moveTowardsBall(player, pitchHeight, diffY);
    }
    return player.originPOS[1];
  }
  function moveTowardsBall(player, pitchHeight, diffYPOSplayerandball) {
    const side = player.originPOS[1] < pitchHeight / 2 ? "top" : "bottom";
    if (side === "top" && diffYPOSplayerandball > 0) {
      return setNewRelativeTopYPOS(pitchHeight, player, 20);
    }
    if (side === "top" && diffYPOSplayerandball < 0) {
      return setNewRelativeTopYPOS(pitchHeight, player, -20);
    }
    if (side === "bottom" && diffYPOSplayerandball > 0) {
      return setNewRelativeBottomYPOS(pitchHeight, player, 20);
    }
    if (side === "bottom" && diffYPOSplayerandball < 0) {
      return setNewRelativeBottomYPOS(pitchHeight, player, -20);
    }
    return 0;
  }
  function setDefenceRelativePos(matchDetails, defendingTeam, closestPlayer) {
    const [, pitchHeight] = matchDetails.pitchSize;
    const { ball } = matchDetails;
    const teamSide = defendingTeam.players[0].originPOS[1] < pitchHeight / 2 ? "top" : "bottom";
    for (const player of defendingTeam.players) {
      if (player.currentPOS[0] === "NP") {
        throw new Error("No player position!");
      }
      if (isPlayerNearBall(player, [ball.position[0], ball.position[1]], 40)) {
        player.intentPOS = [ball.position[0], ball.position[1]];
        continue;
      }
      if (player.playerID === closestPlayer.playerID) {
        player.intentPOS = [ball.position[0], ball.position[1]];
        continue;
      }
      const ballOnOppositeSide = isBallOnOppositeHalf(ball.position[1], teamSide, pitchHeight);
      if (ballOnOppositeSide) {
        player.intentPOS = calculateShiftedPosition(player, teamSide, pitchHeight);
      } else {
        player.intentPOS = [...player.originPOS];
      }
    }
  }
  function isPlayerNearBall(player, ballPos, delta) {
    const diffX = ballPos[0] - player.currentPOS[0];
    const diffY = ballPos[1] - player.currentPOS[1];
    return isBetween(diffX, -delta, delta) && isBetween(diffY, -delta, delta);
  }
  function isBallOnOppositeHalf(ballY, side, pitchHeight) {
    const halfway = pitchHeight / 2;
    return side === "top" && ballY > halfway || side === "bottom" && ballY < halfway;
  }
  function calculateShiftedPosition(player, side, pitchHeight) {
    let newYPOS;
    if (side === "top") {
      newYPOS = setNewRelativeTopYPOS(pitchHeight, player, 20);
    } else {
      newYPOS = setNewRelativeBottomYPOS(pitchHeight, player, -20);
    }
    return [player.originPOS[0], newYPOS ?? player.originPOS[1]];
  }
  function setAttackRelativePos(matchDetails, kickingTeam) {
    const [, pitchHeight] = matchDetails.pitchSize;
    const side = kickingTeam.players[0].originPOS[1] < pitchHeight / 2 ? "top" : "bottom";
    for (const player of kickingTeam.players) {
      let newYPOS;
      if (side === "top") {
        newYPOS = setNewRelativeTopYPOS(pitchHeight, player, 20);
      }
      if (side === "bottom") {
        newYPOS = setNewRelativeBottomYPOS(pitchHeight, player, -20);
      }
      player.intentPOS = [player.originPOS[0], newYPOS ?? player.originPOS[1]];
    }
  }
  function setNewRelativeTopYPOS(pitchHeight, player, diff) {
    const { position } = player;
    if (position === "GK") {
      return upToMax(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.15));
    }
    if (position === "CB") {
      return upToMax(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.25));
    }
    if (["LB", "RB"].includes(position)) {
      return upToMax(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.66));
    }
    if (position === "CM") {
      return upToMax(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.75));
    }
    return upToMax(player.currentPOS[1] + diff, pitchHeight);
  }
  function setNewRelativeBottomYPOS(pitchHeight, player, diff) {
    const { position } = player;
    if (position === "GK") {
      return upToMin(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.85));
    }
    if (position === "CB") {
      return upToMin(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.75));
    }
    if (["LB", "RB"].includes(position)) {
      return upToMin(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.33));
    }
    if (position === "CM") {
      return upToMin(player.currentPOS[1] + diff, Math.floor(pitchHeight * 0.25));
    }
    return upToMin(player.currentPOS[1] + diff, 0);
  }
  function repositionForDeepSetPiece(matchDetails, attack, defence, side) {
    return executeDeepSetPieceSetup(matchDetails, attack, defence, side);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/setBottomFreekicks.js
  function setBottomFreekick(matchDetails) {
    removeBallFromAllPlayers(matchDetails);
    const { kickOffTeam, secondTeam } = matchDetails;
    const [, pitchHeight] = matchDetails.pitchSize;
    const [, ballY] = matchDetails.ball.position;
    const attack = kickOffTeam.players[0].originPOS[1] > pitchHeight / 2 ? kickOffTeam : secondTeam;
    const defence = kickOffTeam.players[0].originPOS[1] > pitchHeight / 2 ? secondTeam : kickOffTeam;
    const hundredToHalfway = isBetween(ballY, pitchHeight / 2 - 1, pitchHeight - 100);
    const halfwayToLastQtr = isBetween(ballY, pitchHeight / 4, pitchHeight / 2);
    const upperFinalQtr = isBetween(ballY, pitchHeight / 6 - 5, pitchHeight / 4);
    const lowerFinalQtr = isBetween(ballY, 0, pitchHeight / 6 - 5);
    if (ballY > pitchHeight - 100) {
      return setBottomOneHundredYPos(matchDetails, attack, defence);
    }
    if (hundredToHalfway) {
      return setBottomOneHundredToHalfwayYPos(matchDetails, attack, defence);
    }
    if (halfwayToLastQtr) {
      return setBottomHalfwayToTopQtrYPos(matchDetails, attack, defence);
    }
    if (upperFinalQtr) {
      return setBottomUpperQtrCentreYPos(matchDetails, attack, defence);
    }
    if (lowerFinalQtr) {
      return setBottomLowerFinalQtrBylinePos(matchDetails, attack, defence);
    }
    throw new Error(`Unhandled freekick position: ball at [${matchDetails.ball.position.join(", ")}]`);
  }
  function setBottomOneHundredYPos(matchDetails, attack, defence) {
    return setOneHundredYPos(matchDetails, attack, defence, "bottom");
  }
  function setBottomOneHundredToHalfwayYPos(matchDetails, attack, defence) {
    return setOneHundredToHalfwayYPos(matchDetails, attack, defence, "bottom");
  }
  function setBottomHalfwayToTopQtrYPos(matchDetails, attack, defence) {
    const { matchDetails: details } = setHalfwayToOppositeQtrYPos(matchDetails, attack, defence, "bottom");
    return details;
  }
  function setBottomUpperQtrCentreYPos(matchDetails, attack, defence) {
    const { matchDetails: details, kickPlayer } = setHalfwayToOppositeQtrYPos(matchDetails, attack, defence, "bottom");
    const { ball, pitchSize } = details;
    const [pitchWidth, pitchHeight] = pitchSize;
    const ballInCentre = isBetween(ball.position[0], pitchWidth / 4 + 5, pitchWidth - pitchWidth / 4 - 5);
    const ballLeft = isBetween(ball.position[0], 0, pitchWidth / 4 + 4);
    if (ballInCentre) {
      ball.direction = "north";
    } else if (ballLeft) {
      ball.direction = "northeast";
    } else {
      ball.direction = "northwest";
    }
    return alignPlayersForPenalty({
      isTop: false,
      attack,
      pitchHeight,
      kickPlayer,
      matchDetails: details,
      defence,
      ball,
      pitchWidth
    });
  }
  function setBottomLowerFinalQtrBylinePos(matchDetails, attack, defence) {
    const { ball, pitchSize: [pitchWidth, pitchHeight] } = matchDetails;
    const kickPlayer = attack.players[5];
    setDeepFreekickBallAndKicker({
      ball,
      kickPlayer,
      teamID: attack.teamID,
      pitchWidth,
      isTop: false
    });
    return setSetPiecePositions({
      attack,
      pitchHeight,
      kickPlayer,
      matchDetails,
      ball,
      defence,
      pitchWidth,
      isTop: false
    });
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/setTopFreekicks.js
  function setTopFreekick(matchDetails) {
    removeBallFromAllPlayers(matchDetails);
    const { kickOffTeam, secondTeam } = matchDetails;
    const [, pitchHeight] = matchDetails.pitchSize;
    const [, ballY] = matchDetails.ball.position;
    const attack = kickOffTeam.players[0].originPOS[1] < pitchHeight / 2 ? kickOffTeam : secondTeam;
    const defence = kickOffTeam.players[0].originPOS[1] < pitchHeight / 2 ? secondTeam : kickOffTeam;
    const hundredToHalfway = isBetween(ballY, 100, pitchHeight / 2 + 1);
    const halfwayToLastQtr = isBetween(ballY, pitchHeight / 2, pitchHeight - pitchHeight / 4);
    const upperFinalQtr = isBetween(ballY, pitchHeight - pitchHeight / 4, pitchHeight - pitchHeight / 6 - 5);
    const lowerFinalQtr = isBetween(ballY, pitchHeight - pitchHeight / 6 - 5, pitchHeight);
    if (ballY < 101) {
      return setTopOneHundredYPos(matchDetails, attack, defence);
    }
    if (hundredToHalfway) {
      return setTopOneHundredToHalfwayYPos(matchDetails, attack, defence);
    }
    if (halfwayToLastQtr) {
      return setTopHalfwayToBottomQtrYPos(matchDetails, attack, defence);
    }
    if (upperFinalQtr) {
      return setTopBottomQtrCentreYPos(matchDetails, attack, defence);
    }
    if (lowerFinalQtr) {
      return setTopLowerFinalQtrBylinePos(matchDetails, attack, defence);
    }
    throw new Error(`Unhandled freekick position: ball at [${matchDetails.ball.position[0]} ${matchDetails.ball.position[1]}]`);
  }
  function setTopOneHundredYPos(matchDetails, attack, defence) {
    return setOneHundredYPos(matchDetails, attack, defence, "top");
  }
  function setTopOneHundredToHalfwayYPos(matchDetails, attack, defence) {
    return setOneHundredToHalfwayYPos(matchDetails, attack, defence, "top");
  }
  function setTopHalfwayToBottomQtrYPos(matchDetails, attack, defence) {
    const { matchDetails: details } = setHalfwayToOppositeQtrYPos(matchDetails, attack, defence, "top");
    return details;
  }
  function setTopBottomQtrCentreYPos(matchDetails, attack, defence) {
    const { ball, pitchWidth, pitchHeight, kickPlayer } = initializeKickerAndBall(matchDetails, attack);
    setDeepFreekickBallAndKicker({
      ball,
      kickPlayer,
      teamID: attack.teamID,
      pitchWidth,
      isTop: true
    });
    return alignPlayersForPenalty({
      isTop: true,
      attack,
      pitchHeight,
      kickPlayer,
      matchDetails,
      defence,
      ball,
      pitchWidth
    });
  }
  function setTopLowerFinalQtrBylinePos(matchDetails, attack, defence) {
    const { ball, pitchWidth, pitchHeight, kickPlayer } = initializeKickerAndBall(matchDetails, attack);
    const ballLeft = isBetween(ball.position[0], 0, pitchWidth / 4 + 4);
    ball.direction = ballLeft ? "east" : "west";
    const [ballX, ballY] = ball.position;
    setPlayerXY(kickPlayer, ballX, ballY);
    return setSetPiecePositions({
      attack,
      pitchHeight,
      kickPlayer,
      matchDetails,
      ball,
      defence,
      pitchWidth,
      isTop: true
    });
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/set-pieces/penalties.js
  function setSetpieceKickOffTeam(matchDetails) {
    const [, pitchHeight] = matchDetails.pitchSize;
    const ballPosition = matchDetails.ball.position;
    const attackingTowardsTop = matchDetails.kickOffTeam.players[0].currentPOS[1] > pitchHeight / 2;
    if (attackingTowardsTop && inTopPenalty(matchDetails, [ballPosition[0], ballPosition[1]])) {
      matchDetails.kickOffTeamStatistics.penalties++;
      matchDetails.iterationLog.push(`penalty to: ${matchDetails.kickOffTeam.name}`);
      return setTopPenalty(matchDetails);
    } else if (attackingTowardsTop === false && inBottomPenalty(matchDetails, [ballPosition[0], ballPosition[1]])) {
      matchDetails.kickOffTeamStatistics.penalties++;
      matchDetails.iterationLog.push(`penalty to: ${matchDetails.kickOffTeam.name}`);
      return setBottomPenalty(matchDetails);
    } else if (attackingTowardsTop) {
      matchDetails.kickOffTeamStatistics.freekicks++;
      const [bx2, by2] = matchDetails.ball.position;
      matchDetails.iterationLog.push(`freekick to: ${matchDetails.kickOffTeam.name} [${bx2} ${by2}]`);
      return setBottomFreekick(matchDetails);
    }
    matchDetails.kickOffTeamStatistics.freekicks++;
    const [bx, by] = matchDetails.ball.position;
    matchDetails.iterationLog.push(`freekick to: ${matchDetails.kickOffTeam.name} [${bx} ${by}]`);
    return setTopFreekick(matchDetails);
  }
  function setSetpieceSecondTeam(matchDetails) {
    const [, pitchHeight] = matchDetails.pitchSize;
    const ballPosition = matchDetails.ball.position;
    const attackingTowardsTop = matchDetails.secondTeam.players[0].currentPOS[1] > pitchHeight / 2;
    if (attackingTowardsTop && inTopPenalty(matchDetails, [ballPosition[0], ballPosition[1]])) {
      matchDetails.secondTeamStatistics.penalties++;
      matchDetails.iterationLog.push(`penalty to: ${matchDetails.secondTeam.name}`);
      return setTopPenalty(matchDetails);
    } else if (attackingTowardsTop === false && inBottomPenalty(matchDetails, [ballPosition[0], ballPosition[1]])) {
      matchDetails.secondTeamStatistics.penalties++;
      matchDetails.iterationLog.push(`penalty to: ${matchDetails.secondTeam.name}`);
      return setBottomPenalty(matchDetails);
    } else if (attackingTowardsTop) {
      matchDetails.secondTeamStatistics.freekicks++;
      const [bx2, by2] = matchDetails.ball.position;
      matchDetails.iterationLog.push(`freekick to: ${matchDetails.secondTeam.name} [${bx2} ${by2}]`);
      return setBottomFreekick(matchDetails);
    }
    matchDetails.secondTeamStatistics.freekicks++;
    const [bx, by] = matchDetails.ball.position;
    matchDetails.iterationLog.push(`freekick to: ${matchDetails.secondTeam.name} [${bx} ${by}]`);
    return setTopFreekick(matchDetails);
  }
  function setTopPenalty(matchDetails) {
    removeBallFromAllPlayers(matchDetails);
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const kickOffTeamKeepYPos = matchDetails.kickOffTeam.players[0].originPOS[1];
    const halfPitchSize = matchDetails.pitchSize[1] / 2;
    const attack = kickOffTeamKeepYPos > halfPitchSize ? matchDetails.kickOffTeam : matchDetails.secondTeam;
    const defence = kickOffTeamKeepYPos > halfPitchSize ? matchDetails.secondTeam : matchDetails.kickOffTeam;
    const tempArray = [pitchWidth / 2, pitchHeight / 6];
    const shootArray = [pitchWidth / 2, round(pitchHeight / 17.5, 0)];
    setPlayerPos(defence.players[0], [...defence.players[0].originPOS]);
    setPlayerPenaltyPositions(tempArray, attack, defence);
    setBallSpecificPenaltyValue(matchDetails, shootArray, attack);
    matchDetails.ball.direction = `north`;
    attack.intent = `attack`;
    defence.intent = `defend`;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setBottomPenalty(matchDetails) {
    removeBallFromAllPlayers(matchDetails);
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const kickOffTeamKeepYPos = matchDetails.kickOffTeam.players[0].originPOS[1];
    const halfPitchSize = matchDetails.pitchSize[1] / 2;
    const attack = kickOffTeamKeepYPos > halfPitchSize ? matchDetails.secondTeam : matchDetails.kickOffTeam;
    const defence = kickOffTeamKeepYPos > halfPitchSize ? matchDetails.kickOffTeam : matchDetails.secondTeam;
    const tempArray = [pitchWidth / 2, pitchHeight - pitchHeight / 6];
    const shootArray = [
      pitchWidth / 2,
      pitchHeight - round(pitchHeight / 17.5, 0)
    ];
    setPlayerPos(defence.players[0], [...defence.players[0].originPOS]);
    setPlayerPenaltyPositions(tempArray, attack, defence);
    setBallSpecificPenaltyValue(matchDetails, shootArray, attack);
    matchDetails.ball.direction = `south`;
    attack.intent = `attack`;
    defence.intent = `defend`;
    matchDetails.endIteration = true;
    return matchDetails;
  }
  function setPlayerPenaltyPositions(tempArray, attack, defence) {
    let oppxpos = -10;
    let teamxpos = -9;
    for (const num of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      if (num !== 10) {
        if (attack.players[num].currentPOS[0] !== "NP") {
          setPlayerXY(attack.players[num], tempArray[0] + teamxpos, tempArray[1]);
        }
      }
      if (defence.players[num].currentPOS[0] !== "NP") {
        setPlayerXY(defence.players[num], tempArray[0] + oppxpos, tempArray[1]);
      }
      oppxpos += 2;
      teamxpos += 2;
    }
  }
  function setBallSpecificPenaltyValue(matchDetails, shootArray, attack) {
    setPlayerPos(attack.players[0], [...attack.players[0].originPOS]);
    setPlayerPos(attack.players[10], [...shootArray]);
    attack.players[10].hasBall = true;
    attack.players[10].action = `penalty`;
    matchDetails.ball.lastTouch.playerName = attack.players[10].name;
    matchDetails.ball.lastTouch.playerID = attack.players[10].playerID;
    matchDetails.ball.lastTouch.teamID = attack.teamID;
    matchDetails.ball.position = [shootArray[0], shootArray[1]];
    matchDetails.ball.ballOverIterations = [];
    matchDetails.ball.Player = attack.players[10].playerID;
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.withTeam = attack.teamID;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/proximity.js
  function getPlayersInDistance(team, player, pitchSize) {
    const [curX, curY] = destructPos(player.currentPOS);
    const [pitchWidth, pitchHeight] = pitchSize;
    const playersInDistance = [];
    for (const teamPlayer of team.players) {
      const [tpX, tpY] = teamPlayer.currentPOS;
      if (teamPlayer.name !== player.name) {
        if (tpX === "NP") {
          throw new Error("Team player no position!");
        }
        const onPitchX = isBetween(tpX, -1, pitchWidth + 1);
        const onPitchY = isBetween(tpY, -1, pitchHeight + 1);
        if (onPitchX && onPitchY) {
          const playerToPlayerX = curX - tpX;
          const playerToPlayerY = curY - tpY;
          const proximityToBall = Math.abs(playerToPlayerX + playerToPlayerY);
          playersInDistance.push({
            // position: [tpX, tpY] as [number, number],
            currentPOS: [tpX, tpY],
            proximity: proximityToBall,
            name: teamPlayer.name
          });
        }
      }
    }
    playersInDistance.sort(function(a, b) {
      return a.proximity - b.proximity;
    });
    return playersInDistance;
  }
  function closestPlayerToBall(closestPlayer, team, matchDetails) {
    let closestPlayerDetails;
    const { position } = matchDetails.ball;
    for (const thisPlayer of team.players) {
      if (thisPlayer.currentPOS[0] === "NP") {
        throw new Error(`Player ${thisPlayer.name} (ID: ${thisPlayer.playerID}) is 'NP' at an active logic gate!`);
      }
      const ballToPlayerX = Math.abs(thisPlayer.currentPOS[0] - position[0]);
      const ballToPlayerY = Math.abs(thisPlayer.currentPOS[1] - position[1]);
      const proximityToBall = ballToPlayerX + ballToPlayerY;
      if (proximityToBall < closestPlayer.position) {
        closestPlayer.name = thisPlayer.name;
        closestPlayer.position = proximityToBall;
        closestPlayerDetails = thisPlayer;
      }
    }
    if (closestPlayerDetails === void 0) {
      throw new Error("Player undefined!");
    }
    setIntentPosition(matchDetails, closestPlayerDetails);
    matchDetails.iterationLog.push(`Closest Player to ball: ${closestPlayerDetails.name}`);
  }
  function setClosePlayerTakesBall(matchDetails, thisPlayer, team, opp) {
    if (thisPlayer.offside) {
      matchDetails.iterationLog.push(`${thisPlayer.name} is offside`);
      if (team.name === matchDetails.kickOffTeam.name) {
        setSetpieceKickOffTeam(matchDetails);
      } else {
        setSetpieceSecondTeam(matchDetails);
      }
    } else {
      thisPlayer.hasBall = true;
      matchDetails.ball.lastTouch.playerName = thisPlayer.name;
      matchDetails.ball.lastTouch.playerID = thisPlayer.playerID;
      matchDetails.ball.lastTouch.teamID = team.teamID;
      matchDetails.ball.ballOverIterations = [];
      const [posX, posY] = destructPos(thisPlayer.currentPOS);
      matchDetails.ball.position = [posX, posY];
      matchDetails.ball.Player = thisPlayer.playerID;
      matchDetails.ball.withPlayer = true;
      matchDetails.ball.withTeam = team.teamID;
      team.intent = `attack`;
      opp.intent = `defend`;
    }
  }
  function closestPlayerActionBallX(ballToPlayerX) {
    if (isBetween(ballToPlayerX, -30, 30) === false) {
      if (ballToPlayerX > 29) {
        return 29;
      }
      return -29;
    }
    return ballToPlayerX;
  }
  function closestPlayerActionBallY(ballToPlayerY) {
    if (isBetween(ballToPlayerY, -30, 30) === false) {
      if (ballToPlayerY > 29) {
        return 29;
      }
      return -29;
    }
    return ballToPlayerY;
  }
  function closestPlayerToPosition(player, team, position) {
    let currentDifference = 1e6;
    const playerInformation = {
      thePlayer: createPlayer("GK"),
      proxPOS: [0, 0],
      proxToBall: 0
    };
    for (const thisPlayer of team.players) {
      if (player.playerID !== thisPlayer.playerID) {
        if (thisPlayer.currentPOS[0] === "NP") {
          throw new Error("Player no position!");
        }
        const ballToPlayerX = thisPlayer.currentPOS[0] - position[0];
        const ballToPlayerY = thisPlayer.currentPOS[1] - position[1];
        const proximityToBall = Math.abs(ballToPlayerX) + Math.abs(ballToPlayerY);
        if (proximityToBall < currentDifference) {
          playerInformation.thePlayer = thisPlayer;
          playerInformation.proxPOS = [ballToPlayerX, ballToPlayerY];
          playerInformation.proxToBall = proximityToBall;
          currentDifference = proximityToBall;
        }
      }
    }
    return playerInformation;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/utils/assert.js
  function assert(condition, message) {
    if (!condition) {
      throw new Error(`[Assertion Failed]: ${message}`);
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/ai/threatAnalysis.js
  function getAttackingThreatWeights(matchDetails, player, team, opposition) {
    const curPOS = validatePlayerPosition(player.currentPOS);
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const oppInfo = closestPlayerToPosition(player, opposition, curPOS);
    const tmateInfo = closestPlayerToPosition(player, team, curPOS);
    const tmateProximity = [
      Math.abs(tmateInfo.proxPOS[0]),
      Math.abs(tmateInfo.proxPOS[1])
    ];
    assert(oppInfo.thePlayer, "Player should be defined");
    const closeOppPOS = oppInfo.thePlayer.currentPOS;
    if (checkPositionInTopPenaltyBoxClose(curPOS, pitchWidth, pitchHeight)) {
      return handleDeepBoxThreat({
        oppInfo,
        tmateProx: tmateProximity,
        currentPOS: destructPos(player.currentPOS),
        closeOppPOS: destructPos(closeOppPOS),
        skill: player.skill
      });
    }
    if (isBetween(curPOS[1], 0, player.skill.shooting)) {
      return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0];
    }
    if (checkOppositionAhead(closeOppPOS, player.currentPOS)) {
      return [20, 0, 0, 0, 0, 0, 0, 80, 0, 0, 0];
    }
    return [50, 0, 20, 20, 0, 0, 0, 10, 0, 0, 0];
  }
  function validatePlayerPosition(pos2) {
    if (pos2[0] === "NP") {
      throw new Error("No player position!");
    }
    return pos2;
  }
  function handleDeepBoxThreat(deepThreatConfig) {
    const { oppInfo, tmateProx, currentPOS, closeOppPOS, skill } = deepThreatConfig;
    if (oppositionNearContext(oppInfo, 20, 20)) {
      return handlePressuredBoxDecision(tmateProx, currentPOS, closeOppPOS, skill);
    }
    if (checkTeamMateSpaceClose({
      tmateProximity: tmateProx,
      lowX: -10,
      highX: 10,
      lowY: -4,
      highY: 10
    })) {
      if (isBetween(currentPOS[1], 0, skill.shooting / 2)) {
        return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0];
      }
      if (isBetween(currentPOS[1], 0, skill.shooting)) {
        return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0];
      }
      return [20, 0, 30, 0, 0, 0, 0, 30, 20, 0, 0];
    }
    if (isBetween(currentPOS[1], 0, skill.shooting / 2)) {
      return [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (isBetween(currentPOS[1], 0, skill.shooting)) {
      return [60, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0];
    }
    return [30, 0, 0, 0, 0, 0, 0, 40, 30, 0, 0];
  }
  function handlePressuredBoxDecision(tmateProx, currentPOS, closeOppPOS, skill) {
    if (checkOppositionAhead(closeOppPOS, currentPOS)) {
      if (checkTeamMateSpaceClose(getSpaceConfig(tmateProx, true))) {
        return [20, 0, 70, 0, 0, 0, 0, 10, 0, 0, 0];
      }
      if (isBetween(currentPOS[1], 0, skill.shooting / 2)) {
        return [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }
      if (isBetween(currentPOS[1], 0, skill.shooting)) {
        return [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0];
      }
      return [20, 0, 0, 0, 0, 0, 0, 40, 20, 0, 0];
    }
    if (checkTeamMateSpaceClose(getSpaceConfig(tmateProx, false))) {
      if (isBetween(currentPOS[1], 0, skill.shooting / 2)) {
        return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0];
      }
      if (isBetween(currentPOS[1], 0, skill.shooting)) {
        return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0];
      }
      return [20, 0, 30, 0, 0, 0, 0, 30, 20, 0, 0];
    }
    if (isBetween(currentPOS[1], 0, skill.shooting / 2)) {
      return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (isBetween(currentPOS[1], 0, skill.shooting)) {
      return [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0];
    }
    return [20, 0, 0, 0, 0, 0, 0, 50, 30, 0, 0];
  }
  function getSpaceConfig(tmateProx, isOppositionAhead) {
    if (isOppositionAhead) {
      return {
        tmateProximity: tmateProx,
        lowX: -10,
        highX: 10,
        lowY: -10,
        highY: 10
      };
    }
    return {
      tmateProximity: tmateProx,
      lowX: -10,
      highX: 10,
      lowY: -4,
      highY: 10
    };
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/intent/utils.js
  function calculateShootingThresholds(shootingSkill, pitchHeight) {
    return {
      halfRange: pitchHeight - shootingSkill / 2,
      fullRange: pitchHeight - shootingSkill
    };
  }
  function getRangeBasedWeights(rangeConfig) {
    const { yPos, halfRange, shotRange, pitchHeight, weightMap } = rangeConfig;
    if (isBetween(yPos, halfRange, pitchHeight)) {
      return weightMap.half;
    }
    if (isBetween(yPos, shotRange, pitchHeight)) {
      return weightMap.shot;
    }
    return weightMap.fallback;
  }
  function resolveBoxWeights(ctx2) {
    const { tmateProximity, yPos, halfRange, shotRange, pitchHeight, spaceConfig, spaceWeights, defaultWeights } = ctx2;
    const useSpaceWeights = checkTeamMateSpaceClose({
      tmateProximity,
      lowX: spaceConfig[0],
      highX: spaceConfig[1],
      lowY: spaceConfig[2],
      highY: spaceConfig[3]
    });
    return getRangeBasedWeights({
      yPos,
      halfRange,
      shotRange,
      pitchHeight,
      weightMap: useSpaceWeights ? spaceWeights : defaultWeights
    });
  }
  function resolveZonePressure(zonePressureConfig) {
    const { playerInfo, pressureWeights, openWeights, distX = 10, distY = 10 } = zonePressureConfig;
    return oppositionNearContext(playerInfo, distX, distY) ? pressureWeights : openWeights;
  }
  function analyzePlayerSurroundings(player, playerPos, team, opposition) {
    const oppInfo = closestPlayerToPosition(player, opposition, playerPos);
    const tmateInfo = closestPlayerToPosition(player, team, playerPos);
    const tmateProximity = [
      Math.abs(tmateInfo.proxPOS[0]),
      Math.abs(tmateInfo.proxPOS[1])
    ];
    const oppPos = destructPos(oppInfo.thePlayer.currentPOS);
    return { oppInfo, tmateProximity, oppPos };
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/intent/zones.js
  function handleGKIntent(zonePressureConfig) {
    const { playerInfo } = zonePressureConfig;
    return resolveZonePressure({
      playerInfo,
      pressureWeights: [0, 0, 10, 0, 0, 0, 0, 10, 0, 40, 40],
      openWeights: [0, 0, 50, 0, 0, 0, 0, 10, 0, 20, 20],
      distX: 10,
      distY: 25
    });
  }
  function handleAttackingThirdIntent(playerInfo, _) {
    return resolveZonePressure({
      playerInfo,
      pressureWeights: [30, 20, 20, 10, 0, 0, 0, 20, 0, 0, 0],
      openWeights: [70, 10, 10, 0, 0, 0, 0, 10, 0, 0, 0]
    });
  }
  function handleMiddleThirdIntent(playerInfo, position, skill) {
    if (oppositionNearContext(playerInfo, 10, 10)) {
      return [0, 20, 30, 20, 0, 0, 20, 0, 0, 0, 10];
    }
    if (skill.shooting > 85) {
      return [10, 10, 30, 0, 0, 0, 50, 0, 0, 0, 0];
    }
    const isMidfielder = ["LM", "CM", "RM"].includes(position);
    if (isMidfielder) {
      return [0, 10, 10, 10, 0, 0, 0, 30, 40, 0, 0];
    }
    if (position === "ST") {
      return [0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0];
    }
    return [0, 0, 10, 0, 0, 0, 0, 60, 20, 0, 10];
  }
  function handleBottomDefensiveThirdIntent(playerInfo, position) {
    return resolveDefensiveIntent(playerInfo, position, [0, 0, 30, 0, 0, 0, 0, 50, 0, 10, 10]);
  }
  function handleDefensiveThirdIntent(playerInfo, position) {
    return resolveDefensiveIntent(playerInfo, position, [0, 0, 40, 0, 0, 0, 0, 30, 0, 20, 10]);
  }
  function resolveDefensiveIntent(playerInformation, position, fallbackWeights) {
    if (oppositionNearContext(playerInformation, 10, 10)) {
      return [0, 0, 0, 0, 0, 0, 0, 10, 0, 70, 20];
    }
    if (["LM", "CM", "RM"].includes(position)) {
      return [0, 0, 30, 0, 0, 0, 0, 30, 40, 0, 0];
    }
    if (position === "ST") {
      return [0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0];
    }
    return fallbackWeights;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/intent/config.js
  var STANDARD_SPACE_WEIGHTS = {
    half: [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0],
    shot: [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0],
    fallback: [20, 0, 30, 0, 0, 0, 0, 30, 20, 0, 0]
  };
  var rangeBasedWeights = {
    half: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    shot: [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0],
    fallback: [20, 0, 0, 0, 0, 0, 0, 40, 20, 0, 0]
  };
  var boxWeights = {
    half: [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0],
    shot: [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0],
    fallback: [20, 0, 0, 0, 0, 0, 0, 50, 30, 0, 0]
  };
  var boxWeightsToRestore = {
    half: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    shot: [60, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0],
    fallback: [30, 0, 0, 0, 0, 0, 0, 40, 30, 0, 0]
  };

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/intent/penaltyBox.js
  function handleInPenaltyBox(penaltyBoxContext) {
    const { playerInformation, tmateProximity, currentPOS, pos: pos2, oppCurPos, halfRange, shotRange, pitchHeight } = penaltyBoxContext;
    if (oppositionNearContext(playerInformation, 6, 6)) {
      return handleUnderPressureInBox({
        tmateProximity,
        currentPOS,
        pos: pos2,
        oppCurPos,
        halfRange,
        shotRange,
        pitchHeight
      });
    }
    return resolveBoxWeights({
      tmateProximity,
      yPos: currentPOS[1],
      // Mapping original currentPOS[1] to yPos
      halfRange,
      shotRange,
      pitchHeight,
      spaceConfig: [-10, 10, -4, 10],
      spaceWeights: STANDARD_SPACE_WEIGHTS,
      defaultWeights: boxWeightsToRestore
    });
  }
  function handleUnderPressureInBox(boxPressureContext) {
    const { tmateProximity, currentPOS, pos: pos2, oppCurPos, halfRange, shotRange, pitchHeight } = boxPressureContext;
    const yPos = currentPOS[1];
    if (checkOppositionBelow(oppCurPos, pos2)) {
      if (checkTeamMateSpaceClose({
        tmateProximity,
        lowX: -10,
        highX: 10,
        lowY: -10,
        highY: 10
      })) {
        return [20, 0, 70, 0, 0, 0, 0, 10, 0, 0, 0];
      }
      return getRangeBasedWeights({
        yPos,
        halfRange,
        shotRange,
        pitchHeight,
        weightMap: rangeBasedWeights
      });
    }
    return resolveBoxWeights({
      tmateProximity,
      yPos,
      halfRange,
      shotRange,
      pitchHeight,
      spaceConfig: [-10, 10, -4, 10],
      spaceWeights: STANDARD_SPACE_WEIGHTS,
      defaultWeights: boxWeights
    });
  }
  function handleOutsidePenaltyBox(playerInformation, currentPOS, shotRange, pitchHeight) {
    const playerY = currentPOS[1];
    if (isBetween(playerY, shotRange, pitchHeight)) {
      return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0];
    }
    return resolveZonePressure({
      playerInfo: playerInformation,
      pressureWeights: [10, 0, 70, 0, 0, 0, 0, 20, 0, 0, 0],
      openWeights: [70, 0, 20, 0, 0, 0, 0, 10, 0, 0, 0]
    });
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/intentLogic.js
  function getAttackingIntentWeights(ctx2) {
    const { matchDetails, player, team, opp: opposition } = ctx2;
    const playerPos = destructPos(player.currentPOS);
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const { oppInfo, tmateProximity, oppPos } = analyzePlayerSurroundings(player, playerPos, team, opposition);
    const { halfRange, fullRange } = calculateShootingThresholds(player.skill.shooting, pitchHeight);
    if (checkPositionInBottomPenaltyBoxClose({
      position: playerPos,
      pitchWidth,
      pitchHeight
    })) {
      const [curX, curY] = player.currentPOS;
      if (curX === "NP") {
        throw new Error("Not playing");
      }
      return handleInPenaltyBox({
        playerInformation: oppInfo,
        tmateProximity,
        currentPOS: [curX, curY],
        pos: playerPos,
        oppCurPos: oppPos,
        halfRange,
        shotRange: fullRange,
        pitchHeight
      });
    }
    return handleOutsidePenaltyBox(oppInfo, player.currentPOS, fullRange, pitchHeight);
  }
  function getPlayerActionWeights(ctx2) {
    const { matchDetails, player, team, opp: opposition } = ctx2;
    const { position, currentPOS, skill } = player;
    const pos2 = destructPos(currentPOS);
    const [, playerY] = pos2;
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const playerInformation = closestPlayerToPosition(player, opposition, pos2);
    if (position === "GK") {
      return handleGKIntent({ playerInfo: playerInformation });
    }
    if (onBottomCornerBoundary(pos2, pitchWidth, pitchHeight)) {
      return [0, 0, 20, 80, 0, 0, 0, 0, 0, 0, 0];
    }
    if (checkPositionInBottomPenaltyBox(pos2, pitchWidth, pitchHeight)) {
      return getAttackingIntentWeights({ matchDetails, player, team, opp: opposition });
    }
    if (isBetween(playerY, pitchHeight * (2 / 3), pitchHeight * (5 / 6) + 5)) {
      return handleAttackingThirdIntent(playerInformation, currentPOS);
    }
    if (isBetween(playerY, pitchHeight / 3, pitchHeight * (2 / 3))) {
      return handleMiddleThirdIntent(playerInformation, position, skill);
    }
    return handleDefensiveThirdIntent(playerInformation, position);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/playerSelectors.js
  function resolveBestPassOption(playersArray, side, pitchHeight = 1050) {
    const attackingHalfCandidates = playersArray.filter((p) => p.proximity < pitchHeight / 2);
    const tempArray = attackingHalfCandidates.length > 0 ? attackingHalfCandidates : playersArray;
    let currentRand = getRandomNumber(0, tempArray.length - 1);
    let bestPlayer = tempArray[currentRand];
    function compareAndRefreshSelection() {
      if (currentRand > 5) {
        currentRand = getRandomNumber(0, tempArray.length - 1);
        const challenger = tempArray[currentRand];
        const isBetter = side === "top" ? challenger.proximity > bestPlayer.proximity : challenger.proximity < bestPlayer.proximity;
        if (isBetter) {
          bestPlayer = challenger;
        }
      }
    }
    compareAndRefreshSelection();
    compareAndRefreshSelection();
    return bestPlayer;
  }
  function getPlayerTeam(player, matchDetails) {
    const isKickOff = matchDetails.kickOffTeam.players.some((p) => p.playerID === player.playerID);
    return {
      team: isKickOff ? matchDetails.kickOffTeam : matchDetails.secondTeam,
      opp: isKickOff ? matchDetails.secondTeam : matchDetails.kickOffTeam
    };
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/findPossActions.js
  function findPossActions(player, matchDetails) {
    const { team, opp: opposition } = getPlayerTeam(player, matchDetails);
    const [ballX, ballY] = matchDetails.ball.position;
    const possibleActions = populateActionsJSON();
    const [, pitchHeight] = matchDetails.pitchSize;
    let params;
    const { hasBall, originPOS } = player;
    if (hasBall === false) {
      params = playerDoesNotHaveBall(player, ballX, ballY, matchDetails);
    } else if (originPOS[1] > pitchHeight / 2) {
      params = bottomTeamPlayerHasBall(matchDetails, player, team, opposition);
    } else {
      params = topTeamPlayerHasBall(matchDetails, player, team, opposition);
    }
    return populatePossibleActions(possibleActions, params);
  }
  function topTeamPlayerHasBall(matchDetails, player, team, opposition) {
    return getPlayerActionWeights({ matchDetails, player, team, opp: opposition });
  }
  function playerDoesNotHaveBall(player, ballX, ballY, matchDetails) {
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const { position, currentPOS, originPOS } = player;
    const curPos = destructPos(currentPOS);
    if (position === "GK") {
      return [0, 0, 0, 0, 0, 0, 0, 60, 40, 0, 0];
    } else if (isBetween(ballX, -20, 20) && isBetween(ballY, -20, 20)) {
      return noBallNotGK2CloseBall({
        matchDetails,
        currentPOS: curPos,
        originPOS,
        pitchWidth,
        pitchHeight
      });
    } else if (isBetween(ballX, -40, 40) && isBetween(ballY, -40, 40)) {
      return noBallNotGK4CloseBall({
        matchDetails,
        currentPOS: curPos,
        originPOS,
        pitchWidth,
        pitchHeight
      });
    } else if (isBetween(ballX, -80, 80) && isBetween(ballY, -80, 80)) {
      if (matchDetails.ball.withPlayer === false) {
        return [0, 0, 0, 0, 0, 0, 0, 60, 40, 0, 0];
      }
      return [0, 0, 0, 0, 0, 40, 0, 30, 30, 0, 0];
    }
    return [0, 0, 0, 0, 0, 10, 0, 50, 30, 0, 0];
  }
  function populatePossibleActions(possibleActions, weights) {
    weights.forEach((weight, index) => {
      if (possibleActions[index]) {
        possibleActions[index].points = weight;
      }
    });
    return possibleActions;
  }
  function populateActionsJSON() {
    return [
      {
        name: "shoot",
        points: 0
      },
      {
        name: "throughBall",
        points: 0
      },
      {
        name: "pass",
        points: 0
      },
      {
        name: "cross",
        points: 0
      },
      {
        name: "tackle",
        points: 0
      },
      {
        name: "intercept",
        points: 0
      },
      {
        name: "slide",
        points: 0
      },
      {
        name: "run",
        points: 0
      },
      {
        name: "sprint",
        points: 0
      },
      {
        name: "cleared",
        points: 0
      },
      {
        name: "boot",
        points: 0
      }
    ];
  }
  function selectAction(possibleActions) {
    let goodActions = [];
    for (const thisAction of possibleActions) {
      const tempArray = new Array(thisAction.points).fill(thisAction.name);
      goodActions = goodActions.concat(tempArray);
    }
    if (!goodActions[0]) {
      return "run";
    }
    return goodActions[getRandomNumber(0, goodActions.length - 1)];
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/tackle.js
  function setPostTacklePosition(postTackleConfig) {
    const { matchDetails, winningPlayer: winningPlyr, losingPlayer: losePlayer, increment } = postTackleConfig;
    const [, pitchHeight] = matchDetails.pitchSize;
    if (losePlayer.originPOS[1] > pitchHeight / 2) {
      setPlayerXY(losePlayer, losePlayer.currentPOS[0], upToMin(losePlayer.currentPOS[1] - increment, 0));
      const { ball } = matchDetails;
      const [bx, , bz] = ball.position;
      const by = upToMin(matchDetails.ball.position[1] - increment, 0);
      setBallPosition(ball, bx, by, bz);
      setPlayerXY(winningPlyr, winningPlyr.currentPOS[0], upToMax(winningPlyr.currentPOS[1] + increment, pitchHeight));
    } else {
      setPlayerXY(losePlayer, losePlayer.currentPOS[0], upToMax(losePlayer.currentPOS[1] + increment, pitchHeight));
      const { ball } = matchDetails;
      const [bx, , bz] = ball.position;
      const by = upToMax(matchDetails.ball.position[1] + increment, pitchHeight);
      setBallPosition(ball, bx, by, bz);
      setPlayerXY(winningPlyr, winningPlyr.currentPOS[0], upToMin(winningPlyr.currentPOS[1] - increment, 0));
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/booking.js
  function setFoul(matchDetails, team, player, thatPlayer) {
    matchDetails.iterationLog.push(`Foul against: ${thatPlayer.name}`);
    if (player.stats.tackles.fouls === void 0) {
      player.stats.tackles.fouls = 0;
    }
    player.stats.tackles.fouls++;
    if (team.teamID === matchDetails.kickOffTeam.teamID) {
      matchDetails.kickOffTeamStatistics.fouls++;
    } else {
      matchDetails.secondTeamStatistics.fouls++;
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/validation/action.js
  var BALL_ACTIONS = ["shoot", "throughBall", "pass", "cross", "cleared", "boot", "penalty"];
  var DEFENSIVE_ACTIONS = ["tackle", "intercept", "slide"];
  var MOVEMENT_ACTIONS = ["run", "sprint"];
  var VALID_ACTIONS = [...BALL_ACTIONS, ...DEFENSIVE_ACTIONS, ...MOVEMENT_ACTIONS];
  function validateAndResolvePlayerAction(actionConfig) {
    const { matchDetails, player: thisPlayer, fallbackAction } = actionConfig;
    const providedAction = thisPlayer.action || "unassigned";
    if (providedAction === "none") {
      return fallbackAction;
    }
    if (!VALID_ACTIONS.includes(providedAction)) {
      throw new Error(`Invalid player action for ${thisPlayer.name}: ${providedAction}`);
    }
    const hasBall = thisPlayer.playerID === matchDetails.ball.Player;
    if (!hasBall) {
      if (BALL_ACTIONS.includes(providedAction)) {
        logger.error(`${thisPlayer.name} doesnt have the ball so cannot ${providedAction} -action: run`);
        return "run";
      }
      return providedAction;
    }
    if (DEFENSIVE_ACTIONS.includes(providedAction)) {
      const randomBallAction = BALL_ACTIONS[getRandomNumber(0, 5)];
      logger.error(`${thisPlayer.name} has the ball so cannot ${providedAction} -action: ${randomBallAction}`);
      return randomBallAction;
    }
    return providedAction;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions.js
  function bottomTeamPlayerHasBall(matchDetails, player, team, opposition) {
    const { position, currentPOS, skill } = player;
    const pos2 = destructPos(currentPOS);
    const [, posY] = pos2;
    const playerInformation = closestPlayerToPosition(player, opposition, pos2);
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    if (position === "GK") {
      return handleBottomGKIntent(playerInformation);
    }
    if (onTopCornerBoundary(pos2, pitchWidth)) {
      return [0, 0, 20, 80, 0, 0, 0, 0, 0, 0, 0];
    }
    if (checkPositionInTopPenaltyBox(pos2, pitchWidth, pitchHeight)) {
      return getAttackingThreatWeights(matchDetails, player, team, opposition);
    }
    if (isBetween(posY, pitchHeight / 6 - 5, pitchHeight / 3)) {
      return handleBottomAttackingThirdIntent(playerInformation);
    }
    if (isBetween(posY, pitchHeight / 3, 2 * (pitchHeight / 3))) {
      return bottomTeamPlayerHasBallInMiddle(playerInformation, position, skill);
    }
    return handleBottomDefensiveThirdIntent(playerInformation, position);
  }
  function bottomTeamPlayerHasBallInMiddle(playerInformation, position, skill) {
    if (oppositionNearContext(playerInformation, 10, 10)) {
      return [0, 20, 30, 20, 0, 0, 0, 20, 0, 0, 10];
    } else if (skill.shooting > 85) {
      return [10, 10, 30, 0, 0, 0, 0, 50, 0, 0, 0];
    } else if (position === "LM" || position === "CM" || position === "RM") {
      return [0, 10, 10, 10, 0, 0, 0, 30, 40, 0, 0];
    } else if (position === "ST") {
      return [0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0];
    }
    return [0, 0, 10, 0, 0, 0, 0, 60, 20, 0, 10];
  }
  function oppositionNearContext(context, distX, distY) {
    return Math.abs(context.proxPOS[0]) < distX && Math.abs(context.proxPOS[1]) < distY;
  }
  function checkTeamMateSpaceClose(spaceConfig) {
    const { tmateProximity, lowX, highX, lowY, highY } = spaceConfig;
    return isBetween(tmateProximity[0], lowX, highX) && isBetween(tmateProximity[1], lowY, highY);
  }
  function checkOppositionAhead(closePlayerPosition, currentPOS) {
    const [closeX, closeY] = destructPos(closePlayerPosition);
    const [currentX, currentY] = destructPos(currentPOS);
    const closePlyX = isBetween(closeX, currentX - 4, currentX + 4);
    return closePlyX && closeY < currentY;
  }
  function checkOppositionBelow(closePlayerPosition, currentPOS) {
    const closePlyX = isBetween(closePlayerPosition[0], currentPOS[0] - 4, currentPOS[0] + 4);
    return closePlyX && closePlayerPosition[1] > currentPOS[1];
  }
  function resolveNoBallNotGKIntent(intentConfig) {
    const { matchDetails, currentPOS, pitchWidth, pitchHeight, isBottomTeam, weights } = intentConfig;
    const curPos = destructPos(currentPOS);
    const inPenaltyBox = isBottomTeam ? checkPositionInBottomPenaltyBox(curPos, pitchWidth, pitchHeight) : checkPositionInTopPenaltyBox(curPos, pitchWidth, pitchHeight);
    if (matchDetails.ball.withPlayer === false) {
      return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0];
    }
    if (inPenaltyBox) {
      return weights.inBox;
    }
    return weights.fallback;
  }
  function noBallNotGK4CloseBall(positionConfig) {
    const { matchDetails, currentPOS, originPOS, pitchWidth, pitchHeight } = positionConfig;
    const isBottomTeam = originPOS[1] > pitchHeight / 2;
    return resolveNoBallNotGKIntent({
      matchDetails,
      currentPOS,
      pitchWidth,
      pitchHeight,
      isBottomTeam,
      weights: {
        inBox: [0, 0, 0, 0, 40, 0, 20, 10, 30, 0, 0],
        fallback: [0, 0, 0, 0, 50, 0, 50, 0, 0, 0, 0]
      }
    });
  }
  function noBallNotGK2CloseBall(positionConfig) {
    const { matchDetails, currentPOS, originPOS, pitchWidth, pitchHeight } = positionConfig;
    const isBottomTeam = originPOS[1] > pitchHeight / 2;
    const [curX, curY] = currentPOS;
    const inBoxWeights = isBottomTeam ? [0, 0, 0, 0, 50, 0, 10, 20, 20, 0, 0] : [0, 0, 0, 0, 40, 0, 20, 10, 30, 0, 0];
    return resolveNoBallNotGKIntent({
      matchDetails,
      currentPOS: [curX, curY],
      pitchWidth,
      pitchHeight,
      isBottomTeam,
      weights: {
        inBox: inBoxWeights,
        fallback: [0, 0, 0, 0, 70, 10, 20, 0, 0, 0, 0]
      }
    });
  }
  function onBottomCornerBoundary(position, pitchWidth, pitchHeight) {
    return position[1] === pitchHeight && (position[0] === 0 || position[0] === pitchWidth);
  }
  function onTopCornerBoundary(position, pitchWidth) {
    return position[1] === 0 && (position[0] === 0 || position[0] === pitchWidth);
  }
  function calcRetentionScore(skill, diff) {
    return (Math.floor(skill.agility) + Math.floor(skill.strength)) / 2 + getRandomNumber(-diff, diff);
  }
  function wasFoul(x, y) {
    const foul = getRandomNumber(0, x);
    return isBetween(foul, 0, y / 2 - 1);
  }
  function foulIntensity() {
    return getRandomNumber(1, 99);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/injury.js
  function isInjured(x) {
    if (x === 23) {
      return true;
    }
    return getRandomNumber(0, x) === 23;
  }
  function matchInjury(matchDetails, team) {
    const player = team.players[getRandomNumber(0, 10)];
    if (isInjured(4e4)) {
      player.injured = true;
      matchDetails.iterationLog.push(`Player Injured - ${player.name}`);
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/defensiveActions.js
  function handleDefensiveChallenge(challengeConfig) {
    const { player, team, opp: opposition, matchDetails, config } = challengeConfig;
    const { iterationLog, ball } = matchDetails;
    iterationLog.push(`${config.label} attempted by: ${player.name}`);
    const opponentWithBall = opposition.players.find((p) => p.playerID === ball.Player);
    if (!opponentWithBall) {
      return false;
    }
    player.stats.tackles.total++;
    if (wasFoul(...config.foulRange)) {
      setFoul(matchDetails, team, player, opponentWithBall);
      return true;
    }
    const isSuccessful = calcTackleScore(player.skill, 5) > calcRetentionScore(opponentWithBall.skill, 5);
    if (isSuccessful) {
      setSuccessTackle({
        matchDetails,
        team,
        opposition,
        player,
        thatPlayer: opponentWithBall,
        tackleDetails: config.tackleDetails
      });
    } else {
      setFailedTackle(matchDetails, player, opponentWithBall, config.tackleDetails);
    }
    return false;
  }
  function resolveTackle(player, team, opposition, matchDetails) {
    return handleDefensiveChallenge({
      player,
      team,
      opp: opposition,
      matchDetails,
      config: {
        label: "Tackle",
        foulRange: [10, 18],
        tackleDetails: { injuryHigh: 1500, injuryLow: 1400, increment: 1 }
      }
    });
  }
  function resolveSlide(tackleConfig) {
    const { player, team, opposition, matchDetails } = tackleConfig;
    return handleDefensiveChallenge({
      player,
      team,
      opp: opposition,
      matchDetails,
      config: {
        label: "Slide tackle",
        foulRange: [11, 20],
        tackleDetails: { injuryHigh: 1500, injuryLow: 1400, increment: 3 }
      }
    });
  }
  function setSuccessTackle(tackleConfig) {
    const { matchDetails, team, opposition, player, thatPlayer, tackleDetails } = tackleConfig;
    setPostTackleBall({ matchDetails, team, opp: opposition, player });
    matchDetails.iterationLog.push(`Successful tackle by: ${player.name}`);
    if (player.stats.tackles.on === void 0) {
      player.stats.tackles.on = 0;
    }
    player.stats.tackles.on++;
    setInjury({
      matchDetails,
      thatPlayer,
      player,
      tackledInjury: tackleDetails.injuryLow,
      tacklerInjury: tackleDetails.injuryHigh
    });
    setPostTacklePosition({
      matchDetails,
      winningPlayer: player,
      losingPlayer: thatPlayer,
      increment: tackleDetails.increment
    });
  }
  function setFailedTackle(matchDetails, player, thatPlayer, tackleDetails) {
    matchDetails.iterationLog.push(`Failed tackle by: ${player.name}`);
    player.stats.tackles.off++;
    setInjury({
      matchDetails,
      thatPlayer: player,
      player: thatPlayer,
      tackledInjury: tackleDetails.injuryHigh,
      tacklerInjury: tackleDetails.injuryLow
    });
    setPostTacklePosition({
      matchDetails,
      winningPlayer: thatPlayer,
      losingPlayer: player,
      increment: tackleDetails.increment
    });
  }
  function calcTackleScore(skill, diff) {
    return (Math.floor(skill.tackling) + Math.floor(skill.strength)) / 2 + getRandomNumber(-diff, diff);
  }
  function setPostTackleBall(tackleBallConfig) {
    const { matchDetails, team, opp: opposition, player } = tackleBallConfig;
    player.hasBall = true;
    matchDetails.ball.lastTouch.playerName = player.name;
    matchDetails.ball.lastTouch.playerID = player.playerID;
    matchDetails.ball.lastTouch.teamID = team.teamID;
    if (player.currentPOS[0] === "NP") {
      throw new Error("No player position!");
    }
    matchDetails.ball.position = [player.currentPOS[0], player.currentPOS[1]];
    matchDetails.ball.Player = player.playerID;
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.withTeam = team.teamID;
    team.intent = "attack";
    opposition.intent = "defend";
  }
  function setInjury(injuryContext) {
    const { matchDetails, thatPlayer, player, tackledInjury, tacklerInjury } = injuryContext;
    if (isInjured(tackledInjury)) {
      thatPlayer.injured = true;
      matchDetails.iterationLog.push(`Player Injured - ${thatPlayer.name}`);
    }
    if (isInjured(tacklerInjury)) {
      player.injured = true;
      matchDetails.iterationLog.push(`Player Injured - ${player.name}`);
    }
  }
  function attemptGoalieSave(matchDetails, goalie, teamName) {
    const [ballX, ballY] = matchDetails.ball.position;
    const ballProx = 8;
    const [goalieX, goalieY] = goalie.currentPOS;
    if (goalieX === "NP") {
      throw new Error("No player position!");
    }
    const isNear = isBetween(ballX, goalieX - ballProx, goalieX + ballProx) && isBetween(ballY, goalieY - ballProx, goalieY + ballProx);
    if (isNear && goalie.skill.saving > getRandomNumber(0, 100)) {
      setGoalieHasBall(matchDetails, goalie);
      if (inTopPenalty(matchDetails, [ballX, ballY]) || inBottomPenalty(matchDetails, [ballX, ballY])) {
        matchDetails.iterationLog.push(`ball saved by ${goalie.name} possession to ${teamName}`);
        goalie.stats.saves = (goalie.stats.saves || 0) + 1;
      }
      return true;
    }
    return false;
  }
  function completeSlide(matchDetails, thisPlayer, team, opp) {
    const foul = resolveSlide({
      player: thisPlayer,
      team,
      opposition: opp,
      matchDetails
    });
    if (!foul) {
      if (opp.name === matchDetails.kickOffTeam.name) {
        return setSetpieceKickOffTeam(matchDetails);
      }
      return setSetpieceSecondTeam(matchDetails);
    }
    const intensity = foulIntensity();
    if (isBetween(intensity, 65, 90)) {
      thisPlayer.stats.cards.yellow++;
      if (thisPlayer.stats.cards.yellow === 2) {
        thisPlayer.stats.cards.red++;
        Object.defineProperty(thisPlayer, "currentPOS", {
          value: ["NP", "NP"],
          writable: false,
          enumerable: true,
          configurable: false
        });
      }
    } else if (isBetween(intensity, 85, 100)) {
      thisPlayer.stats.cards.red++;
      Object.defineProperty(thisPlayer, "currentPOS", {
        value: ["NP", "NP"],
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
    if (opp.name === matchDetails.kickOffTeam.name) {
      return setSetpieceKickOffTeam(matchDetails);
    }
    return setSetpieceSecondTeam(matchDetails);
  }
  function completeTackleWhenCloseNoBall(matchDetails, thisPlayer, team, opp) {
    const foul = resolveTackle(thisPlayer, team, opp, matchDetails);
    if (foul) {
      const intensity = foulIntensity();
      if (isBetween(intensity, 75, 90)) {
        thisPlayer.stats.cards.yellow++;
        if (thisPlayer.stats.cards.yellow === 2) {
          thisPlayer.stats.cards.red++;
          Object.defineProperty(thisPlayer, "currentPOS", {
            value: ["NP", "NP"],
            writable: false,
            enumerable: true,
            configurable: false
          });
        }
      } else if (isBetween(intensity, 90, 100)) {
        thisPlayer.stats.cards.red++;
        Object.defineProperty(thisPlayer, "currentPOS", {
          value: ["NP", "NP"],
          writable: false,
          enumerable: true,
          configurable: false
        });
      }
    }
    if (opp.name === matchDetails.kickOffTeam.name) {
      return setSetpieceKickOffTeam(matchDetails);
    }
    return setSetpieceSecondTeam(matchDetails);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/ballTrajectory.js
  function calculateShotTarget(shotConfig) {
    const { player, onTarget, width, height, power } = shotConfig;
    const isTopTeam = player.originPOS[1] < height / 2;
    const playerY = player.currentPOS[1];
    let targetX;
    let targetY;
    if (onTarget) {
      targetX = getRandomNumber(width / 2 - 50, width / 2 + 50);
      targetY = isTopTeam ? height + 1 : -1;
    } else {
      const isLeft = getRandomNumber(0, 10) > 5;
      targetX = isLeft ? getRandomNumber(0, width / 2 - 55) : getRandomNumber(width / 2 + 55, width);
      targetY = isTopTeam ? playerY + power : playerY - power;
    }
    return [targetX, targetY];
  }
  function getTopKickedPosition(direction, position, power) {
    const pos2 = [position[0], position[1]];
    if (direction === `wait`) {
      return newKickedPosition({ pos: pos2, lowX: 0, highX: power / 2, lowY: 0, highY: power / 2 });
    } else if (direction === `north`) {
      return newKickedPosition({ pos: pos2, lowX: -20, highX: 20, lowY: -power, highY: -(power / 2) });
    } else if (direction === `east`) {
      return newKickedPosition({ pos: pos2, lowX: power / 2, highX: power, lowY: -20, highY: 20 });
    } else if (direction === `west`) {
      return newKickedPosition({ pos: pos2, lowX: -power, highX: -(power / 2), lowY: -20, highY: 20 });
    } else if (direction === `northeast`) {
      return newKickedPosition({
        pos: pos2,
        lowX: 0,
        highX: power / 2,
        lowY: -power,
        highY: -(power / 2)
      });
    } else if (direction === `northwest`) {
      return newKickedPosition({
        pos: pos2,
        lowX: -(power / 2),
        highX: 0,
        lowY: -power,
        highY: -(power / 2)
      });
    }
    throw new Error("Unexpected direction");
  }
  function getBottomKickedPosition(direction, position, power) {
    const pos2 = [position[0], position[1]];
    if (direction === `wait`) {
      return newKickedPosition({ pos: pos2, lowX: 0, highX: power / 2, lowY: 0, highY: power / 2 });
    } else if (direction === `south`) {
      return newKickedPosition({ pos: pos2, lowX: -20, highX: 20, lowY: power / 2, highY: power });
    } else if (direction === `east`) {
      return newKickedPosition({ pos: pos2, lowX: power / 2, highX: power, lowY: -20, highY: 20 });
    } else if (direction === `west`) {
      return newKickedPosition({ pos: pos2, lowX: -power, highX: -(power / 2), lowY: -20, highY: 20 });
    } else if (direction === `southeast`) {
      return newKickedPosition({
        pos: pos2,
        lowX: 0,
        highX: power / 2,
        lowY: power / 2,
        highY: power
      });
    } else if (direction === `southwest`) {
      return newKickedPosition({
        pos: pos2,
        lowX: -(power / 2),
        highX: 0,
        lowY: power / 2,
        highY: power
      });
    }
    throw new Error("Unexpected direction");
  }
  function newKickedPosition(kickConfig) {
    const { pos: pos2, lowX, highX, lowY, highY } = kickConfig;
    const newPosition = [0, 0];
    newPosition[0] = pos2[0] + getRandomNumber(lowX, highX);
    newPosition[1] = pos2[1] + getRandomNumber(lowY, highY);
    return newPosition;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/kickLogic.js
  function getRandomKickDirection(side) {
    const horizontal = ["east", "east", "west", "west"];
    const baseTop = ["wait", "north", "north", "north", "north", ...horizontal];
    const diagTop = ["northeast", "northeast", "northeast", "northwest", "northwest", "northwest"];
    const baseBottom = ["wait", "south", "south", "south", "south", ...horizontal];
    const diagBottom = ["southeast", "southeast", "southeast", "southwest", "southwest", "southwest"];
    const pool = side === "top" ? baseTop.concat(diagTop) : baseBottom.concat(diagBottom);
    return pool[getRandomNumber(0, pool.length - 1)];
  }
  function executeKickAction(matchDetails, team, player) {
    const { ball, pitchSize } = matchDetails;
    const [, pitchHeight] = pitchSize;
    matchDetails.iterationLog.push(`ball kicked by: ${player.name}`);
    Object.assign(ball.lastTouch, {
      playerName: player.name,
      playerID: player.playerID,
      teamID: team.teamID
    });
    const side = player.originPOS[1] > pitchHeight / 2 ? "top" : "bottom";
    const direction = getRandomKickDirection(side);
    const power = calculatePower(player.skill.strength);
    const newPos = side === "top" ? getTopKickedPosition(direction, ball.position, power) : getBottomKickedPosition(direction, ball.position, power);
    return calcBallMovementOverTime(matchDetails, player.skill.strength, newPos, player);
  }
  function resolvePassDestination(matchDetails, team, player) {
    const { ball, pitchSize } = matchDetails;
    Object.assign(ball.lastTouch, {
      playerName: player.name,
      playerID: player.playerID,
      teamID: team.teamID
    });
    const playersInDistance = getPlayersInDistance(team, player, pitchSize);
    const randIdx = getRandomNumber(0, playersInDistance.length - 1);
    const tPlyr = playersInDistance[randIdx];
    matchDetails.iterationLog.push(`through ball passed by: ${player.name} to: ${tPlyr.name}`);
    player.stats.passes.total++;
    const closePlyPos = calculateThroughBallTarget(player, tPlyr, matchDetails);
    return calcBallMovementOverTime(matchDetails, player.skill.strength, closePlyPos, player);
  }
  function calculateThroughBallTarget(player, targetPlayer, matchDetails) {
    const [, pitchHeight] = matchDetails.pitchSize;
    const { position } = matchDetails.ball;
    const [tpX, tpY] = destructPos(targetPlayer.currentPOS);
    const pos2 = [tpX, tpY];
    const isAttackingTop = player.originPOS[1] > pitchHeight / 2;
    const bottomThird = position[1] > pitchHeight - pitchHeight / 3;
    const middleThird = position[1] > pitchHeight / 3 && position[1] < pitchHeight - pitchHeight / 3;
    if (player.skill.passing > getRandomNumber(0, 100)) {
      return isAttackingTop ? setTargetPlyPos({ tplyr: pos2, lowX: 0, highX: 0, lowY: -20, highY: -10 }) : setTargetPlyPos({ tplyr: pos2, lowX: 0, highX: 0, lowY: 10, highY: 30 });
    }
    if (isAttackingTop) {
      if (bottomThird) {
        return setTargetPlyPos({ tplyr: pos2, lowX: -10, highX: 10, lowY: -10, highY: 10 });
      }
      if (middleThird) {
        return setTargetPlyPos({ tplyr: pos2, lowX: -20, highX: 20, lowY: -50, highY: 50 });
      }
      return setTargetPlyPos({ tplyr: pos2, lowX: -30, highX: 30, lowY: -100, highY: 100 });
    }
    if (bottomThird) {
      return setTargetPlyPos({ tplyr: pos2, lowX: -30, highX: 30, lowY: -100, highY: 100 });
    }
    if (middleThird) {
      return setTargetPlyPos({ tplyr: pos2, lowX: -20, highX: 20, lowY: -50, highY: 50 });
    }
    return setTargetPlyPos({ tplyr: pos2, lowX: -10, highX: 10, lowY: -10, highY: 10 });
  }
  function setTargetPlyPos(targetConfig) {
    const { tplyr, lowX, highX, lowY, highY } = targetConfig;
    const closePlyPos = [0, 0];
    const [targetPlayerXPos, targetPlayerYPos] = destructPos(tplyr);
    closePlyPos[0] = round(targetPlayerXPos + getRandomNumber(lowX, highX), 0);
    closePlyPos[1] = round(targetPlayerYPos + getRandomNumber(lowY, highY), 0);
    return closePlyPos;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/triggers.js
  function ballKicked(matchDetails, team, player) {
    return executeKickAction(matchDetails, team, player);
  }
  function penaltyTaken(matchDetails, team, player) {
    return executePenaltyShot(matchDetails, team, player);
  }
  function throughBall(matchDetails, team, player) {
    return resolvePassDestination(matchDetails, team, player);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/physics.js
  var deflectionStrategies = {
    east: (pos2, p) => [pos2[0] - p / 2, getRandomNumber(pos2[1] - 3, pos2[1] + 3)],
    west: (pos2, p) => [pos2[0] + p / 2, getRandomNumber(pos2[1] - 3, pos2[1] + 3)],
    north: (pos2, p) => [getRandomNumber(pos2[0] - 3, pos2[0] + 3), pos2[1] + p / 2],
    south: (pos2, p) => [getRandomNumber(pos2[0] - 3, pos2[0] + 3), pos2[1] - p / 2],
    northeast: (pos2, p) => [pos2[0] - p / 2, pos2[1] + p / 2],
    northwest: (pos2, p) => [pos2[0] + p / 2, pos2[1] + p / 2],
    southeast: (pos2, p) => [pos2[0] - p / 2, pos2[1] - p / 2],
    southwest: (pos2, p) => [pos2[0] + p / 2, pos2[1] - p / 2],
    wait: (_, p) => [getRandomNumber(-p / 2, p / 2), getRandomNumber(-p / 2, p / 2)]
  };
  function calculateDeflectionVector(direction, defPosition, newPower) {
    const handler = deflectionStrategies[direction];
    return handler ? handler(defPosition, newPower) : [0, 0];
  }
  function getBallDirection2(matchDetails, nextPOS) {
    const [currX, currY] = matchDetails.ball.position;
    const [nextX, nextY] = nextPOS;
    const dx = currX - nextX;
    const dy = currY - nextY;
    if (dx === 0 && dy === 0) {
      matchDetails.ball.direction = "wait";
      return;
    }
    const sigX = Math.sign(dx);
    const sigY = Math.sign(dy);
    const directionMap = {
      "0-1": "south",
      "01": "north",
      "-10": "east",
      "10": "west",
      "-1-1": "southeast",
      "11": "northwest",
      "1-1": "southwest",
      "-11": "northeast"
    };
    const key = `${sigX}${sigY}`;
    matchDetails.ball.direction = directionMap[key] || matchDetails.ball.direction;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/trajectory.js
  var mockPlayer = {
    name: "George Johnson",
    shirtNumber: 45,
    position: "ST",
    // or "ST"
    rating: "85",
    skill: {
      passing: 80,
      shooting: 90,
      tackling: 50,
      saving: 10,
      agility: 85,
      strength: 75,
      penalty_taking: 80,
      jumping: 70
    },
    currentPOS: [400, 200],
    fitness: 95,
    injured: false,
    playerID: 10,
    originPOS: [400, 200],
    intentPOS: [410, 210],
    action: "none",
    offside: false,
    hasBall: false,
    stats: initStats()
  };
  function getInterceptTrajectory(opposition, ballPosition, pitchSize) {
    const [pitchWidth, pitchHeight] = pitchSize;
    const playerInformation = closestPlayerToPosition(mockPlayer, opposition, ballPosition);
    const interceptPlayer = playerInformation.thePlayer;
    const targetX = pitchWidth / 2;
    const targetY = interceptPlayer.originPOS[1] < pitchHeight / 2 ? pitchHeight : 0;
    if (interceptPlayer.currentPOS[0] === "NP") {
      throw new Error("Player no position!");
    }
    const moveX = targetX - interceptPlayer.currentPOS[0];
    const moveY = targetY - interceptPlayer.currentPOS[1];
    const highNum = Math.abs(moveX) <= Math.abs(moveY) ? Math.abs(moveY) : Math.abs(moveX);
    const xDiff = moveX / highNum;
    const yDiff = moveY / highNum;
    const POI = [[...interceptPlayer.currentPOS]];
    for (let i = 0; i < Math.round(highNum); i++) {
      const lastArrayPOS = POI.length - 1;
      const lastXPOS = POI[lastArrayPOS][0];
      const lastYPOS = POI[lastArrayPOS][1];
      POI.push([round(lastXPOS + xDiff, 0), round(lastYPOS + yDiff, 0)]);
    }
    return POI;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/teamAi.js
  function processTeamTactics(closestPlayer, team, opp, matchDetails) {
    const { position: [ballX, ballY] } = matchDetails.ball;
    for (const player of team.players) {
      if (player.currentPOS[0] === "NP") {
        continue;
      }
      const tacticalContext = getPlayerTacticalContext(player, [ballX, ballY]);
      const action = determinePlayerAction({
        player,
        team,
        opp,
        matchDetails,
        ctx: tacticalContext,
        closest: closestPlayer
      });
      const pos2 = executePlayerMovement({
        player,
        action,
        opp,
        matchDetails,
        ctx: tacticalContext
      });
      setPlayerXY(player, pos2[0], player.currentPOS[1]);
      setPlayerXY(player, player.currentPOS[0], pos2[1]);
      resolveBallInteractions({
        player,
        team,
        opp,
        matchDetails,
        action
      });
      if (player.hasBall) {
        handleBallPlayerActions({ matchDetails, player, team, opp }, action);
      }
    }
    return team;
  }
  function determinePlayerAction(actionConfig) {
    const { player, team, matchDetails, ctx: ctx2, closest } = actionConfig;
    const possibleActions = findPossActions(player, matchDetails);
    const aiAction = selectAction(possibleActions);
    let action = checkProvidedAction(matchDetails, player, aiAction);
    const isClosestDefender = matchDetails.ball.withTeam && matchDetails.ball.withTeam !== team.teamID && closest.name === player.name;
    if (isClosestDefender) {
      if (!["tackle", "slide", "intercept"].includes(action)) {
        action = "sprint";
      }
      ctx2.x = closestPlayerActionBallX(ctx2.x);
      ctx2.y = closestPlayerActionBallY(ctx2.y);
    }
    return action;
  }
  function checkProvidedAction(matchDetails, thisPlayer, newAction) {
    return validateAndResolvePlayerAction({
      matchDetails,
      player: thisPlayer,
      fallbackAction: newAction
    });
  }
  function executePlayerMovement(moveCtx) {
    const { player, action, opp, matchDetails, ctx: ctx2 } = moveCtx;
    const move = getMovement({
      player,
      action,
      opposition: opp,
      ballX: ctx2.x,
      ballY: ctx2.y,
      matchDetails
    });
    const newPos = completeMovement(matchDetails, player, move);
    return destructPos(newPos);
  }
  function resolveBallInteractions(interactionConfig) {
    const { player, team, opp, matchDetails, action } = interactionConfig;
    const { ball } = matchDetails;
    const [playerX, playerY] = destructPos(player.currentPOS);
    const isNearBall = isBetween(playerX, ball.position[0] - 3, ball.position[0] + 3) && isBetween(playerY, ball.position[1] - 3, ball.position[1] + 3);
    if (!isNearBall) {
      return;
    }
    if (!ball.withPlayer) {
      setClosePlayerTakesBall(matchDetails, player, team, opp);
      return;
    }
    if (ball.withTeam !== team.teamID) {
      if (!player.hasBall) {
        if (action === "tackle") {
          completeTackleWhenCloseNoBall(matchDetails, player, team, opp);
          return;
        }
        if (action === "slide") {
          completeSlide(matchDetails, player, team, opp);
          return;
        }
      }
      setClosePlayerTakesBall(matchDetails, player, team, opp);
    }
  }
  function getPlayerTacticalContext(player, ballPos) {
    const [curX, curY] = player.currentPOS;
    if (curX === "NP") {
      throw new Error("No player position!");
    }
    return {
      x: curX - ballPos[0],
      y: curY - ballPos[1]
    };
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/movement.js
  function completeMovement(matchDetails, player, move) {
    const { currentPOS } = player;
    const [oldX, oldY] = destructPos(currentPOS);
    const [dx, dy] = move;
    let newX = oldX + dx;
    let newY = oldY + dy;
    if (newX > matchDetails.pitchSize[0] || newX < 0) {
      newX = oldX;
    }
    if (newY > matchDetails.pitchSize[1] || newY < 0) {
      newY = oldY;
    }
    setPlayerXY(player, newX, newY);
    return [newX, newY];
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/ball.js
  function updateInformation(matchDetails, newPosition) {
    if (matchDetails.endIteration === true) {
      return;
    }
    const [posX, posY] = newPosition;
    matchDetails.ball.position = [posX, posY];
    const { ball } = matchDetails;
    const [bx, by] = ball.position;
    setBallPosition(ball, bx, by, 0);
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/ball.js
  function setBallMovementMatchDetails(proximityConfig) {
    const { matchDetails, player: thisPlayer, startPos: thisPos, team: thisTeam } = proximityConfig;
    matchDetails.ball.ballOverIterations = [];
    matchDetails.ball.Player = thisPlayer.playerID;
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.lastTouch.playerName = thisPlayer.name;
    matchDetails.ball.lastTouch.playerID = thisPlayer.playerID;
    matchDetails.ball.lastTouch.teamID = thisTeam.teamID;
    matchDetails.ball.withTeam = thisTeam.teamID;
    matchDetails.ball.position = [...thisPos];
    setPlayerXY(thisPlayer, thisPos[0], thisPos[1]);
  }
  function ballMoved(matchDetails, thisPlayer, team, opp) {
    thisPlayer.hasBall = false;
    matchDetails.ball.withPlayer = false;
    team.intent = `attack`;
    opp.intent = `attack`;
    matchDetails.ball.Player = ``;
    matchDetails.ball.withTeam = ``;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/position/offside.js
  function offsideYPOS(team, side, pitchHeight) {
    const offsideYPOS2 = {
      pos1: 0,
      pos2: pitchHeight / 2
    };
    for (const thisPlayer of team.players) {
      if (thisPlayer.position === `GK`) {
        const [, position1] = thisPlayer.currentPOS;
        offsideYPOS2.pos1 = position1;
        if (thisPlayer.hasBall) {
          offsideYPOS2.pos2 = position1;
          return offsideYPOS2;
        }
      } else if (side === `top`) {
        if (thisPlayer.currentPOS[1] < offsideYPOS2.pos2) {
          const [, position2] = thisPlayer.currentPOS;
          offsideYPOS2.pos2 = position2;
        }
      } else if (thisPlayer.currentPOS[1] > offsideYPOS2.pos2) {
        const [, position2] = thisPlayer.currentPOS;
        offsideYPOS2.pos2 = position2;
      }
    }
    return offsideYPOS2;
  }
  function checkOffside(team1, team2, matchDetails) {
    const { ball } = matchDetails;
    const { pitchSize } = matchDetails;
    const team1side = team1.players[0].originPOS[1] < pitchSize[1] / 2 ? `top` : `bottom`;
    if (!ball.withTeam) {
      return matchDetails;
    }
    if (team1side === `bottom`) {
      team1atBottom(team1, team2, pitchSize[1]);
    } else {
      team1atTop(team1, team2, pitchSize[1]);
    }
  }
  function team1atBottom(team1, team2, pitchHeight) {
    if (updateOffside(team1, team2, "top", pitchHeight)) {
      return;
    }
    updateOffside(team2, team1, "bottom", pitchHeight);
  }
  function team1atTop(team1, team2, pitchHeight) {
    if (updateOffside(team1, team2, "bottom", pitchHeight)) {
      return;
    }
    updateOffside(team2, team1, "top", pitchHeight);
  }
  function updateOffside(team, opponent, attackSide, pitchHeight) {
    const offsideLines = offsideYPOS(opponent, attackSide, pitchHeight);
    const [min, max] = attackSide === "top" ? [offsideLines.pos1, offsideLines.pos2] : [offsideLines.pos2, offsideLines.pos1];
    const leadPlayer = attackSide === "top" ? getTopMostPlayer(team, pitchHeight) : getBottomMostPlayer(team);
    if (!leadPlayer) {
      throw new Error(`${attackSide === "top" ? "Top" : "Bottom"} player is undefined`);
    }
    if (isBetween(leadPlayer.currentPOS[1], min, max) && leadPlayer.hasBall) {
      return true;
    }
    for (const p of team.players) {
      p.offside = !p.hasBall && isBetween(p.currentPOS[1], min, max);
    }
    return false;
  }
  function getTopMostPlayer(team, pitchHeight) {
    let player;
    for (const thisPlayer of team.players) {
      let topMostPosition = pitchHeight;
      const [, plyrX] = thisPlayer.currentPOS;
      if (thisPlayer.currentPOS[1] < topMostPosition) {
        topMostPosition = plyrX;
        player = thisPlayer;
      }
    }
    return player;
  }
  function getBottomMostPlayer(team) {
    let player;
    for (const thisPlayer of team.players) {
      let topMostPosition = 0;
      const [, plyrX] = thisPlayer.currentPOS;
      if (thisPlayer.currentPOS[1] > topMostPosition) {
        topMostPosition = plyrX;
        player = thisPlayer;
      }
    }
    return player;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/playerMovement.js
  function decideMovement(closestPlayer, team, opp, matchDetails) {
    return processTeamTactics(closestPlayer, team, opp, matchDetails);
  }
  function handleBallPlayerActions(ctx2, action) {
    const { matchDetails, player: thisPlayer, team, opp } = ctx2;
    return executeActiveBallAction({
      matchDetails,
      player: thisPlayer,
      team,
      opp,
      action
    });
  }
  function getMovement(moveConfig) {
    const { player, action, opposition, ballX, ballY, matchDetails } = moveConfig;
    const { position } = matchDetails.ball;
    const ballActions = [`shoot`, `throughBall`, `pass`, `cross`, `cleared`, `boot`, `penalty`];
    if (action === `wait` || ballActions.includes(action)) {
      return [0, 0];
    } else if (action === `tackle` || action === `slide`) {
      return getTackleMovement(ballX, ballY);
    } else if (action === `intercept`) {
      return getInterceptMovement(player, opposition, position, matchDetails.pitchSize);
    } else if (action === `run`) {
      return getRunMovement(matchDetails, player, ballX, ballY);
    } else if (action === `sprint`) {
      return getSprintMovement(matchDetails, player, ballX, ballY);
    }
    throw new Error("No action");
  }
  function getTackleMovement(ballX, ballY) {
    const move = [0, 0];
    if (ballX > 0) {
      move[0] = -1;
    } else if (ballX === 0) {
      move[0] = 0;
    } else if (ballX < 0) {
      move[0] = 1;
    }
    if (ballY > 0) {
      move[1] = -1;
    } else if (ballY === 0) {
      move[1] = 0;
    } else if (ballY < 0) {
      move[1] = 1;
    }
    return move;
  }
  function getInterceptMovement(player, opposition, ballPosition, pitchSize) {
    const [x, y] = destructPos(player.currentPOS);
    const [targetX, targetY] = getInterceptPosition([x, y], opposition, ballPosition, pitchSize);
    const deltaX = targetX - x;
    const deltaY = targetY - y;
    return [Math.sign(deltaX), Math.sign(deltaY)];
  }
  function getInterceptPosition(currentPOS, opposition, ballPosition, pitchSize) {
    const ballPlyTraj = getInterceptTrajectory(opposition, ballPosition, pitchSize);
    let closestPos = ballPlyTraj[0] || [0, 0];
    let shortestDiff = Infinity;
    let closestIndex = 0;
    for (let i = 0; i < ballPlyTraj.length; i++) {
      const thisPos = ballPlyTraj[i];
      const xDiff = Math.abs(currentPOS[0] - thisPos[0]);
      const yDiff = Math.abs(currentPOS[1] - thisPos[1]);
      const totalDiff = xDiff + yDiff;
      if (totalDiff < shortestDiff) {
        shortestDiff = totalDiff;
        closestPos = thisPos;
        closestIndex = i;
      }
    }
    const isAtIntercept = closestPos[0] === currentPOS[0] && closestPos[1] === currentPOS[1];
    if (isAtIntercept && closestIndex > 0) {
      return ballPlyTraj[closestIndex - 1];
    }
    return closestPos;
  }
  function getRunMovement(matchDetails, player, ballX, ballY) {
    if (player.fitness > 20) {
      player.fitness = round(player.fitness - 5e-3, 6);
    }
    const side = player.originPOS[1] > matchDetails.pitchSize[1] / 2 ? "bottom" : "top";
    if (player.hasBall) {
      return side === "bottom" ? [getRandomNumber(0, 2), getRandomNumber(0, 2)] : [getRandomNumber(-2, 0), getRandomNumber(-2, 0)];
    }
    const movementRun = [-1, 0, 1];
    if (isBetween(ballX, -60, 60) && isBetween(ballY, -60, 60)) {
      return calculateProximityMovement(ballX, ballY, movementRun);
    }
    return calculateFormationMovement(player, movementRun);
  }
  function calculateProximityMovement(ballX, ballY, runOptions) {
    const move = [0, 0];
    if (isBetween(ballX, -60, 0)) {
      move[0] = runOptions[2];
    } else if (isBetween(ballX, 0, 60)) {
      move[0] = runOptions[0];
    } else {
      move[0] = runOptions[1];
    }
    if (isBetween(ballY, -60, 0)) {
      move[1] = runOptions[2];
    } else if (isBetween(ballY, 0, 60)) {
      move[1] = runOptions[0];
    } else {
      move[1] = runOptions[1];
    }
    return move;
  }
  function formationCheck(origin, current) {
    const xPos = origin[0] - current[0];
    const yPos = origin[1] - current[1];
    return [xPos, yPos];
  }
  function calculateFormationMovement(player, runOptions) {
    const [x, y] = destructPos(player.currentPOS);
    const direction = formationCheck(player.intentPOS, [Number(x), Number(y)]);
    const getMove = (dir) => {
      if (dir === 0) {
        return runOptions[1];
      }
      return dir < 0 ? runOptions[getRandomNumber(0, 1)] : runOptions[getRandomNumber(1, 2)];
    };
    return [getMove(direction[0]), getMove(direction[1])];
  }
  function getSprintMovement(matchDetails, player, ballX, ballY) {
    if (player.fitness > 30) {
      player.fitness = round(player.fitness - 0.01, 6);
    }
    const side = player.originPOS[1] > matchDetails.pitchSize[1] / 2 ? "bottom" : "top";
    if (player.hasBall) {
      return side === "bottom" ? [getRandomNumber(-4, 4), getRandomNumber(-4, -2)] : [getRandomNumber(-4, 4), getRandomNumber(2, 4)];
    }
    const movementSprint = [-2, -1, 0, 1, 2];
    if (isBetween(ballX, -60, 60) && isBetween(ballY, -60, 60)) {
      return calculateSprintProximity(ballX, ballY, movementSprint);
    }
    return calculateSprintFormation(player, movementSprint);
  }
  function calculateSprintProximity(ballX, ballY, sprintOptions) {
    const getSprintValue = (pos2) => {
      if (isBetween(pos2, -60, 0)) {
        return sprintOptions[getRandomNumber(3, 4)];
      }
      if (isBetween(pos2, 0, 60)) {
        return sprintOptions[getRandomNumber(0, 1)];
      }
      return sprintOptions[2];
    };
    const move = [getSprintValue(ballX), getSprintValue(ballY)];
    return move;
  }
  function calculateSprintFormation(player, sprintOptions) {
    const [x, y] = player.currentPOS;
    if (x === "NP") {
      throw new Error("No player position!");
    }
    const direction = formationCheck(player.intentPOS, [Number(x), Number(y)]);
    const getMove = (dir) => {
      if (dir === 0) {
        return sprintOptions[2];
      }
      return dir < 0 ? sprintOptions[getRandomNumber(0, 2)] : sprintOptions[getRandomNumber(2, 4)];
    };
    return [getMove(direction[0]), getMove(direction[1])];
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/ballActionHandler.js
  var ACTION_STRATEGIES = {
    cleared: ballKicked,
    boot: ballKicked,
    throughBall,
    shoot: shotMade,
    penalty: penaltyTaken,
    pass: (m, t, p) => {
      const pos2 = ballPassed(m, t, p);
      m.iterationLog.push(`passed to new position: ${JSON.stringify(pos2)}`);
      if (!Array.isArray(pos2)) {
        throw new Error("No position");
      }
      return pos2;
    },
    cross: (m, t, p) => {
      const pos2 = ballCrossed(m, t, p);
      m.iterationLog.push(`crossed to new position: ${pos2[0]} ${pos2[1]}`);
      return pos2;
    }
  };
  function syncBallToPlayer(matchDetails, player) {
    const [posX, posY] = player.currentPOS;
    if (posX === "NP") {
      throw new Error("No player position!");
    }
    getBallDirection2(matchDetails, [posX, posY]);
    matchDetails.ball.position = [posX, posY, 0];
    return [posX, posY];
  }
  function executeActiveBallAction(ballActionConfig) {
    const { matchDetails, player: thisPlayer, team, opp, action } = ballActionConfig;
    syncBallToPlayer(matchDetails, thisPlayer);
    const executeAction = ACTION_STRATEGIES[action];
    if (!executeAction) {
      return;
    }
    ballMoved(matchDetails, thisPlayer, team, opp);
    const newPosition = executeAction(matchDetails, team, thisPlayer);
    if (!Array.isArray(newPosition)) {
      throw new Error(`Action "${action}" failed to return a valid new position!`);
    }
    updateInformation(matchDetails, newPosition);
  }
  function shotMade(matchDetails, team, player) {
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    updateLastTouchAndLog(matchDetails, team, player);
    const shotPower = calculatePower(player.skill.strength);
    const isOnTarget = checkShotAccuracy(player, pitchHeight, shotPower);
    recordShotStatistics(matchDetails, player, isOnTarget);
    const targetCoord = calculateShotTarget({
      player,
      onTarget: isOnTarget,
      width: pitchWidth,
      height: pitchHeight,
      power: shotPower
    });
    const endPos = calcBallMovementOverTime(matchDetails, player.skill.strength, targetCoord, player);
    checkGoalScored(matchDetails);
    return endPos;
  }
  function checkShotAccuracy(player, pitchHeight, power) {
    const [, playerY] = player.currentPOS;
    const isTopTeam = player.originPOS[1] < pitchHeight / 2;
    const shotReachGoal = isTopTeam ? playerY + power >= pitchHeight : playerY - power <= 0;
    return shotReachGoal && player.skill.shooting > getRandomNumber(0, 40);
  }
  function recordShotStatistics(matchDetails, player, isOnTarget) {
    const { half } = matchDetails;
    if (half === 0) {
      throw new Error(`You cannot supply 0 as a half`);
    }
    const teamStats = isEven(half) ? matchDetails.kickOffTeamStatistics : matchDetails.secondTeamStatistics;
    if (typeof teamStats.shots === "number") {
      teamStats.shots++;
    } else {
      teamStats.shots.total++;
    }
    player.stats.shots.total++;
    const status = isOnTarget ? "on" : "off";
    if (typeof teamStats.shots !== "number") {
      teamStats.shots[status] = (teamStats.shots[status] || 0) + 1;
    }
    if (typeof player.stats.shots !== "number") {
      player.stats.shots[status] = (player.stats.shots[status] || 0) + 1;
    }
  }
  function updateLastTouchAndLog(matchDetails, team, player) {
    matchDetails.iterationLog.push(`Shot Made by: ${player.name}`);
    updateLastTouch(matchDetails.ball, player, team);
  }
  function updateLastTouch(ball, player, team) {
    ball.lastTouch.playerName = player.name;
    ball.lastTouch.playerID = player.playerID;
    ball.lastTouch.teamID = team.teamID;
  }
  function ballCrossed(matchDetails, team, player) {
    if (player.currentPOS[0] === "NP") {
      throw new Error("Player no position!");
    }
    matchDetails.ball.lastTouch.playerName = player.name;
    matchDetails.ball.lastTouch.playerID = player.playerID;
    matchDetails.ball.lastTouch.teamID = team.teamID;
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    const ballIntended = [0, 0];
    if (player.originPOS[1] > pitchHeight / 2) {
      ballIntended[1] = getRandomNumber(0, pitchHeight / 5);
      if (player.currentPOS[0] < pitchWidth / 2) {
        ballIntended[0] = getRandomNumber(pitchWidth / 3, pitchWidth);
      } else {
        ballIntended[0] = getRandomNumber(0, pitchWidth - pitchWidth / 3);
      }
    } else {
      ballIntended[1] = getRandomNumber(pitchHeight - pitchHeight / 5, pitchHeight);
      if (player.currentPOS[0] < pitchWidth / 2) {
        ballIntended[0] = getRandomNumber(pitchWidth / 3, pitchWidth);
      } else {
        ballIntended[0] = getRandomNumber(0, pitchWidth - pitchWidth / 3);
      }
    }
    matchDetails.iterationLog.push(`ball crossed by: ${player.name}`);
    player.stats.passes.total++;
    const result = calcBallMovementOverTime(matchDetails, player.skill.strength, ballIntended, player);
    if (!Array.isArray(result)) {
      throw new Error("No coordinates!");
    }
    return result;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/actions/deflections.js
  function resolveDeflection(deflectionConfig) {
    const { power, startPos: thisPOS, defPosition, player: defPlayer, team: defTeam } = deflectionConfig;
    let { matchDetails } = deflectionConfig;
    const xMovement = (thisPOS[0] - defPosition[0]) ** 2;
    const yMovement = (thisPOS[1] - defPosition[1]) ** 2;
    const movementDistance = Math.sqrt(xMovement + yMovement);
    const newPower = power - movementDistance;
    let tempPosition = [0, 0];
    const { direction } = matchDetails.ball;
    if (newPower < 75) {
      setDeflectionPlayerHasBall(matchDetails, defPlayer, defTeam);
      return defPosition;
    }
    defPlayer.hasBall = false;
    matchDetails.ball.Player = "";
    matchDetails.ball.withPlayer = false;
    matchDetails.ball.withTeam = "";
    tempPosition = setDeflectionDirectionPos(direction, defPosition, newPower);
    const lastTeam = matchDetails.ball.lastTouch.teamID;
    matchDetails = keepInBoundaries(matchDetails, `Team: ${lastTeam}`, tempPosition);
    const intended = matchDetails.ballIntended;
    const lastPOS = structuredClone(intended ?? matchDetails.ball.position);
    delete matchDetails.ballIntended;
    return lastPOS;
  }
  function setDeflectionPlayerHasBall(matchDetails, defPlayer, defTeam) {
    defPlayer.hasBall = true;
    matchDetails.ball.lastTouch.playerName = defPlayer.name;
    matchDetails.ball.lastTouch.playerID = defPlayer.playerID;
    matchDetails.ball.lastTouch.teamID = defTeam.teamID;
    if (defPlayer.offside === true) {
      matchDetails = setDeflectionPlayerOffside(matchDetails, defTeam, defPlayer);
      return matchDetails.ball.position;
    }
    matchDetails.ball.ballOverIterations = [];
    matchDetails.ball.Player = defPlayer.playerID;
    matchDetails.ball.withPlayer = true;
    matchDetails.ball.withTeam = defTeam.teamID;
    const [posX, posY] = destructPos(defPlayer.currentPOS);
    matchDetails.ball.position = [posX, posY];
    return void 0;
  }
  function setDeflectionDirectionPos(direction, defPosition, newPower) {
    return calculateDeflectionVector(direction, defPosition, newPower);
  }
  function setDeflectionPlayerOffside(matchDetails, defTeam, defPlayer) {
    defPlayer.offside = false;
    defPlayer.hasBall = false;
    matchDetails.ball.Player = "";
    matchDetails.ball.withPlayer = false;
    matchDetails.ball.withTeam = "";
    matchDetails.iterationLog.push(`${defPlayer.name} is offside. Set piece given`);
    if (defTeam.name === matchDetails.kickOffTeam.name) {
      matchDetails = setSetpieceSecondTeam(matchDetails);
    } else {
      matchDetails = setSetpieceKickOffTeam(matchDetails);
    }
    return matchDetails;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/collisions.js
  function handleGoalieSave(saveConfig) {
    const { matchDetails, player, ballPos, power, team } = saveConfig;
    const [posX, posY] = destructPos(player.currentPOS);
    const inGoalieProx = isBetween(posX, ballPos[0] - 11, ballPos[0] + 11) && isBetween(posY, ballPos[1] - 2, ballPos[1] + 2);
    if (inGoalieProx && isBetween(ballPos[2] ?? 0, -1, player.skill.jumping + 1)) {
      const savingSkill = player.skill.saving || 0;
      if (savingSkill > getRandomNumber(0, power)) {
        setBallMovementMatchDetails({
          matchDetails,
          player,
          startPos: [ballPos[0], ballPos[1]],
          team
        });
        matchDetails.iterationLog.push(`Ball saved`);
        player.stats.saves = (player.stats.saves || 0) + 1;
        return ballPos;
      }
    }
  }
  function thisPlayerIsInProximity(proximityConfig) {
    const { matchDetails, thisPlayer, thisPOS, thisPos, power, thisTeam } = proximityConfig;
    const pos2 = [thisPos[0], thisPos[1], 0];
    return resolvePlayerBallInteraction({
      matchDetails,
      thisPlayer,
      thisPOS,
      thisPos: pos2,
      power,
      thisTeam
    });
  }
  function resolvePlayerBallInteraction(interactionConfig) {
    const { matchDetails, thisPlayer, thisPOS, thisPos, power, thisTeam } = interactionConfig;
    if (!thisPlayer) {
      throw new Error("Player is undefined!");
    }
    if (!Array.isArray(thisPlayer.currentPOS) || thisPlayer.currentPOS.length < 2) {
      throw new Error(`Invalid player position: ${thisPlayer.currentPOS[0]} ${thisPlayer.currentPOS[1]}`);
    }
    if (thisPlayer.currentPOS[0] === "NP") {
      throw new Error("Player no position!");
    }
    const checkPos = [
      round(thisPos[0], 0),
      round(thisPos[1], 0),
      thisPos[2]
    ];
    if (thisPlayer.position === "GK") {
      return handleGoalieSave({
        matchDetails,
        player: thisPlayer,
        ballPos: checkPos,
        power,
        team: thisTeam
      });
    }
    return handlePlayerDeflection({
      matchDetails,
      player: thisPlayer,
      thisPOS,
      ballPos: checkPos,
      power,
      team: thisTeam,
      opp: {}
    });
  }
  function checkInterceptionsOnTrajectory(trajectoryConfig) {
    const { player, thisPOS, newPOS, power, team, opp } = trajectoryConfig;
    let { matchDetails } = trajectoryConfig;
    removeBallFromAllPlayers(matchDetails);
    const trajectory = getBallTrajectory(thisPOS, newPOS, power);
    resolvePathInterceptions({
      trajectory,
      originPlayer: player,
      team,
      opp,
      matchDetails,
      thisPOS,
      power
    });
    const lastTeam = matchDetails.ball.lastTouch.teamID;
    matchDetails = keepInBoundaries(matchDetails, lastTeam, newPOS);
    if (matchDetails.endIteration) {
      return newPOS;
    }
    const finalPos = matchDetails.ballIntended || matchDetails.ball.position;
    delete matchDetails.ballIntended;
    return [round(finalPos[0], 2), round(finalPos[1], 2)];
  }
  function resolvePathInterceptions(pathConfig) {
    const { trajectory, originPlayer, team, opp, matchDetails, thisPOS, power } = pathConfig;
    for (const step of trajectory) {
      const checkPos = [round(step[0], 0), round(step[1], 0)];
      const p1 = closestPlayerToPosition(originPlayer, team, checkPos);
      const p2 = closestPlayerToPosition(originPlayer, opp, checkPos);
      const useP1 = compareProximity(p1, p2);
      const closestPlayer = useP1 ? p1.thePlayer : p2.thePlayer;
      const closestTeam = useP1 ? team : opp;
      if (closestPlayer) {
        thisPlayerIsInProximity({
          matchDetails,
          thisPlayer: closestPlayer,
          thisPOS,
          thisPos: [step[0], step[1]],
          power,
          thisTeam: closestTeam
        });
      }
    }
  }
  function compareProximity(p1, p2) {
    if (p2.proxToBall === void 0) {
      return true;
    }
    if (p1.proxToBall === void 0) {
      return false;
    }
    return p1.proxToBall >= p2.proxToBall;
  }
  function handlePlayerDeflection(deflectionConfig) {
    const { matchDetails, player, thisPOS, ballPos, power, team } = deflectionConfig;
    const [posX, posY] = destructPos(player.currentPOS);
    const inProx = isBetween(posX, ballPos[0] - 3, ballPos[0] + 3) && isBetween(posY, ballPos[1] - 3, ballPos[1] + 3);
    if (inProx && isBetween(ballPos[2] ?? 0, -1, player.skill.jumping + 1)) {
      const newPOS = resolveDeflection({
        power,
        startPos: thisPOS,
        defPosition: [posX, posY],
        player,
        team,
        matchDetails
      });
      matchDetails.iterationLog.push(`Ball deflected`);
      return [round(newPOS[0], 2), round(newPOS[1], 2)];
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/ballMovement.js
  function splitNumberIntoN(num, n) {
    const arrayN = Array.from(new Array(n).keys());
    const splitNumber = [];
    for (const thisn of arrayN) {
      const nextNum = aTimesbDividedByC(n - thisn, num, n);
      if (nextNum === 0) {
        splitNumber.push(1);
      } else {
        splitNumber.push(round(nextNum, 0));
      }
    }
    return splitNumber;
  }
  function checkGoalScored(matchDetails) {
    const { ball, kickOffTeam, secondTeam } = matchDetails;
    const [pitchWidth, pitchHeight, goalWidth] = matchDetails.pitchSize;
    const [ballX, ballY] = ball.position;
    const koTeamGk = kickOffTeam.players[0];
    const sndTeamGk = secondTeam.players[0];
    if (koTeamGk.currentPOS[0] === "NP" || sndTeamGk.currentPOS[0] === "NP") {
      throw new Error("Goalie position missing!");
    }
    if (attemptGoalieSave(matchDetails, koTeamGk, kickOffTeam.name)) {
      return;
    }
    if (attemptGoalieSave(matchDetails, sndTeamGk, secondTeam.name)) {
      return;
    }
    const centreGoal = pitchWidth / 2;
    const goalEdge = goalWidth / 2;
    const withinGoalX = isBetween(ballX, centreGoal - goalEdge, centreGoal + goalEdge);
    if (withinGoalX) {
      if (ballY < 1) {
        resolveGoalScored(matchDetails, true);
      } else if (ballY >= pitchHeight) {
        resolveGoalScored(matchDetails, false);
      }
    }
  }
  function resolveBallMovement(movementConfig) {
    const { player, startPos: thisPOS, targetPos: newPOS, power, team, opp, matchDetails } = movementConfig;
    return checkInterceptionsOnTrajectory({
      player,
      thisPOS: [thisPOS[0], thisPOS[1]],
      newPOS: [newPOS[0], newPOS[1]],
      power,
      team,
      opp,
      matchDetails
    });
  }
  function ballPassed(matchDetails, team, player) {
    const { ball, pitchSize, iterationLog } = matchDetails;
    const [, pitchHeight] = pitchSize;
    updateLastTouch(ball, player, team);
    const targetPlayer = getTargetPlayerCandidate(team, player, pitchSize, pitchHeight);
    const [curX, curY] = targetPlayer.currentPOS;
    if (curX === "NP") {
      throw new Error("No position");
    }
    const destination = calculatePassDestination(player, ball.position, [curX, curY], pitchHeight);
    iterationLog.push(`ball passed by: ${player.name} to: ${targetPlayer.name}`);
    player.stats.passes.total++;
    return calcBallMovementOverTime(matchDetails, player.skill.strength, destination, player);
  }
  function getTargetPlayerCandidate(team, player, pitchSize, pitchHeight) {
    const side = player.originPOS[1] > pitchHeight / 2 ? "bottom" : "top";
    const playersInDistance = getPlayersInDistance(team, player, pitchSize);
    const target = getTargetPlayer(playersInDistance, side, pitchHeight);
    if (target.currentPOS[0] === "NP") {
      throw new Error("No position");
    }
    return target;
  }
  function calculatePassDestination(player, ballPos, targetPos, pitchHeight) {
    if (player.skill.passing > getRandomNumber(0, 100)) {
      return targetPos;
    }
    const errorRange = getPassErrorRange(ballPos[1], player.originPOS[1], pitchHeight);
    return setTargetPlyPos({
      tplyr: targetPos,
      lowX: -errorRange,
      highX: errorRange,
      lowY: -errorRange,
      highY: errorRange
    });
  }
  function getPassErrorRange(ballY, playerOriginY, pitchHeight) {
    const isBottomThird = ballY > pitchHeight - pitchHeight / 3;
    const isMiddleThird = ballY > pitchHeight / 3 && ballY < pitchHeight - pitchHeight / 3;
    const playerSide = playerOriginY > pitchHeight / 2 ? "bottom" : "top";
    if (isBottomThird) {
      return playerSide === "bottom" ? 10 : 100;
    }
    if (isMiddleThird) {
      return 50;
    }
    return playerSide === "top" ? 10 : 100;
  }
  function getTargetPlayer(playersArray, side, pitchHeight = 1050) {
    return resolveBestPassOption(playersArray, side, pitchHeight);
  }
  function calcBallMovementOverTime(matchDetails, strength, nextPosition, player) {
    const { kickOffTeam, secondTeam } = matchDetails;
    const { position } = matchDetails.ball;
    const power = calculatePower(strength);
    const changeInX = nextPosition[0] - position[0];
    const changeInY = nextPosition[1] - position[1];
    const totalChange = Math.max(Math.abs(changeInX), Math.abs(changeInY));
    let movementIterations = round(totalChange / getRandomNumber(2, 3), 0);
    if (movementIterations < 1) {
      movementIterations = 1;
    }
    const powerArray = splitNumberIntoN(power, movementIterations);
    const xArray = splitNumberIntoN(changeInX, movementIterations);
    const yArray = splitNumberIntoN(changeInY, movementIterations);
    const ballOverIters = mergeArrays({
      arrayLength: powerArray.length,
      oldPos: [matchDetails.ball.position[0], matchDetails.ball.position[1]],
      newPos: nextPosition,
      array1: xArray,
      array2: yArray,
      array3: powerArray
    }).map((i) => [i[0], i[1], i[2] ?? 0]);
    matchDetails.ball.ballOverIterations = ballOverIters;
    const endPos = resolveBallMovement({
      player,
      startPos: [position[0], position[1]],
      targetPos: [ballOverIters[0][0], ballOverIters[0][1]],
      power,
      team: kickOffTeam,
      opp: secondTeam,
      matchDetails
    });
    if (matchDetails.endIteration === true) {
      return [matchDetails.ball.position[0], matchDetails.ball.position[1]];
    }
    matchDetails.ball.ballOverIterations.shift();
    matchDetails.iterationLog.push(`resolving ball movement`);
    return endPos;
  }
  function mergeArrays(mergeConfig) {
    const { arrayLength, oldPos, newPos, array1, array2, array3 } = mergeConfig;
    let tempPos = [oldPos[0], oldPos[1]];
    const arrayN = Array.from(new Array(arrayLength - 1).keys());
    const newArray = [];
    for (const thisn of arrayN) {
      newArray.push([tempPos[0] + array1[thisn], tempPos[1] + array2[thisn], array3[thisn]]);
      tempPos = [tempPos[0] + array1[thisn], tempPos[1] + array2[thisn]];
    }
    newArray.push([newPos[0], newPos[1], array3[array3.length - 1]]);
    return newArray;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/ballState.js
  function moveBall(matchDetails) {
    const { ball } = matchDetails;
    if (!ball.ballOverIterations?.length) {
      ball.direction = "wait";
      return matchDetails;
    }
    const nextBallPos = ball.ballOverIterations[0];
    const [nbX, nbY, nbZ = 0] = nextBallPos;
    if (nextBallPos.length < 2) {
      throw new Error("Invalid ball position!");
    }
    getBallDirection2(matchDetails, nextBallPos);
    const endPos = resolveBallMovement({
      player: setBPlayer([nbX, nbY]),
      startPos: [ball.position[0], ball.position[1]],
      targetPos: [nextBallPos[0], nextBallPos[1]],
      power: nbZ,
      team: matchDetails.kickOffTeam,
      opp: matchDetails.secondTeam,
      matchDetails
    });
    if (matchDetails.endIteration) {
      return matchDetails;
    }
    return finalizeMomentumStep(matchDetails, endPos);
  }
  function finalizeMomentumStep(matchDetails, endPos) {
    matchDetails.ball.ballOverIterations.shift();
    matchDetails.iterationLog.push(`ball still moving from previous kick: ${endPos[0]} ${endPos[1]}`);
    matchDetails.ball.position = endPos;
    checkGoalScored(matchDetails);
    return matchDetails;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/lib/validate.js
  function validateTeam(team) {
    if (!team.name) {
      throw new Error(`No team name given.`);
    } else {
      validateNumberOfPlayers(team.players);
      for (const player of team.players) {
        validatePlayerObjects(player);
      }
    }
  }
  function validateTeamSecondHalf(team) {
    if (!team.name) {
      throw new Error(`No team name given.`);
    } else if (!team.intent) {
      throw new Error(`No team intent given.`);
    } else if (!team.teamID) {
      throw new Error(`No team ID given.`);
    } else {
      validateNumberOfPlayers(team.players);
      for (const player of team.players) {
        validatePlayerObjectsIteration(player);
      }
    }
  }
  function validateNumberOfPlayers(players) {
    if (players.length !== 11) {
      throw new Error(`There must be 11 players in a team`);
    }
  }
  function validatePlayerObjects(player) {
    const playerObjects = [`name`, `position`, `rating`, `currentPOS`, `injured`, `fitness`];
    for (const obj of playerObjects) {
      if (!Object.prototype.hasOwnProperty.call(player, obj)) {
        throw new Error(`Player must contain JSON variable: ${obj}`);
      }
    }
    validatePlayerSkills(player.skill);
  }
  function validatePlayerObjectsIteration(player) {
    const playerObjects = [
      `playerID`,
      `name`,
      `position`,
      `rating`,
      `currentPOS`,
      `injured`,
      `fitness`
    ];
    playerObjects.push(`originPOS`, `intentPOS`, `action`, `offside`, `hasBall`, `stats`);
    for (const obj of playerObjects) {
      if (!Object.prototype.hasOwnProperty.call(player, obj)) {
        throw new Error(`Player must contain JSON variable: ${obj}`);
      }
    }
    validatePlayerSkills(player.skill);
    validateStats(player.stats);
  }
  function validateStats(stats) {
    const statsObject = [`cards`, `goals`, `tackles`, `passes`, `shots`];
    let badObjects = 0;
    for (const type of statsObject) {
      if (!Object.prototype.hasOwnProperty.call(stats, type)) {
        logger.error(`Player must have set stats: ${type}`);
        badObjects++;
      }
    }
    if (badObjects > 0) {
      throw new Error(`Provide Stats: cards,goals,tackles,passes,shots`);
    }
  }
  function validatePlayerSkills(skills) {
    const skillType = [
      `passing`,
      `shooting`,
      `tackling`,
      `saving`,
      `agility`,
      `strength`,
      `penalty_taking`,
      `jumping`
    ];
    let badObjects = 0;
    for (const type of skillType) {
      if (!Object.prototype.hasOwnProperty.call(skills, type)) {
        logger.error(`Player must contain skill: ${type}`);
        badObjects++;
      }
    }
    if (badObjects > 0) {
      throw new Error(`Provide skills: passing,shooting,tackling,saving,agility,strength,penalty_taking,jumping`);
    }
  }
  function validatePitch(pitchDetails) {
    const pitchObjects = [`pitchWidth`, `pitchHeight`];
    let badObjects = 0;
    for (const obj of pitchObjects) {
      if (!Object.prototype.hasOwnProperty.call(pitchDetails, obj)) {
        logger.error(`Pitch Must contain: ${obj}`);
        badObjects++;
      }
    }
    if (badObjects > 0) {
      throw new Error(`Please provide pitchWidth and pitchHeight`);
    }
  }
  function validateArguments(a, b, c) {
    if (a === void 0 || b === void 0 || c === void 0) {
      throw new Error(`Please provide two teams and a pitch`);
    }
  }
  function validateMatchDetails(matchDetails) {
    const matchObjects = [`matchID`, `kickOffTeam`, `secondTeam`, `pitchSize`, `ball`, `half`];
    Array.prototype.push.apply(matchObjects, [
      `kickOffTeamStatistics`,
      `secondTeamStatistics`,
      `iterationLog`
    ]);
    let badObjects = 0;
    for (const obj of matchObjects) {
      if (matchDetails) {
        if (!Object.prototype.hasOwnProperty.call(matchDetails, obj)) {
          logger.error(`Match Details must contain: ${obj}`);
          badObjects++;
        }
      }
      if (badObjects > 0) {
        throw new Error(`Please provide valid match details JSON`);
      }
    }
    validateBall(matchDetails.ball);
  }
  function validateBall(ball) {
    const ballProps = [
      `position`,
      `withPlayer`,
      `Player`,
      `withTeam`,
      `direction`,
      `ballOverIterations`
    ];
    let badObjects = 0;
    for (const prop of ballProps) {
      if (!Object.prototype.hasOwnProperty.call(ball, prop)) {
        logger.error(`Ball JSON must have property: ${prop}`);
        badObjects++;
      }
    }
    if (badObjects > 0) {
      throw new Error(`Provide: position,withPlayer,Player,withTeam,direction,ballOverIterations`);
    }
  }
  function isPlayerInBounds(player, pitchWidth, pitchHeight) {
    if (player.currentPOS[0] !== "NP") {
      const onPitchX = isBetween(player.currentPOS[0], -1, pitchWidth + 1);
      const onPitchY = isBetween(player.currentPOS[1], -1, pitchHeight + 1);
      if (onPitchX === false) {
        throw new Error(`Player ${player.name} not on the pitch X: ${player.currentPOS[0]}`);
      }
      if (onPitchY === false) {
        throw new Error(`Player ${player.name} not on the pitch Y: ${player.currentPOS[1]}`);
      }
    }
  }
  function validatePlayerPositions(matchDetails) {
    const { kickOffTeam, secondTeam } = matchDetails;
    const [pitchWidth, pitchHeight] = matchDetails.pitchSize;
    for (const player of kickOffTeam.players) {
      isPlayerInBounds(player, pitchWidth, pitchHeight);
    }
    for (const player of secondTeam.players) {
      isPlayerInBounds(player, pitchWidth, pitchHeight);
    }
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/dist/engine.js
  function initiateGame(team1, team2, pitchDetails) {
    validateArguments(team1, team2, pitchDetails);
    validateTeam(team1);
    validateTeam(team2);
    validatePitch(pitchDetails);
    const matchDetails = populateMatchDetails(team1, team2, pitchDetails);
    let kickOffTeam = setGameVariables(matchDetails.kickOffTeam);
    const secondTeam = setGameVariables(matchDetails.secondTeam);
    kickOffTeam = koDecider(kickOffTeam, matchDetails);
    matchDetails.iterationLog.push(`Team to kick off - ${kickOffTeam.name}`);
    matchDetails.iterationLog.push(`Second team - ${secondTeam.name}`);
    switchSide(matchDetails, secondTeam);
    matchDetails.kickOffTeam = kickOffTeam;
    matchDetails.secondTeam = secondTeam;
    return matchDetails;
  }
  function playIteration(matchDetails) {
    const closestPlayerA = {
      name: "",
      position: 1e5
    };
    const closestPlayerB = {
      name: "",
      position: 1e5
    };
    validateMatchDetails(matchDetails);
    validateTeamSecondHalf(matchDetails.kickOffTeam);
    validateTeamSecondHalf(matchDetails.secondTeam);
    validatePlayerPositions(matchDetails);
    matchDetails.iterationLog = [];
    let { kickOffTeam, secondTeam } = matchDetails;
    matchInjury(matchDetails, kickOffTeam);
    matchInjury(matchDetails, secondTeam);
    matchDetails = moveBall(matchDetails);
    if (matchDetails.endIteration === true) {
      delete matchDetails.endIteration;
      return matchDetails;
    }
    closestPlayerToBall(closestPlayerA, kickOffTeam, matchDetails);
    closestPlayerToBall(closestPlayerB, secondTeam, matchDetails);
    kickOffTeam = decideMovement(closestPlayerA, kickOffTeam, secondTeam, matchDetails);
    secondTeam = decideMovement(closestPlayerB, secondTeam, kickOffTeam, matchDetails);
    matchDetails.kickOffTeam = kickOffTeam;
    matchDetails.secondTeam = secondTeam;
    if (matchDetails.ball.ballOverIterations.length === 0 || matchDetails.ball.withTeam !== "") {
      checkOffside(kickOffTeam, secondTeam, matchDetails);
    }
    return matchDetails;
  }

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/src/init_config/team1.json
  var team1_default = {
    name: "ThisTeam",
    rating: 88,
    players: [
      {
        name: "Bill Johnson",
        position: "GK",
        rating: "75",
        skill: {
          passing: "20",
          shooting: "12",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "43",
          jumping: "300"
        },
        currentPOS: [340, 0],
        fitness: 100,
        injured: false
      },
      {
        name: "Fred Johnson",
        position: "LB",
        rating: "90",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "20",
          jumping: "235"
        },
        currentPOS: [80, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "George Johnson",
        position: "CB",
        rating: "84",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "20",
          jumping: "212"
        },
        currentPOS: [230, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "Jim Johnson",
        position: "CB",
        rating: "75",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "21",
          jumping: "280"
        },
        currentPOS: [420, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "Georgina Johnson",
        position: "RB",
        rating: "82",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "23",
          penalty_taking: "20",
          jumping: "299"
        },
        currentPOS: [600, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "Lucy Johnson",
        position: "LM",
        rating: "87",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "20",
          jumping: "250"
        },
        currentPOS: [80, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Arthur Johnson",
        position: "CM",
        rating: "41",
        skill: {
          passing: "33",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "1",
          jumping: "120"
        },
        currentPOS: [230, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Cameron Johnson",
        position: "CM",
        rating: "99",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "20",
          jumping: "175"
        },
        currentPOS: [420, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Gill Johnson",
        position: "RM",
        rating: "79",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "20",
          jumping: "288"
        },
        currentPOS: [600, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Peter Johnson",
        position: "ST",
        rating: "75",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "20",
          jumping: "291"
        },
        currentPOS: [280, 500],
        fitness: 100,
        injured: false
      },
      {
        name: "Louise Johnson",
        position: "ST",
        rating: "88",
        skill: {
          passing: "20",
          shooting: "20",
          tackling: "20",
          saving: "20",
          agility: "20",
          strength: "20",
          penalty_taking: "20",
          jumping: "280"
        },
        currentPOS: [440, 500],
        fitness: 100,
        injured: false
      }
    ]
  };

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/src/init_config/team2.json
  var team2_default = {
    name: "ThatTeam",
    rating: 88,
    players: [
      {
        name: "Ian Smith",
        position: "GK",
        rating: "75",
        skill: {
          passing: "78",
          shooting: "12",
          tackling: "75",
          saving: "75",
          agility: "70",
          strength: "60",
          penalty_taking: "45",
          jumping: "235"
        },
        currentPOS: [340, 0],
        fitness: 100,
        injured: false
      },
      {
        name: "Fred Smith",
        position: "LB",
        rating: "90",
        skill: {
          passing: "83",
          shooting: "40",
          tackling: "32",
          saving: "10",
          agility: "30",
          strength: "30",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [80, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "Emma Smith",
        position: "CB",
        rating: "84",
        skill: {
          passing: "78",
          shooting: "37",
          tackling: "21",
          saving: "10",
          agility: "76",
          strength: "59",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [230, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "Jim Smith",
        position: "CB",
        rating: "75",
        skill: {
          passing: "33",
          shooting: "76",
          tackling: "76",
          saving: "10",
          agility: "83",
          strength: "73",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [420, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "Emily Smith",
        position: "RB",
        rating: "82",
        skill: {
          passing: "66",
          shooting: "65",
          tackling: "81",
          saving: "10",
          agility: "70",
          strength: "90",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [600, 80],
        fitness: 100,
        injured: false
      },
      {
        name: "Gregory Smith",
        position: "LM",
        rating: "87",
        skill: {
          passing: "51",
          shooting: "88",
          tackling: "81",
          saving: "10",
          agility: "65",
          strength: "85",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [80, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Arthur Smith",
        position: "CM",
        rating: "41",
        skill: {
          passing: "33",
          shooting: "66",
          tackling: "55",
          saving: "10",
          agility: "70",
          strength: "40",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [230, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Diane Smith",
        position: "CM",
        rating: "99",
        skill: {
          passing: "88",
          shooting: "95",
          tackling: "91",
          saving: "10",
          agility: "90",
          strength: "75",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [420, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Colin Smith",
        position: "RM",
        rating: "79",
        skill: {
          passing: "56",
          shooting: "79",
          tackling: "74",
          saving: "10",
          agility: "40",
          strength: "40",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [600, 270],
        fitness: 100,
        injured: false
      },
      {
        name: "Wayne Smith",
        position: "ST",
        rating: "75",
        skill: {
          passing: "83",
          shooting: "88",
          tackling: "59",
          saving: "10",
          agility: "43",
          strength: "76",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [280, 500],
        fitness: 100,
        injured: false
      },
      {
        name: "Aiden Smith",
        position: "ST",
        rating: "88",
        skill: {
          passing: "73",
          shooting: "61",
          tackling: "44",
          saving: "10",
          agility: "43",
          strength: "88",
          penalty_taking: "77",
          jumping: "235"
        },
        currentPOS: [440, 500],
        fitness: 100,
        injured: false
      }
    ]
  };

  // ../../../home/hong/DevWorker/vendor_cache/footballsim-ea35bbd3245af9c822f7db5cb359b119fb60ab33/src/init_config/pitch.json
  var pitch_default = {
    pitchWidth: 680,
    pitchHeight: 1050,
    goalWidth: 90
  };

  // deploy/v48/.g1-first-dock.generated.mjs
  var import_hybrid_v48 = __toESM(require_hybrid_v48(), 1);
  var import_engine_b_candidate = __toESM(require_engine_b_candidate(), 1);
  var import_historical_frl_a_renderer = __toESM(require_historical_frl_a_renderer(), 1);
  var SHA = "ea35bbd3245af9c822f7db5cb359b119fb60ab33";
  var $ = (id) => document.getElementById(id);
  var canvas = $("astra-canvas");
  var ctx = canvas.getContext("2d");
  var clone = (x) => JSON.parse(JSON.stringify(x));
  function fail(code) {
    const e = new Error(code);
    e.code = code;
    throw e;
  }
  function point(x) {
    return Array.isArray(x) ? { x: Number(x[0]), y: Number(x[1]) } : { x: Number(x?.x), y: Number(x?.y) };
  }
  function donorToSemantic(x) {
    const d = point(x);
    return { x: d.y, y: d.x };
  }
  function semanticToDonor(p) {
    return { x: Number(p.y), y: Number(p.x) };
  }
  function putPoint(o, k, p) {
    o[k] = Array.isArray(o[k]) ? [p.x, p.y] : { x: p.x, y: p.y };
  }
  function teams(m) {
    return [m.kickOffTeam, m.secondTeam];
  }
  function playerId(p) {
    return p.playerID ?? p.id ?? p.playerId;
  }
  function pos(p) {
    return donorToSemantic(p.currentPOS ?? p.position ?? p.pos);
  }
  function roster(m) {
    return teams(m).flatMap((t, team) => (t.players || []).map((player) => ({ player, id: playerId(player), team })));
  }
  function donorTeam(m, i) {
    return teams(m)[i].teamID;
  }
  function donorTeamEquals(a, b) {
    return a === b || String(a) === String(b);
  }
  function activeFlight(b) {
    return [b.flight, b.ballOverIterations, b.flightPath].some((x) => Array.isArray(x) ? x.length : Number(x) > 0);
  }
  function observation(m, { restart = false } = {}) {
    const b = m.ball || {}, rs = roster(m);
    if (m.endIteration === true && !restart) return { kind: "SKIP", code: "DONOR_RESTART_BOUNDARY" };
    if (b.withPlayer !== true || activeFlight(b)) return { kind: "SKIP", code: "DONOR_TRANSITIONAL" };
    const refs = [b.Player, b.player, b.ownerId].filter((x) => x != null);
    if (!refs.length) return { kind: "SKIP", code: "DONOR_OWNER_PENDING" };
    const matches = refs.map((id) => rs.filter((p) => String(p.id) === String(id)));
    if (matches.some((x) => x.length !== 1) || matches.some((x) => x[0] !== matches[0][0])) return { kind: "INVALID_FAIL_CLOSED", code: "DONOR_OWNER_INVALID" };
    const owner = matches[0][0];
    if (!donorTeamEquals(b.withTeam, donorTeam(m, owner.team))) return { kind: "SKIP", code: "DONOR_TEAM_PENDING" };
    return { kind: "STABLE_CONTROLLED", owner };
  }
  function toCanonical(m, { allowRestartBoundary = false } = {}) {
    const rs = roster(m), o = observation(m, { restart: allowRestartBoundary });
    if (o.kind === "INVALID_FAIL_CLOSED") fail(o.code);
    const pp = m.pitchSize;
    return { tick: m.iteration ?? 0, clock: m.time ?? 0, phase: "play", score: [Number(m.kickOffTeamStatistics?.goals || 0), Number(m.secondTeamStatistics?.goals || 0)], possessionTeam: o.owner?.team ?? null, donorPitch: { length: Number(pp[1]), width: Number(pp[0]) }, players: rs.map(({ player, id, team }) => ({ id, team, role: player.position ?? player.role ?? "CM", ...pos(player) })), ball: { ...donorToSemantic(m.ball.position), z: Number(m.ball.z ?? 0.15), ownerId: o.owner?.id ?? null, mode: o.owner ? "controlled" : "loose" } };
  }
  function setPlayerPos2(p, q) {
    putPoint(p, p.currentPOS != null ? "currentPOS" : p.position != null ? "position" : "pos", q);
  }
  function patchControlled(m, canonical) {
    const players = new Map(canonical.players.map((p) => [p.id, p]));
    for (const { player, id } of roster(m)) {
      const q = players.get(id);
      if (q) setPlayerPos2(player, semanticToDonor(q));
      player.hasBall = false;
    }
    putPoint(m.ball, "position", semanticToDonor(canonical.ball));
    m.ball.withPlayer = true;
    m.ball.Player = canonical.ball.ownerId;
    if (Object.hasOwn(m.ball, "player")) m.ball.player = canonical.ball.ownerId;
    if (Object.hasOwn(m.ball, "ownerId")) m.ball.ownerId = canonical.ball.ownerId;
    m.ball.withTeam = donorTeam(m, canonical.possessionTeam);
    m.ball.flight = null;
    m.ball.flightPath = [];
    m.ball.ballOverIterations = [];
    const owner = roster(m).find((p) => p.id === canonical.ball.ownerId);
    if (!owner) fail("PATCH_OWNER_INVALID");
    owner.player.hasBall = true;
  }
  function restartPoint(m, b) {
    const pp = m.pitchSize;
    return { x: Number(b.y) * Number(pp[0]) / 68, y: Number(b.x) * Number(pp[1]) / 105 };
  }
  function nativeRestart(live2, scene) {
    const m = live2.match, type = scene.terminal.type, p = restartPoint(m, scene.canonicalState.ball), team = scene.terminal.event?.team;
    if (!Number.isInteger(team)) fail("RESTART_AWARDED_TEAM_MISSING");
    let fn;
    if (type === "freeKick") {
      m.ball.position = [p.x, p.y, 0];
      fn = team === 0 ? setSetpieceKickOffTeam : setSetpieceSecondTeam;
    } else if (type === "corner") {
      const top = p.y <= m.pitchSize[1] / 2, left = p.x <= m.pitchSize[0] / 2;
      fn = top ? left ? setTopLeftCornerPositions : setTopRightCornerPositions : left ? setBottomLeftCornerPositions : setBottomRightCornerPositions;
    } else if (type === "goalKick") fn = p.y <= m.pitchSize[1] / 2 ? setTopGoalKick : setBottomGoalKick;
    else if (type === "throwIn") fn = p.x <= m.pitchSize[0] / 2 ? team === 0 ? setLeftKickOffTeamThrowIn : setLeftSecondTeamThrowIn : team === 0 ? setRightKickOffTeamThrowIn : setRightSecondTeamThrowIn;
    else fail("NATIVE_RESTART_TYPE_INVALID");
    fn(m, [p.x, p.y, 0]);
    const o = observation(m, { restart: true });
    if (o.kind !== "STABLE_CONTROLLED" || o.owner.team !== team || m.endIteration !== true) fail("NATIVE_RESTART_OWNERSHIP_INVALID");
  }
  function nativeGoal(live2, scene, scorerId) {
    const m = live2.match, before = [m.kickOffTeamStatistics.goals, m.secondTeamStatistics.goals], after = scene.canonicalState.score, scoring = after.findIndex((v, i) => v === before[i] + 1 && after[1 - i] === before[1 - i]), scorer = roster(m).find((x) => x.team === scoring && x.id === scorerId);
    if (scoring < 0 || !scorer) fail("GOAL_SCORE_DISAGREEMENT");
    m.ball.lastTouch = { playerName: scorer.player.playerName, playerID: scorer.id, teamID: donorTeam(m, scoring) };
    (scoring === 0 ? setKickOffTeamGoalScored : setSecondTeamGoalScored)(m);
  }
  var live;
  var harness;
  function create(seed) {
    setMatchSeed(Number(seed) || 496001);
    live = { match: initiateGame(clone(team1_default), clone(team2_default), clone(pitch_default)), paused: false, identity: `REAL-BROWSER_BUNDLED-${SHA}`, readState() {
      return toCanonical(this.match, { allowRestartBoundary: true });
    }, advance() {
      if (!this.paused) playIteration(this.match);
    }, pause() {
      this.paused = true;
    }, resume() {
      this.paused = false;
    }, patchState(next) {
      if (["goal", "corner", "goalKick", "throwIn", "freeKick"].includes(next.lastHybridTerminal)) return;
      patchControlled(this.match, next);
    } };
    const initial = toCanonical(live.match), initialCanonical = import_hybrid_v48.default.DonorAdapter.toCanonical(initial, { pitch: initial.donorPitch }), initialGK = initialCanonical.players.find((p) => p.team === 0 && String(p.role).toUpperCase() === "GK");
    if (!initialGK || Math.abs(initialGK.x) > 0.5 || Math.abs(initialGK.y - 34) > 1) fail("DONOR_AXIS_ORIENTATION_INVALID");
    const protagonistId = initial.ball.ownerId;
    if (!Number.isInteger(protagonistId)) fail("G1_INITIAL_CURRENT_OWNER_REQUIRED");
    mappings = { save: { kind: "controlledPossession", requiresStableControlled: true }, claim: { kind: "controlledPossession", requiresStableControlled: true }, block: { kind: "controlledPossession", requiresStableControlled: true }, goal: { apply(next, scene) {
      nativeGoal(live, scene, scene.evidence?.playerId);
      next.lastHybridTerminal = "goal";
      return { ok: true, state: next, terminalType: "goal" };
    } }, corner: { apply(next, scene) {
      nativeRestart(live, scene);
      next.lastHybridTerminal = "corner";
      return { ok: true, state: next, terminalType: "corner" };
    } }, goalKick: { apply(next, scene) {
      nativeRestart(live, scene);
      next.lastHybridTerminal = "goalKick";
      return { ok: true, state: next, terminalType: "goalKick" };
    } }, throwIn: { apply(next, scene) {
      nativeRestart(live, scene);
      next.lastHybridTerminal = "throwIn";
      return { ok: true, state: next, terminalType: "throwIn" };
    } }, freeKick: { apply(next, scene) {
      nativeRestart(live, scene);
      next.lastHybridTerminal = "freeKick";
      return { ok: true, state: next, terminalType: "freeKick" };
    } }, offside: { kind: "unsupported", code: "ADAPTER_OFFSIDE_UNSUPPORTED_NO_NATIVE_RESTART" } };
    harness = new import_hybrid_v48.default.HybridMatchController({ donor: live, donorContract: { pitch: initial.donorPitch, terminalMappings: mappings }, aEngine: import_engine_b_candidate.default, protagonistId, replayLimit: 180 });
    return protagonistId;
  }
  var renderer = (0, import_historical_frl_a_renderer.createHistoricalRenderer)(canvas);
  var visibleError = null;
  var frameSamples = 0;
  var donorCallsAtDock = 0;
  var donorCallsAtHandback = null;
  var postHandbackCalls = 0;
  var lastIdentity = null;
  var retainedSceneId = null;
  var donorAdvanceCalls = 0;
  var selected = null;
  function inspect() {
    return harness && harness.pending && harness.pending.session ? import_hybrid_v48.default.ASceneAdapter.inspect(harness.pending.session) : null;
  }
  function donorCalls() {
    return donorAdvanceCalls;
  }
  function showAuthority(label) {
    $("phase").textContent = label;
  }
  function renderA(frame, label) {
    renderer.draw(frame, { protagonistId: harness.protagonistId, selectedId: selected, phaseLabel: label });
  }
  function diagnostics() {
    return { pageStarted: !!harness, interactiveChoicePresent: !!(harness && harness.state === import_hybrid_v48.default.STATES.INTERACTIVE_PENDING && harness.pending.candidates.length), retainedAIdentity: !!(harness && harness.retainedSession && harness.retainedSession.match === lastIdentity), retainedAIdentityMarker: retainedSceneId, frameSampleCount: frameSamples, donorCallCountFrozenDuringA: donorCallsAtHandback === null ? 0 : Math.max(0, donorCallsAtHandback - donorCallsAtDock), handbackComplete: !!(harness && harness.handoffCount), twoPostHandbackDonorCalls: postHandbackCalls >= 2, state: harness ? harness.state : "READY", error: visibleError || harness && harness.error || null, seed: $("seed").value, rendererLineage: renderer.lineage, choice: harness && harness.lastScene ? harness.lastScene.evidence : null };
  }
  function render() {
    const d = diagnostics(), boot = $("boot-status");
    $("diag").textContent = JSON.stringify(d, null, 2);
    boot.dataset.error = d.error ? "1" : "0";
    boot.textContent = d.error ? "Start failed: " + d.error : !harness ? "Ready to start first dock" : harness.state === import_hybrid_v48.default.STATES.INTERACTIVE_PENDING ? "A scene ready · choose SAFE_PASS or PROGRESSIVE_PASS" : harness.state === import_hybrid_v48.default.STATES.SCENE_RUNNING ? "A scene executing" : "Donor resumed";
    $("authority").textContent = harness ? { INTERACTIVE_PENDING: "Donor background paused → A waiting for choice", SCENE_RUNNING: "Donor background paused → A executing", MACRO_RUNNING: d.handbackComplete ? "Donor resumed" : "Donor background ready" }[harness.state] || harness.state : "Not started";
    if (!harness) return;
    if (harness.state === import_hybrid_v48.default.STATES.INTERACTIVE_PENDING) {
      const a = inspect();
      if (a) renderA(a, "A waiting for choice");
      const buttons = harness.pending.candidates.map((c) => {
        const b = document.createElement("button");
        b.textContent = c.id + " → target " + c.targetId;
        b.dataset.choiceId = c.id;
        b.dataset.targetId = String(c.targetId);
        b.onclick = () => choose(c);
        return b;
      });
      $("choices").replaceChildren(...buttons);
    } else if (harness.state === import_hybrid_v48.default.STATES.MACRO_RUNNING && harness.lastScene) {
      const frames = harness.lastScene.displayFrames, a = frames[frames.length - 1];
      if (a) renderA(a, "Donor resumed after same-object handback");
      $("choices").textContent = "Handback complete. Continue donor twice to verify retained donor continuation.";
    }
  }
  async function choose(c) {
    if (!harness || harness.state !== import_hybrid_v48.default.STATES.INTERACTIVE_PENDING) return;
    selected = c.targetId;
    $("choices").replaceChildren();
    showAuthority("Donor background paused → A executing");
    const exact = { choiceId: c.id, targetId: c.targetId, playerId: harness.protagonistId, generation: c.generation, sceneId: c.sceneId, choiceRevision: c.choiceRevision, sourceStateDigest: c.sourceStateDigest };
    let out;
    try {
      out = harness.submitAction(exact);
    } catch (e) {
      visibleError = e.code || e.message;
      render();
      return;
    }
    donorCallsAtHandback = donorCalls();
    if (!out.ok) {
      visibleError = out.code;
      render();
      return;
    }
    const frames = out.displayFrames || [];
    if (frames.length < 3) {
      visibleError = "G1_RENDER_FRAME_MINIMUM_FAILED";
      render();
      return;
    }
    for (const frame of frames) {
      frameSamples++;
      renderA(frame, "A executing · raw retained Match.inspect() frame");
      await new Promise((r) => setTimeout(r, 18));
    }
    lastIdentity = harness.retainedSession.match;
    render();
  }
  function start() {
    visibleError = null;
    frameSamples = 0;
    postHandbackCalls = 0;
    donorCallsAtHandback = null;
    donorAdvanceCalls = 0;
    selected = null;
    try {
      create($("seed").value);
      const originalAdvance = live.advance.bind(live);
      live.advance = function() {
        const go = !this.paused;
        if (go) donorAdvanceCalls++;
        return originalAdvance();
      };
      lastIdentity = harness.retainedSession && harness.retainedSession.match;
      const dock = harness.openTestOnlyCurrentDock();
      if (!dock.ok) throw Object.assign(new Error(dock.code), { code: dock.code });
      retainedSceneId = dock.sceneId;
      donorCallsAtDock = donorCalls();
      renderA(dock.aInspect, "A waiting for choice");
    } catch (e) {
      visibleError = e.code || e.message;
    }
    render();
  }
  function continueDonor() {
    if (!harness || harness.state !== import_hybrid_v48.default.STATES.MACRO_RUNNING || !harness.handoffCount) return;
    for (let i = 0; i < 2; i++) {
      const before = donorCalls();
      harness.advanceMacro();
      if (donorCalls() > before) postHandbackCalls++;
    }
    render();
  }
  $("seed").value = "496001";
  $("start").onclick = start;
  $("continue").onclick = continueDonor;
  window.__V48_G1_FIRST_DOCK_TEST_ONLY__ = Object.freeze({ status: diagnostics, start, select(choiceId, targetId) {
    const c = harness && harness.pending && harness.pending.candidates.find((x) => x.id === choiceId && x.targetId === targetId);
    if (!c) throw Error("G1_TEST_HOOK_EXACT_CHOICE_NOT_PRESENT");
    return choose(c);
  }, continueDonor });
  if (new URLSearchParams(location.search).get("autostart") === "1") start();
  render();
})();
