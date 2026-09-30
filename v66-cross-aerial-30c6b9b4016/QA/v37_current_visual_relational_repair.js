'use strict';
const assert=require('assert'),path=require('path');
require('./v37_movement_gate_luna_calibration.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const G=require('./v37_whole_team_movement_sanity_gate.js');
const runtimeDir=path.resolve(__dirname,'../runtime'), reports=[
 ['GK_SHOT_CLOSE','FINAL-MATCH-TEST-30'],['GK_SHOT_BOX','FINAL-MATCH-TEST-12'],['ST_BREAKAWAY','FINAL-MATCH-TEST-12'],
 ['CROSS_RIGHT','FINAL-MATCH-TEST-12'],['CROSS_LEFT','FINAL-MATCH-TEST-12'],['FREE_KICK_DEFEND_LEFT','FINAL-MATCH-TEST-10'],
 ['FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-10'],['FREE_KICK_ATTACK_LEFT','FINAL-MATCH-TEST-6'],['CORNER_DEFEND_RIGHT','FINAL-MATCH-TEST-6'],
 ['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-6'],['CORNER_ATTACK_RIGHT','FINAL-MATCH-TEST-4'],['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-4'],['CORNER_ATTACK_LEFT','FINAL-MATCH-TEST-1']
];
const out=[];function first(rows,pred){return rows.find(pred)||null;}function check(name,ok,detail=''){out.push({name,ok,detail});if(!ok)throw new Error(`${name}${detail?`:${detail}`:''}`);}function wholeTeamOk(a){return a.verdict!=='FAIL'&&!a.findings.some(f=>f.severity==='HARD_FAIL');}
check('WHOLE_TEAM_HARD_FAIL_NOT_SWALLOWED',wholeTeamOk({verdict:'FAIL',findings:[{ruleId:'A5',severity:'HARD_FAIL'}]})===false);
for(const [key,seed] of reports){const r=H.run(key,seed,{runtimeDir});check(`${key}/${seed}:NO_PRECOMPUTE`,r.futureOutcomePrecomputed===false);const fs=r.frames||[];check(`${key}/${seed}:FRAMES`,fs.length>1,String(fs.length));
  const firstFrame=fs[0],corner=fs.find(f=>(f.players||[]).some(p=>String(p.tacticalTask||'').startsWith('CORNER_'))),players=corner?.players||[];
  if(corner&&/CORNER/.test(key)){const support=players.filter(p=>p.tacticalTask==='CORNER_REST_DEFENCE_SUPPORT'),rest=players.filter(p=>/^CORNER_REST_DEFENCE_[12]_HOLD$/.test(p.tacticalTask)),edges=players.filter(p=>p.tacticalTask==='CORNER_CLEARANCE_EDGE_HOLD');check(`${key}/${seed}:CORNER_SUPPORT_EXPLICIT`,support.every(p=>!/^CORNER_REST_DEFENCE_[12]_HOLD$/.test(p.tacticalTask)));check(`${key}/${seed}:CORNER_EDGE_SPLIT`,new Set(edges.map(p=>`${Math.round(p.tx)},${Math.round(p.ty)}`)).size===edges.length);check(`${key}/${seed}:CORNER_REST_NOT_SUPPORT`,rest.every(p=>p.tacticalTask!=='CORNER_REST_DEFENCE_SUPPORT'));}
  const fk=fs.find(f=>(f.players||[]).some(p=>String(p.tacticalTask||'').startsWith('FREE_KICK_')));if(fk&&/FREE_KICK/.test(key)){const cm=fk.players.filter(p=>p.role==='CM'&&p.tacticalTask==='FREE_KICK_SECOND_BALL_DEFENCE_HOLD');check(`${key}/${seed}:FK_SECOND_BALL_SPLIT`,new Set(cm.map(p=>`${Math.round(p.tx)},${Math.round(p.ty)}`)).size===cm.length);}
  if(key==='GK_SHOT_CLOSE'||key==='GK_SHOT_BOX'){const term=first(r.actualEvents||[],e=>['GOAL','SAVE','PARRY','PARRY_SAFE','PARRY_DANGER'].includes(e.type));const upto=term?fs.filter(f=>f.time<=term.t):fs;const g0=first(fs,f=>f.players.some(p=>p.id==='H-GK'))?.players.find(p=>p.id==='H-GK');const moved=upto.some(f=>{const g=f.players.find(p=>p.id==='H-GK');return g&&Math.hypot(g.x-g0.x,g.y-g0.y)>.08;});check(`${key}/${seed}:GK_MOVES_BEFORE_TERMINAL`,moved,term?.type||'no-terminal');}
  const analyzed=G.analyze(fs.map((f,i)=>({...f,frameId:`${key}:${i}`,...(i?{precedingLiveFrameId:`${key}:${i-1}`}:{})}))),hard=analyzed.findings.filter(f=>f.severity==='HARD_FAIL').map(f=>f.ruleId);check(`${key}/${seed}:WHOLE_TEAM_ZERO_MANDATORY_HARD_FAIL`,wholeTeamOk(analyzed),hard.join(','));out.push({name:`${key}/${seed}:WHOLE_TEAM`,ok:wholeTeamOk(analyzed),verdict:analyzed.verdict,hard,watch:analyzed.findings.filter(f=>f.severity==='WATCH').map(f=>f.ruleId)});
}
const b=H.run('ST_BREAKAWAY','FINAL-MATCH-TEST-12',{runtimeDir});check('BREAKAWAY:CHOICE_BOUNDARY',!!b.pending);const boundaryTime=b.pending.time??b.frames.at(-1).time;const before=b.frames.length;const choice=b.pending.options[0];const applied=H.applyForcedChoice(choice.id,choice.targetId||null);check('BREAKAWAY:EXACT_CHOICE',applied.ok===true&&applied.result.selectedChoice.targetId===(choice.targetId||null));check('BREAKAWAY:CONTINUATION_FROM_BOUNDARY',applied.result.frames.length>before&&applied.result.frames[before].time>=boundaryTime);console.log(JSON.stringify({module:'V37_CURRENT_VISUAL_RELATIONAL_REPAIR',verdict:out.every(x=>x.ok)?'PASS':'FAIL',checks:out},null,2));if(!out.every(x=>x.ok))process.exitCode=1;
