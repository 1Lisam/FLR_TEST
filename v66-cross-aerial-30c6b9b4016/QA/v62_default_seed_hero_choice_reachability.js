#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const H=require('../live_hybrid_session_v02'),S=require('../runtime/continuous_spatial_authority_v2'),A=require('../live_v06_scene_authority_browser');
const ROOT=path.resolve(__dirname,'..'),SEED='LIVE-V03-1-H-ST',HERO='H-ST',deep=v=>JSON.parse(JSON.stringify(v));
const inc=(map,key)=>{map[key]=(map[key]||0)+1;};
const options=seed=>({seed,heroTeam:'HOME',heroRole:'ST',heroPlayerId:HERO,continuousSpatialAuthorityV2Coarse:true});

// Instrument exported production entry points without changing their results,
// randomness, state or targets. Counts cover coarse play and factual HR events.
function observe(session){
  const counts={actions:0,owners:{},roles:{},teams:{},ballModes:{},heroControlledActions:0,passAttempts:0,heroPassAttempts:0,heroPassReleases:0,heroReceptions:0,heroEventActor:0,heroEventTarget:0};
  const saved={advance:S.advanceCoarseTo,owner:S.physicalOwner,pass:S.beginPass},touches=new Set();let cursor=0;
  function readTouches(){for(const t of session.state.spatial.ball.causalHistory||[]){const key=`${t.sequence}:${t.at}:${t.kind}`;if(touches.has(key))continue;touches.add(key);if(t.kind==='PASS_RECEIVE_TOUCH'&&t.playerId===HERO)counts.heroReceptions++;}}
  S.advanceCoarseTo=function(s,end,opts={}){return saved.advance(s,end,{...opts,record(id){inc(counts.ballModes,s.state.spatial.ball.mode);readTouches();opts.record?.(id);}});};
  S.physicalOwner=function(state){const p=saved.owner(state);counts.actions++;if(p&&state.spatial.ball.mode==='CONTROLLED'){inc(counts.owners,p.id);inc(counts.roles,p.role);inc(counts.teams,p.team);if(p.id===HERO)counts.heroControlledActions++;}return p;};
  S.beginPass=function(state,id,at){counts.passAttempts++;if(id===HERO)counts.heroPassAttempts++;const out=saved.pass(state,id,at);if(out&&id===HERO)counts.heroPassReleases++;return out;};
  return{counts,read(){readTouches();for(const e of session.state.resolvedEvents.slice(cursor)){if(e.detail?.actorId===HERO)counts.heroEventActor++;if(e.detail?.targetId===HERO)counts.heroEventTarget++;}cursor=session.state.resolvedEvents.length;},close(){S.advanceCoarseTo=saved.advance;S.physicalOwner=saved.owner;S.beginPass=saved.pass;}};
}
function causalBoundary(b,s){
  assert.equal(b.type,'PROTAGONIST_2D_WINDOW');assert(b.atSecond<5395);
  assert.equal(b.heroPlayerId,HERO);assert.equal(b.heroTeam,'HOME');assert.equal(b.heroRole,'ST');
  const snap=b.stateSnapshot,ball=snap.spatial.ball,hero=snap.spatial.players.find(p=>p.id===b.heroPlayerId);
  assert(hero&&hero.team===b.heroTeam&&hero.role===b.heroRole);
  assert.equal(snap.spatial.boundaryId,b.sceneId);assert.equal(snap.spatial.time,b.atSecond);
  assert.deepStrictEqual(snap.ball,ball);assert.deepStrictEqual(ball,s.state.spatial.ball);
  assert.equal(b.futureOutcomePrecomputed,false);assert.equal(b.choicePrecomputed,false);assert.equal(snap.spatial.futureOutcomePrecomputed,false);
  assert.equal(H.futureEventCount(s),0);
  const source=s.state.resolvedEvents.find(e=>e.id===b.sourceEventId);
  const controlled=ball.mode==='CONTROLLED'&&ball.ownerId===HERO;
  const targeted=ball.mode==='FLIGHT'&&ball.kind==='PASS'&&ball.intendedReceiverId===HERO&&source?.detail?.causalPassRelease===true&&source.detail.targetId===HERO&&source.t===b.atSecond&&['FINAL_THIRD','BOX'].includes(snap.zone);
  assert(controlled||targeted,'boundary must have current physical hero control or a real attacking pass');
  return{at:b.atSecond,actions:s.state.counters.actions,basis:controlled?'PHYSICAL_HERO_CONTROL':'CURRENT_PASS_TO_HERO',ownerId:ball.ownerId,targetId:ball.intendedReceiverId,latestTouch:deep(ball.causalHistory?.at(-1)||null)};
}
function open(b,seed){
  const opts={runtimeDir:path.join(ROOT,'runtime')};
  if(b.type==='NON_HERO_SHOT_2D_WINDOW')return A.runNonHeroShotWindow(b,{...opts,seed:`${seed}-${b.sceneId}-SHOT`,durationSeconds:8});
  if(b.type==='SET_PIECE_2D_WINDOW')return A.runSetPieceWindow(b,{...opts,seed:`${seed}-${b.sceneId}-SETPIECE`,durationSeconds:12});
  return A.runToChoice(b,{...opts,seed:`${seed}-${b.sceneId}`,minPreSeconds:5,maxSearchSeconds:35});
}
function resolve(opened){
  if(!opened.state.pending)return opened;
  // Submit only genuine offered choiceId + targetId pairs through production.
  const out=A.autoResolveEpisode(opened,p=>p.options.find(o=>o.id==='SAFE_PASS')||p.options.find(o=>o.recommended)||p.options[0],{maxChoices:12,maxPostSeconds:12});
  assert(!out.state.pending&&!out.nextPending,'all actual pending choices must be resolved before handback');
  assert.equal(out.futureOutcomePrecomputed,false);
  for(const step of out.choiceSteps){assert.equal(step.applyReceipt.choice,step.selectedChoice.id);assert.equal(step.applyReceipt.targetId??null,step.selectedChoice.targetId??null);assert(step.applyReceipt.commitEventId);}
  return out;
}
function rootRun(){
  const s=H.createSession(options(SEED)),o=observe(s),boundaries=[],heroes=[];let first=null,choices=0;
  try{
    for(let guard=0;guard<1500&&heroes.length<2;guard++){
      const r=H.advanceUntilBoundary(s,{maxActions:6});o.read();if(!r.boundary)continue;
      const b=r.boundary;boundaries.push({type:b.type,at:b.atSecond});
      assert.notEqual(b.type,'FINAL_2D_WINDOW','default seed reached final without two causal opportunities');
      assert.notEqual(r.status,'FINISHED');
      if(b.type==='PROTAGONIST_2D_WINDOW'){heroes.push(causalBoundary(b,s));if(!first)first=deep(o.counts);}
      const opened=open(b,SEED);
      if(b.type==='PROTAGONIST_2D_WINDOW'){
        assert(opened.state.pending,'causal boundary must yield a real visible choice');assert.equal(opened.state.heroPlayerId,HERO);assert.equal(opened.futureOutcomePrecomputed,false);
        const frames=opened.frames||[],received=frames.some((f,i)=>i>0&&f.ball?.mode==='CONTROLLED'&&f.ball.ownerId===HERO&&frames[i-1].ball?.mode==='FLIGHT'&&frames[i-1].ball.intendedReceiverId===HERO);
        Object.assign(heroes.at(-1),{choiceAt:opened.state.m.time,choiceOwnerId:opened.state.m.ball.ownerId,actualHighResReception:received});
      }
      if(heroes.length===2)break;
      const out=resolve(opened);choices+=out.choiceSteps?.length||0;H.resumeFromHighRes(s,out);o.read();
    }
    assert.equal(heroes.length,2);assert(heroes[1].at>heroes[0].at);assert(choices>0);
    assert(boundaries.some(b=>b.type==='NON_HERO_SHOT_2D_WINDOW'&&b.at===30),'normal first nonhero shot semantics');
    return{first,throughSecond:deep(o.counts),heroes,boundaries,committedChoices:choices};
  }finally{o.close();}
}

// Local football fixtures exercise the same integrator, not fake hero windows.
// Both teams must receive moving passes; an intervening opponent can still win.
function passFixture(team,blocked=false){
  const s=H.createSession(options(`V62-PASS-${team}-${blocked}`)),sp=s.state.spatial;
  for(const p of sp.players)Object.assign(p,{x:p.team==='HOME'?5:100,y:5,tx:p.team==='HOME'?5:100,ty:5,vx:0,vy:0});
  const pre=team==='HOME'?'H':'A',other=team==='HOME'?'A':'H',dir=team==='HOME'?1:-1;
  const owner=sp.players.find(p=>p.id===`${pre}-CM`),receiver=sp.players.find(p=>p.id===`${pre}-ST`);
  Object.assign(owner,{x:team==='HOME'?40:65,y:34});Object.assign(receiver,{x:owner.x+dir*18,y:34,vx:dir*3});
  Object.assign(sp.ball,{mode:'CONTROLLED',ownerId:owner.id,x:owner.x,y:34,lastTouchTeam:team,lastTouchPlayerId:owner.id});S.syncBallDerived(s.state);
  if(blocked)Object.assign(sp.players.find(p=>p.id===`${other}-CM`),{x:owner.x+dir*7,y:34});
  assert(S.beginPass(s.state,receiver.id,0));S.refreshIntents(s.state);
  assert.equal(receiver.intent.type,'RECEIVE');assert.equal(sp.ball.ownerId,null,'release cannot preassign the receiver');
  let firstTouch=null;for(let i=0;i<50;i++){S.advanceCoarseTo(s,s.state.second+.1);if(sp.ball.mode==='CONTROLLED'){firstTouch=sp.ball.ownerId;break;}}
  assert(firstTouch,'physical pass contact missing');assert.notEqual(firstTouch,owner.id,'passer immediately re-caught own release');
  if(blocked)assert(firstTouch.startsWith(other+'-'),'opponent interception must remain possible');else assert.equal(firstTouch,receiver.id,'striker must receive through actual trajectory contact');
  return{team,blocked,firstTouch,at:s.state.second};
}
function looseFixture(){
  const s=H.createSession(options('V62-LOOSE-CONTEST')),sp=s.state.spatial;
  for(const p of sp.players)Object.assign(p,{x:p.team==='HOME'?10:95,y:10,vx:0,vy:0});
  Object.assign(sp.players.find(p=>p.id==='H-LCM'),{x:49,y:30});Object.assign(sp.players.find(p=>p.id==='A-CM'),{x:59,y:34});
  Object.assign(sp.ball,{mode:'LOOSE',kind:'CHALLENGE_LOOSE',ownerId:null,intendedReceiverId:null,x:52,y:34,vx:0,vy:0});S.refreshIntents(s.state);
  assert.equal(sp.players.filter(p=>p.intent.type==='RECOVER_LOOSE').length,2);
  assert.notEqual(sp.players.find(p=>p.id===HERO).intent.type,'RECOVER_LOOSE','distant hero must not displace a nearer teammate');
  S.advanceCoarseTo(s,2);assert.equal(sp.ball.mode,'CONTROLLED');assert.notEqual(sp.ball.ownerId,HERO);
  return{ownerId:sp.ball.ownerId};
}
function finalFixture(){
  const seed='V62-FINAL-SEMANTICS',s=H.createSession({...options(seed),durationSeconds:25});
  let b;for(let i=0;i<20;i++){const r=H.advanceUntilBoundary(s,{maxActions:6});if(r.boundary){b=r.boundary;break;}}
  assert.equal(b?.type,'FINAL_2D_WINDOW');assert.equal(b.atSecond,20);assert.equal(b.futureOutcomePrecomputed,false);
  const out=A.runFinalWindow(b,{seed:`${seed}-FINAL`,runtimeDir:path.join(ROOT,'runtime'),targetSecond:25});H.resumeFromHighRes(s,out);
  assert(s.finalWindowDone);assert.equal(H.advanceUntilBoundary(s).status,'FINISHED');return{at:b.atSecond,finishedAt:s.state.second};
}
for(const file of ['live_hybrid_session_v02.js','runtime/continuous_spatial_authority_v2.js'])assert(!fs.readFileSync(path.join(ROOT,file),'utf8').includes(SEED),'literal default-seed runtime branch');
const ui=fs.readFileSync(path.join(ROOT,'step71_hybrid_v06_ui.js'),'utf8');
assert(ui.includes("return q.get('flr_qa_force_legacy_reconstruction')!=='1'"),'root must default to the tested V2 coarse path');
const fixtures={passes:[passFixture('HOME'),passFixture('AWAY'),passFixture('HOME',true)],loose:looseFixture(),final:finalFixture()};
const root=rootRun();
assert(root.heroes.some(h=>h.actualHighResReception),'a real pass must complete to H-ST through the production scene runner');
assert(root.heroes.every(h=>h.choiceOwnerId===HERO),'both visible choices must retain physical H-ST ownership');
// Measured before editing at ea45a2ef; historical diagnostic, not an expected
// outcome quota. Before owner counts are .5 s coarse samples, not actions.
const before={at:5395,actions:675,heroWindows:0,ownerSamples:{'H-CM':20,'A-LCB':40,'H-GK':4},roleSamples:{CM:20,CB:40,GK:4},teamSamples:{HOME:24,AWAY:40},ballModeSamples:{CONTROLLED:64,FLIGHT:14,LOOSE:10695},heroControlledSamples:0,passAttempts:1,heroPassAttempts:0,heroPassReleases:0,heroReceptions:0,heroEventActor:0,heroEventTarget:0};
console.log(JSON.stringify({test:'V62_DEFAULT_SEED_HERO_CHOICE_REACHABILITY',verdict:'PASS',before,root,fixtures,futureOutcomePrecomputed:false,realRootBrowserValidation:'STILL_REQUIRED'},null,2));
