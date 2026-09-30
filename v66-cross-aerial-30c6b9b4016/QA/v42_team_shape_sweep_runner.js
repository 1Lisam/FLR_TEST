#!/usr/bin/env node
'use strict';

/* QA-only model-free batch wrapper.  It imports the existing production
 * observation path and detector; it does not write runtime/player state. */
const fs=require('fs'),path=require('path');
const {captureActualPath}=require('./v42_oracle_observation_adapter');
const {detect}=require('./v42_team_shape_collapse_detector');
const {adjudicate}=require('./v42_oracle_watch_adjudication');

const ROOT=path.resolve(__dirname,'..');
const HISTORICAL=[
  ...Array.from({length:34},(_,i)=>({role:'ST',player:'H-ST',prefix:'V42-ORACLE-100-ST',n:i+1})),
  ...Array.from({length:33},(_,i)=>({role:'CM',player:'H-CM',prefix:'V42-ORACLE-100-CM',n:i+1})),
  ...Array.from({length:33},(_,i)=>({role:'CB',player:'H-LCB',prefix:'V42-ORACLE-100-CB',n:i+1}))
];
const FRESH_ROLES=[['ST','H-ST'],['CM','H-CM'],['CB','H-LCB']];
const finite=x=>Number.isFinite(Number(x));
const num=x=>finite(x)?Number(Number(x).toFixed(3)):null;
function arg(name,def=null){const i=process.argv.indexOf(name);return i<0?def:process.argv[i+1]??def;}
function int(name,def){const x=Number(arg(name,def));if(!Number.isInteger(x)||x<0)throw Error(`INVALID_${name.slice(2).toUpperCase()}`);return x;}
function usage(){console.log('Usage: node QA/v42_team_shape_sweep_runner.js [--corpus historical|fresh] [--seed SEED] [--start N] [--count N] [--hero-role ST|CM|CB] [--hero-player-id ID] [--output PATH]');}
function specs(){
  const corpus=arg('--corpus','fresh').toLowerCase(), exact=arg('--seed',null), start=int('--start',1), count=int('--count',1);
  if(!['historical','fresh'].includes(corpus))throw Error('INVALID_CORPUS');
  if(exact){const role=arg('--hero-role','ST').toUpperCase(),player=arg('--hero-player-id',role==='CB'?'H-LCB':`H-${role}`);return [{seed:exact,heroRole:role,heroPlayerId:player,index:null,corpus:'explicit'}];}
  if(start<1)throw Error('START_IS_ONE_BASED');
  if(corpus==='historical')return HISTORICAL.slice(start-1,start-1+count).map((x,i)=>({seed:`${x.prefix}-${String(x.n).padStart(2,'0')}`,heroRole:x.role,heroPlayerId:x.player,index:start+i,corpus}));
  return Array.from({length:count},(_,i)=>{const n=start+i,[role,player]=FRESH_ROLES[i%FRESH_ROLES.length];return{seed:`V42-SHAPE-SWEEP-FRESH-${role}-${String(n).padStart(3,'0')}`,heroRole:role,heroPlayerId:player,index:n,corpus};});
}
function compactFrame(frame,layer){return{layer,time:num(frame.time),phase:frame.phase||null,boundaryType:frame.boundaryType||null,reason:frame.reason||null,event:frame.event||null,restart:frame.restart===true,scrambleEvidence:frame.scrambleEvidence===true,ball:frame.ball||null,players:(frame.players||[]).map(p=>({id:p.id,team:p.team,role:p.role,x:p.x,y:p.y,vx:p.vx||0,vy:p.vy||0,tx:p.tx,ty:p.ty,action:p.action||p.tacticalTask||null,markTargetId:p.markTargetId||null,responsibility:p.responsibilityReason||p.responsibility||null}))};}
function observationFrames(o){
  const rows=[];
  for(const f of o.lowResPreFrames||[])rows.push(compactFrame(f,'LOW_RES_PRE_BOUNDARY'));
  if(o.boundary?.lowRes)rows.push(compactFrame(o.boundary.lowRes,'LOW_RES_BOUNDARY'));
  for(const f of o.frames||[])rows.push(compactFrame(f,'V06_IN_SCENE'));
  return rows.filter(f=>finite(f.time)&&f.players.length===22).sort((a,b)=>a.time-b.time);
}
function evaluateEpisode(spec){
  let o,error=null;try{o=captureActualPath({seed:spec.seed,heroRole:spec.heroRole,heroPlayerId:spec.heroPlayerId,durationSeconds:1800});}catch(e){error={name:e.name,message:e.message};o={seed:spec.seed,frames:[],lowResPreFrames:[],missing:['CAPTURE_ERROR']};}
  const states=observationFrames(o), failures=[];
  for(const frame of states)for(const team of ['HOME','AWAY']){const d=detect(frame,team);if(d.flagged)failures.push({team,layer:frame.layer,time:frame.time,phase:frame.phase,signals:d.signals,legal:d.legal,metrics:d.m});}
  const watch=adjudicate({frames:states.filter(f=>f.layer==='V06_IN_SCENE')});
  const stateClassification={HARD_FAIL:failures.length,CLEAN:states.length*2-failures.length};
  const classification=failures.length?'HARD_FAIL':watch.watch?'WATCH':'CLEAN';
  const first=failures[0]||null;
  return{episodeId:spec.index==null?null:`E${String(spec.index).padStart(3,'0')}`,seed:spec.seed,corpus:spec.corpus,heroRole:spec.heroRole,heroPlayerId:spec.heroPlayerId,boundaryReached:!!o.boundary,boundaryTime:o.boundary?.time??null,stateCount:states.length,layerStateCounts:states.reduce((a,f)=>(a[f.layer]=(a[f.layer]||0)+1,a),{}),stateClassification,classification,firstFail:first?{team:first.team,layer:first.layer,path:first.layer==='V06_IN_SCENE'?'V06_IN_SCENE':'HYBRID_LOW_RES',time:first.time,phase:first.phase,signals:first.signals,legal:first.legal}:null,detectorFailureCount:failures.length,watchEvidence:watch.watch?{reason:watch.watch.reason,scenes:watch.watch.scenes.slice(0,10)}:null,missing:o.missing||[],captureError:error};
}
function run(){
  if(process.argv.includes('--help')){usage();return null;}
  const selected=specs(),results=selected.map(evaluateEpisode),counts=Object.fromEntries(['HARD_FAIL','WATCH','CLEAN'].map(x=>[x,results.filter(r=>r.classification===x).length]));
  const reps=results.filter(r=>r.classification!=='CLEAN').slice(0,10).map(r=>({seed:r.seed,heroRole:r.heroRole,heroPlayerId:r.heroPlayerId,classification:r.classification,firstFail:r.firstFail,watchEvidence:r.watchEvidence}));
  const out={schemaVersion:'V42_TEAM_SHAPE_SWEEP_1.0',truth:{USER_FAIL_OPEN:'OPEN',STEP79:'NOT_STARTED',productionGameplayChanged:false,deploymentPerformed:false,broadRunPerformed:results.length>3},source:{head:process.env.V42_REPO_HEAD||'NOT_SUPPLIED',path:'captureActualPath -> existing TEAM_SHAPE_COLLAPSE detector; V06 WATCH adjudicator'},request:{requestedEpisodes:selected.length,corpus:selected[0]?.corpus||null},summary:{episodes:results.length,...counts,states:results.reduce((n,r)=>n+r.stateCount,0),detectorFailures:results.reduce((n,r)=>n+r.detectorFailureCount,0),representativeCap:10},representatives:reps,episodes:results};
  const output=arg('--output',null);if(output){const target=path.resolve(ROOT,output);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n');}
  console.log(JSON.stringify({schemaVersion:out.schemaVersion,summary:out.summary,representatives:out.representatives,output:output?path.resolve(ROOT,output):null},null,2));return out;
}
if(require.main===module){try{run();}catch(e){console.error(e.stack);usage();process.exitCode=1;}}
module.exports={evaluateEpisode,observationFrames,run,specs};
