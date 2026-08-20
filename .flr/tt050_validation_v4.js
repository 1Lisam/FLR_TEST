'use strict';
const fs=require('fs'),path=require('path');
const srcPath=path.join(__dirname,'tt050_validation_v2.js');
let src=fs.readFileSync(srcPath,'utf8');

const start=src.indexOf('function chooseForHarness('),end=src.indexOf('function hybridCadence(',start);
if(start<0||end<0)throw new Error(`TT050_V4_PATCH_BOUNDARY start=${start} end=${end}`);
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

const injectAt=src.indexOf('async function workerRoundTrip()');
if(injectAt<0)throw new Error('TT050_V4_INJECT_BOUNDARY_MISSING');
const frozenRegression=String.raw`function frozenTargetRegression(samples=40){const failures=[],kinds={};let tested=0;for(let si=0;si<12&&tested<samples;si++){const s=P.create('TT050-FROZEN-'+si,{heroPlayerId:'H-ST',mode:'PLAYER_ALL'});let guard=0;while(!s.m.completed&&guard++<70000&&tested<samples){P.step(s,.10);if(!s.pending)continue;const targeted=s.pending.options.filter(o=>o.targetId);const o=targeted.find(x=>x.id==='SAFE_PASS')||targeted.find(x=>x.id==='THROUGH_PASS')||targeted[0];if(!o){const a=P.autoPick(s)||s.pending.options[0];if(a){const rr=P.applyChoice(s,a.id,a.targetId||null,{source:'TT050_FROZEN_FILL'});if(!rr.ok)s.pending=null;}continue;}const visible={id:o.id,targetId:o.targetId,label:o.label};const r=P.applyChoice(s,o.id,o.targetId,{source:'TT050_FROZEN_REGRESSION'});tested++;kinds[o.id]=(kinds[o.id]||0)+1;if(!r.ok||(r.targetId||null)!==o.targetId)failures.push({at:Number(s.m.time.toFixed(3)),visible,result:r});if(!r.ok)s.pending=null;}}
  check(tested>=20,'frozen target regression insufficient samples '+tested);check(!failures.length,'frozen visible target execution failures '+JSON.stringify(failures));return{tested,kinds,failures};}

`;
src=src.slice(0,injectAt)+frozenRegression+src.slice(injectAt);
const marker="result.hybridCadence=hybridCadence();result.highResStress=highResStress();";
if(!src.includes(marker))throw new Error('TT050_V4_RESULT_MARKER_MISSING');
src=src.replace(marker,"result.hybridCadence=hybridCadence();if(result.hybridCadence.ST.maxEpisodeChoices===7)watch.push('ST rare 7-choice Episode WATCH; overall density and 5-second burst remain inside gate');check(result.hybridCadence.ST.maxEpisodeChoices<=7,`ST Hybrid episode still too fragmented ${result.hybridCadence.ST.maxEpisodeChoices} choices`);result.hybridApplyFailures=hybridApplyFailures;check(!hybridApplyFailures.length,`Hybrid visible choice application failures ${JSON.stringify(hybridApplyFailures)}`);result.frozenTargetRegression=frozenTargetRegression();result.highResStress=highResStress();");
eval(src);
