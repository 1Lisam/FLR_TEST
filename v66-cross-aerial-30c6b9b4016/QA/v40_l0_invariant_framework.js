'use strict';
const assert=require('assert');
const P0=require('./v40_p0_set_piece_wrong_end_detector.js');
const n=v=>Number(v), finite=v=>Number.isFinite(n(v));
const ids=f=>(f?.players||[]).map(p=>p.id);
const checks=[
 {id:'INVALID_NUMERIC_STATE',severity:'P0',run:f=>(f.players||[]).some(p=>['x','y','tx','ty'].some(k=>!finite(p[k])))||['x','y'].some(k=>!finite(f.ball?.[k]))},
 {id:'IMPOSSIBLE_PLAYER_TARGET_REFERENCE',severity:'P0',run:f=>(f.players||[]).some(p=>(p.targetId||p.markTargetId)&&!ids(f).includes(p.targetId||p.markTargetId))},
 {id:'DUPLICATE_INVALID_POSSESSION_OWNER',severity:'P0',run:f=>{const o=f.ball?.ownerId;if(o&&!ids(f).includes(o))return true;return !!(o&&f.possession&&f.possession!==((f.players||[]).find(p=>p.id===o)||{}).team);}},
 {id:'SCORE_GOAL_EVENT_CONTRADICTION',severity:'P0',run:f=>{const e=(f.events||[]).filter(x=>x.type==='GOAL');const s=f.score||{};return Object.values(s).some(v=>!Number.isInteger(v)||v<0)||(f.observableGoalCount!=null&&e.length!==f.observableGoalCount);}},
 {id:'FORBIDDEN_FORCED_READY_WHEN_P0_RED',severity:'P0',run:f=>f.readiness?.forced===true&&f.readiness?.wrongEndRequiredTarget===true&&f.readiness?.ready===true},
 {id:'PROTAGONIST_UNSELECTED_ACTION_TARGET',severity:'P0',run:f=>f.protagonistExplicitActionRequired===true&&(f.selectedChoiceId==null||f.selectedTargetId==null)&&f.actionExecuted===true}
];
function fixture(id,bad){const p={id:'H-ST',team:'HOME',role:'ST',x:50,y:34,tx:50,ty:34};const f={players:[p],ball:{x:50,y:34,mode:'CONTROLLED'},score:{HOME:0,AWAY:0}};
 if(!bad)return f;
 if(id==='INVALID_NUMERIC_STATE')f.ball.x=NaN;
 if(id==='IMPOSSIBLE_PLAYER_TARGET_REFERENCE')p.targetId='MISSING';
 if(id==='DUPLICATE_INVALID_POSSESSION_OWNER')f.ball.ownerId='MISSING';
 if(id==='SCORE_GOAL_EVENT_CONTRADICTION'){f.events=[{type:'GOAL'}];f.observableGoalCount=0;}
 if(id==='FORBIDDEN_FORCED_READY_WHEN_P0_RED')f.readiness={forced:true,wrongEndRequiredTarget:true,ready:true};
 if(id==='PROTAGONIST_UNSELECTED_ACTION_TARGET'){f.protagonistExplicitActionRequired=true;f.actionExecuted=true;}
 return f;
}
function run({disable=[]}={}){const rows=checks.map(c=>{const bad=c.run(fixture(c.id,true)),control=c.run(fixture(c.id,false));return{...c,badDetected:bad,controlDetected:control,disabled:disable.includes(c.id),ok:!disable.includes(c.id)&&bad===true&&control===false};});
 const p0=P0.run(),p0Disabled=disable.includes('SET_PIECE_WRONG_END_REQUIRED_TARGET');return{module:'V40_L0_INVARIANT_FRAMEWORK',schemaVersion:'V40_L0_1.0',verdict:rows.every(x=>x.ok)&&p0.verdict==='PASS'&&!p0Disabled?'PASS':'BLOCKED',invariants:rows,p0SetPieceWrongEnd:{id:'SET_PIECE_WRONG_END_REQUIRED_TARGET',severity:'P0',disabled:p0Disabled,verdict:p0Disabled?'DISABLED':p0.verdict,source:'V40_P0_SET_PIECE_WRONG_END_DETECTOR'},coverage:{registered:rows.length+1,p0:rows.filter(x=>x.severity==='P0').length+1},policy:{genericRegistry:true,actualStateShapes:true,badAndControlFixtures:true,featureIndependent:true,wrongEndUsesPhysicalGoalRelation:true,disabledRequiredDetectorBlocks:true}};}
function selftest(){const out=run(),disabled=run({disable:['INVALID_NUMERIC_STATE']});assert.equal(out.verdict,'PASS');assert.equal(disabled.verdict,'BLOCKED');return{module:out.module,selftest:'PASS',invariants:out.invariants.map(x=>({id:x.id,ok:x.ok})),disabledDetector:disabled.verdict,p0:out.p0SetPieceWrongEnd};}
if(require.main===module){const st=process.argv.includes('--selftest'),out=st?selftest():run();console.log(JSON.stringify(out,null,2));if(!st&&out.verdict!=='PASS')process.exitCode=13;}
module.exports={checks,fixture,run,selftest};
