'use strict';
const fs=require('fs'),path=require('path');
require('./v39_runtime_candidate_loader.js');
const H=require('../final_match_rare_scenario_harness.js');
global.FLRPG_FINAL_MATCH_RARE_SCENARIOS=H;
require('../final_match_v37_forced_harness_patch.js');
const runtimeDir=path.resolve(__dirname,'../runtime');

function pickAdvance(pending){
  const opts=Array.isArray(pending?.options)?pending.options:[];
  return opts.find(o=>/SPACE|ADVANCE|CARRY|전진/i.test(`${o.id||''} ${o.label||''}`))||opts[0]||null;
}
function pickShot(pending){
  const opts=Array.isArray(pending?.options)?pending.options:[];
  return opts.find(o=>/SHOT|SHOOT|슛|슈팅/i.test(`${o.id||''} ${o.label||''}`))||opts.find(o=>!/SPACE|ADVANCE|CARRY|전진/i.test(`${o.id||''} ${o.label||''}`))||opts[0]||null;
}
function validCursor(cursor,before,total){return Number.isInteger(cursor)&&cursor>=Math.max(0,before-1)&&cursor<total;}
function run(){
  let result;try{result=H.run('ST_BREAKAWAY','FINAL-MATCH-TEST-95',{runtimeDir});}catch(err){return{module:'V39_PRESENTATION_TRUTH_GATE',verdict:'BLOCKED',reason:'HARNESS_ERROR',error:String(err&&err.stack||err)}}
  const first=pickAdvance(result.pending);if(!first)return{module:'V39_PRESENTATION_TRUTH_GATE',verdict:'BLOCKED',reason:'NO_FIRST_ADVANCE_CHOICE'};
  const beforeFirst=(result.frames||[]).length;let applied1;try{applied1=H.applyForcedChoice(first.id,first.targetId||null);}catch(err){return{module:'V39_PRESENTATION_TRUTH_GATE',verdict:'BLOCKED',reason:'APPLY_FIRST_CHOICE_ERROR',error:String(err&&err.stack||err)}}
  result=applied1?.result||result;const cursor1=Number(result?.replayStartFrameIndex),cursor1Valid=validCursor(cursor1,beforeFirst,(result.frames||[]).length);
  const second=pickShot(result.pending);if(!second)return{module:'V39_PRESENTATION_TRUTH_GATE',verdict:'BLOCKED',reason:'NO_SECOND_SHOT_CHOICE',firstChoice:{id:first.id,targetId:first.targetId||null},metric:{beforeFirst,afterFirst:(result.frames||[]).length,replayStartFrameIndex1:Number.isFinite(cursor1)?cursor1:null,cursor1Valid}};
  const beforeSecond=(result.frames||[]).length;let applied2;try{applied2=H.applyForcedChoice(second.id,second.targetId||null);}catch(err){return{module:'V39_PRESENTATION_TRUTH_GATE',verdict:'BLOCKED',reason:'APPLY_SECOND_CHOICE_ERROR',error:String(err&&err.stack||err)}}
  result=applied2?.result||result;const cursor2=Number(result?.replayStartFrameIndex),cursor2Valid=validCursor(cursor2,beforeSecond,(result.frames||[]).length),cursorAdvances=cursor1Valid&&cursor2Valid&&cursor2>cursor1;
  const dock=fs.readFileSync(path.resolve(__dirname,'../final_match_test_dock.js'),'utf8'),interactive=fs.readFileSync(path.resolve(__dirname,'../final_match_v37_interactive_dock_patch.js'),'utf8');
  const dockConsumesCursor=/replayStartFrameIndex/.test(dock)&&/slice\s*\(|startIndex|fromIndex/.test(dock),interactiveRequestsContinuation=/replayStartFrameIndex|continuationReplay|replayContinuation/.test(interactive);
  const ok=cursor1Valid&&cursor2Valid&&cursorAdvances&&dockConsumesCursor&&interactiveRequestsContinuation;
  return{module:'V39_PRESENTATION_TRUTH_GATE',verdict:ok?'PASS':'BLOCKED',case:'ST_BREAKAWAY/FINAL-MATCH-TEST-95',firstChoice:{id:first.id,targetId:first.targetId||null},secondChoice:{id:second.id,targetId:second.targetId||null},metric:{beforeFirst,afterFirst:beforeSecond,replayStartFrameIndex1:Number.isFinite(cursor1)?cursor1:null,cursor1Valid,beforeSecond,afterSecond:(result.frames||[]).length,replayStartFrameIndex2:Number.isFinite(cursor2)?cursor2:null,cursor2Valid,cursorAdvances,dockConsumesCursor,interactiveRequestsContinuation},rationale:'Automatic playback after each committed choice must start at that choice continuation boundary. The second choice must advance the cursor beyond the first. Manual full replay may still start at frame 0.'};
}
if(require.main===module){const out=run();console.log(JSON.stringify(out,null,2));if(out.verdict!=='PASS')process.exitCode=6;}
module.exports={run};
