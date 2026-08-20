'use strict';
const fs=require('fs'),path=require('path');
const srcPath=path.join(__dirname,'tt050_validation_v2.js');
let src=fs.readFileSync(srcPath,'utf8');
const start=src.indexOf('function chooseForHarness('),end=src.indexOf('function hybridCadence(',start);
if(start<0||end<0)throw new Error(`TT050_V3_PATCH_BOUNDARY start=${start} end=${end}`);
const replacement=String.raw`const hybridApplyFailures=[];
function chooseForHarness(pending,index){const opts=pending?.options||[];if(!opts.length)return null;const preferred=['PROGRESSIVE_PASS','THROUGH_PASS','AVAILABLE_PASS','CARRY','SAFE_PASS','HOLD','DELAY','BLOCK_LANE','TACKLE','SHORT_DISTRIBUTION','LONG_DISTRIBUTION'];for(const id of preferred){const rows=opts.filter(o=>o.id===id);if(rows.length)return rows[index%rows.length];}return opts[index%opts.length];}
function tryHarnessChoice(opened,o,boundary,role){try{A.applyChoiceAndAdvance(opened,o.id,o.targetId||null,{maxPostSeconds:12});return true;}catch(err){hybridApplyFailures.push({role,boundaryType:boundary.type,sceneId:boundary.sceneId||null,atSecond:round(opened.state?.m?.time||boundary.atSecond),choiceId:o.id,targetId:o.targetId||null,error:String(err?.message||err),pending:(opened.state?.pending?.options||[]).map(x=>({id:x.id,targetId:x.targetId||null,label:x.label||null}))});const alt=(opened.state?.pending?.options||[]).find(x=>x.targetId==null&&x.id!==o.id);if(alt){try{A.applyChoiceAndAdvance(opened,alt.id,null,{maxPostSeconds:12});return true;}catch(e2){hybridApplyFailures.push({role,boundaryType:boundary.type,sceneId:boundary.sceneId||null,atSecond:round(opened.state?.m?.time||boundary.atSecond),choiceId:alt.id,targetId:null,error:'FALLBACK:'+String(e2?.message||e2)});}}if(opened.state)opened.state.pending=null;return false;}}
function runHighResBoundary(boundary,role,seedIndex){
  let opened;if(boundary.type==='FINAL_2D_WINDOW')opened=A.runFinalWindow(boundary,{runtimeDir:RUNTIME,targetSecond:5400,seed:'TT050-HYB-FINAL-'+role+'-'+seedIndex});else if(boundary.type==='SET_PIECE_2D_WINDOW')opened=A.runSetPieceWindow(boundary,{runtimeDir:RUNTIME,seed:'TT050-HYB-SP-'+role+'-'+seedIndex});else opened=A.runToChoice(boundary,{runtimeDir:RUNTIME,seed:'TT050-HYB-'+role+'-'+seedIndex+'-'+boundary.sceneId});
  const times=[];let guard=0,choiceIndex=0;
  if(boundary.type!=='FINAL_2D_WINDOW')while(opened.state&&!opened.state.m.completed&&guard++<900){
    if(opened.state.pending){const o=chooseForHarness(opened.state.pending,choiceIndex++);if(!o)break;const at=Number(opened.state.m.time.toFixed(3));if(tryHarnessChoice(opened,o,boundary,role))times.push(at);else break;continue;}
    if(!opened.state.activeEpisode)break;opened.P.step(opened.state,.10);
  }
  const snapshot=opened.snapshot||opened.E.snapshot(opened.state.m),events=(opened.state?.m?.events||opened.actualEvents||[]).filter(e=>Number(e.t)>=Number(boundary.atSecond)-.001),result=opened.state?.lastResult||opened.result||null;
  return{snapshot,actualEvents:events,result,hadChoice:times.length>0,choiceTimes:times};
}
`;
src=src.slice(0,start)+replacement+src.slice(end);
const marker="result.hybridCadence=hybridCadence();result.highResStress=highResStress();";
if(!src.includes(marker))throw new Error('TT050_V3_RESULT_MARKER_MISSING');
src=src.replace(marker,"result.hybridCadence=hybridCadence();result.hybridApplyFailures=hybridApplyFailures;check(!hybridApplyFailures.length,`Hybrid visible choice application failures ${JSON.stringify(hybridApplyFailures)}`);result.highResStress=highResStress();");
eval(src);
