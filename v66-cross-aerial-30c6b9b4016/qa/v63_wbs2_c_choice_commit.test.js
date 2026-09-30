'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const UI=require('../in_pitch_choice_ui.js');
const STRIKE=require('../runtime/ball_strike_model.js');
const SEED='V63-WBS2-C1-EXACT-R1';
const deep=x=>JSON.parse(JSON.stringify(x));
function fixture({team='HOME',distance=16,blocked=false}={}){
  const prefix=team==='HOME'?'H':'A',s=P.create(`${SEED}|${team}|${distance}|${blocked}`,{heroPlayerId:`${prefix}-LCM`,mode:'FULL_MATCH'}),m=s.m;
  m.restart=null;m.setPieceLive=null;m.phase='OPEN_PLAY';m.time=100;
  const world=(x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  for(const p of m.players)Object.assign(p,{...world(p.team===team?5:100,5),vx:0,vy:0,nextThink:100,lockTargetUntil:0});
  const owner=m.playersById[s.heroPlayerId],target=m.playersById[`${prefix}-ST`],second=m.playersById[`${prefix}-RW`];
  Object.assign(owner,world(40,34));Object.assign(target,{...world(40+distance,34),vx:team==='HOME'?4:-4,vy:0,tacticalTask:'ST_RELEASE_RUN',runUntil:110,runType:'RELEASE'});
  Object.assign(second,world(48,44));
  if(blocked){for(const [id,x] of [[team==='HOME'?'A-CM':'H-CM',46],[team==='HOME'?'A-LCB':'H-LCB',51]])Object.assign(m.playersById[id],world(x,34));}
  for(const p of m.players){p.tx=p.x;p.ty=p.y;}
  E.choiceActionBridge().setControlled(m,owner,true);owner.nextThink=100;owner.lockTargetUntil=0;owner.controlledSince=99;
  return{s,m,owner,target,second};
}
function pending(f){assert.ok(P.maybeCheckpoint(f.s));return f.s.pending;}
function observe(f){return deep({snapshot:E.snapshot(f.m),events:f.m.events,rng:f.m.r.observe(),pending:f.s.pending,log:f.m.userChoiceLog,seq:f.m.userCommitEventSeq});}
function reject(f,fn){const before=observe(f);assert.equal(fn().ok,false);assert.deepEqual(observe(f),before);}
const gesture=s=>({source:'USER_UI_CLICK_IN_PITCH',confirmedAction:true,actionGestureId:'C1-GESTURE',pendingChoiceId:s.pending.id});
test('same-target feet/through/lob, all legal IDs, floors, target menus and pending freeze',()=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture({team}),before=observe(f),q=P.inspect(f.s);
    assert.deepEqual(observe(f),before,'candidate inspection is current-state and RNG-free');
    const legacy=P.__test.onBallOptionsV42({...q.frame,candidates:q.frame.candidates.filter(c=>c.id!=='LOB_PASS')});
    assert.deepEqual(q.options.filter(o=>o.id!=='LOB_PASS'),legacy,'existing floors and recommendation unchanged');
    const p=pending(f),rows=p.options.filter(o=>o.targetId===f.target.id);
    assert.ok(rows.some(o=>o.id==='THROUGH_PASS'));assert.ok(rows.some(o=>/^(SAFE|PROGRESSIVE|AVAILABLE|SWITCH)_PASS$|^RECYCLE$/.test(o.id)));assert.ok(rows.some(o=>o.id==='LOB_PASS'));
    assert.deepEqual(p.options.filter(o=>o.id==='LOB_PASS').map(o=>o.targetId).sort(),[f.target.id,f.second.id].sort());
    const groups=UI.groupOptions(p.options,f.owner.id,E.snapshot(f.m).players);
    assert.equal(UI.MENU_PAGE_CAPACITY,6);assert.ok(groups.length>1);assert.ok(p.options.length>6,'no global six-option truncation');
    assert.equal(groups.find(g=>g.anchorId===f.target.id).options.length,3);
    const frozen=observe(f);P.step(f.s,.1);assert.deepEqual(observe(f),frozen);
  }
});
test('blocked ground lane retains legal lob; frozen 8–24m endpoints and D1 lead',()=>{
  const f=fixture({blocked:true}),q=P.inspect(f.s);
  assert.ok(E.choiceActionBridge().laneBlockers(f.m,f.owner,f.target,f.target.team==='HOME'?'AWAY':'HOME').length>=2);
  assert.ok(q.options.some(o=>o.id==='LOB_PASS'&&o.targetId===f.target.id));
  for(const distance of [7.999,8,24,24.001])for(const team of ['HOME','AWAY']){
    const f=fixture({team,distance});f.target.vx=team==='HOME'?8:-8;
    const row=P.inspect(f.s).options.find(o=>o.id==='LOB_PASS'&&o.targetId===f.target.id);
    assert.equal(!!row,distance>=8&&distance<=24);
    if(row){assert.ok(Math.hypot(row.meta.leadX-f.target.x,row.meta.leadY-f.target.y)<=4);assert.equal(Math.abs(row.meta.leadX-f.target.x),4);}
  }
});
test('restarts, live set pieces, GK owner/target and NPC exclude lobs',()=>{
  for(const change of [f=>f.m.restart={kind:'FREE_KICK',team:f.owner.team},f=>f.m.setPieceLive={kind:'CORNER'},f=>f.owner.role='GK',f=>f.m.phase='GOAL_CELEBRATION',f=>f.m.protagonistControllerId=null]){
    const f=fixture();change(f);assert.ok(!E.choiceStateBridge().inspect(f.m,f.owner.id).candidates.some(c=>c.id==='LOB_PASS'));
  }
  const f=fixture();f.target.role='GK';assert.ok(!P.inspect(f.s).options.some(o=>o.id==='LOB_PASS'&&o.targetId===f.target.id));
  // Inspecting protagonist choices cannot perturb the next NPC decision or draws.
  const a=fixture(),b=fixture();P.inspect(a.s);a.m.protagonistControllerId=b.m.protagonistControllerId=null;
  const aa=E.choiceActionBridge().chooseOwnerAction(a.m,a.owner),bb=E.choiceActionBridge().chooseOwnerAction(b.m,b.owner);
  assert.deepEqual(deep(aa),deep(bb));assert.deepEqual(a.m.r.observe(),b.m.r.observe());assert.notEqual(aa.physicsProfile,'OPEN_PLAY_LOB_V1');
});
test('wrong, missing, stale and unconfirmed tuples reject without snapshot/events/RNG changes',()=>{
  const f=fixture();pending(f);
  for(const [choice,target,meta] of [['LOB_PASS',null,gesture(f.s)],['LOB_PASS','A-ST',gesture(f.s)],['LOB_PASS','MISSING',gesture(f.s)],['UNKNOWN',f.target.id,gesture(f.s)],['LOB_PASS',f.target.id,{source:'USER_UI_CLICK_IN_PITCH'}],['LOB_PASS',f.target.id,{...gesture(f.s),pendingChoiceId:'OLD'}]])reject(f,()=>P.applyChoice(f.s,choice,target,meta));
  const row=f.s.pending.options.find(o=>o.id==='LOB_PASS'&&o.targetId===f.target.id);
  reject(f,()=>E.choiceStateBridge().applyCandidate(f.m,f.owner.id,'LOB_PASS',f.target.id));
  reject(f,()=>E.choiceStateBridge().applyCandidate(f.m,f.owner.id,'LOB_PASS',f.second.id,'DIRECT_API',row));
  for(const change of [f=>f.m.time+=.1,f=>f.m.phase='KICKOFF',f=>f.m.ball.ownerId=f.second.id,f=>f.target.x+=.01,f=>f.target.vx+=1,f=>f.target.team='AWAY',f=>f.target.role='GK',f=>f.target.x=90,f=>f.m.ball.z=100,f=>f.m.restart={kind:'THROW_IN'},f=>f.m.setPieceLive={kind:'CORNER'},f=>f.m.completed=true,f=>f.m.playersById[f.target.id]={...f.target}]){
    const x=fixture();pending(x);change(x);reject(x,()=>P.applyChoice(x.s,'LOB_PASS',x.target.id,gesture(x.s)));
  }
});
test('confirmed exact gesture produces one B launch/commit receipt and exactly three approved draws',()=>{
  for(const team of ['HOME','AWAY'])for(const targetIndex of [0,1]){
    const f=fixture({team});pending(f);const target=targetIndex?f.second:f.target,b=f.m.ball,origin=deep({x:b.x,y:b.y,z:b.z}),before=f.m.r.observe().drawCount;
    const plan=STRIKE.passPlan({physicsProfile:'OPEN_PLAY_LOB_V1',origin,target});
    const result=P.applyChoice(f.s,'LOB_PASS',target.id,gesture(f.s));assert.equal(result.ok,true);
    assert.equal(f.m.ball,b);assert.equal(b.physicsProfile,'OPEN_PLAY_LOB_V1');assert.equal(b.kind,'PASS');assert.equal(b.ownerId,null);
    assert.equal(f.m.r.observe().drawCount-before,3);assert.equal(b.lobLaunch.rng.after-b.lobLaunch.rng.before,3);
    assert.equal(b.lobLaunch.choiceId,'LOB_PASS');assert.equal(b.lobLaunch.targetId,target.id);assert.equal(b.lobLaunch.commitEventId,result.commitEventId);
    assert.deepEqual(b.lobLaunch.origin,origin);assert.deepEqual(b.lobLaunch.aim,plan.aim);
    assert.equal(f.m.events.filter(e=>e.type==='LOB_LAUNCH').length,1);assert.equal(f.m.events.filter(e=>e.type==='USER_CHOICE'&&e.commitEventId===result.commitEventId).length,1);
    reject(f,()=>P.applyChoice(f.s,'LOB_PASS',target.id,{source:'USER_UI_CLICK_IN_PITCH',confirmedAction:true,actionGestureId:'C1-GESTURE'}));
  }
});
test('read-only root presentation enumerates every pair and its exact choose bridge launches once',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../step71_hybrid_v06_ui.js'),'utf8');
  const build=source.match(/function buildChoice\(p\)\{[^\n]+/)[0],choose=source.match(/^function choose\(id,targetId[^\n]+/m)[0];
  const f=fixture();pending(f);const elements=new Map();
  const element=()=>({children:[],dataset:{},classList:{contains:()=>false,add(){},remove(){}},appendChild(x){this.children.push(x);},addEventListener(){}});
  const context={session:f.s,P,E,deep,document:{createElement:element},$:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    clearTimeout,setTimeout,clearTips(){},ensurePitchChoice:()=>({hide(){}}),selectedStepResults:[],mobileFlowTo(){},performance:{now:()=>1000}};
  vm.createContext(context);vm.runInContext(`${build}\n${choose}\nbuildChoice(session.pending);`,context);
  const labels=elements.get('heroChoiceButtons').children.filter(e=>e.children.length).map(e=>e.children[0].textContent);
  assert.deepEqual(labels,f.s.pending.options.map(o=>o.label),'root has no global six-option truncation');
  assert.ok(labels.some(x=>x.includes('로빙 패스')));
  const before=f.m.r.observe().drawCount;
  vm.runInContext(`choose('LOB_PASS',${JSON.stringify(f.target.id)},{source:'USER_UI_CLICK'});`,context);
  assert.equal(f.m.r.observe().drawCount-before,3);assert.equal(f.m.ball.lobLaunch.targetId,f.target.id);
  const after=observe(f);vm.runInContext(`choose('LOB_PASS',${JSON.stringify(f.target.id)},{source:'USER_UI_CLICK'});`,context);assert.deepEqual(observe(f),after);
});
test('target menu gestures and six-per-page capacity at PC/narrow dimensions (DOM, not rendered)',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  for(const [width,height] of [[1200,700],[360,220]]){
    let now=1000;const nodes=[],calls=[];
    function element(tag){
      const e={tag,children:[],dataset:{},style:{},handlers:{},attributes:{},hidden:false,offsetWidth:180,offsetHeight:180,
        append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);},setAttribute(k,v){this.attributes[k]=v;},
        addEventListener(k,fn){this.handlers[k]=fn;},getBoundingClientRect(){return{left:0,top:0,right:width,bottom:height,width,height};},
        querySelectorAll(selector){const classes=selector.split('.').filter(Boolean);return this.children.flatMap(c=>[...(classes.every(k=>c.className?.split(' ').includes(k))?[c]:[]),...c.querySelectorAll(selector)]);}};
      e.classList={add(){},remove(){},toggle(){}};Object.defineProperty(e,'innerHTML',{set(){e.children=[];}});nodes.push(e);return e;
    }
    const window={addEventListener(){}},context={window,document:{createElement:element},performance:{now:()=>now},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn()};
    vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../in_pitch_choice_ui.js'),'utf8'),context);
    const f=fixture(),p=pending(f),stage=element('stage'),menuUI=window.FLRPG_IN_PITCH_CHOICE_UI.createController({stageElement:stage,canvas:element('canvas'),heroId:f.owner.id,projectPlayer:()=>({x:width/2,y:height/2}),onChoose:(...args)=>calls.push(args)});
    menuUI.show(p,E.snapshot(f.m));const target=nodes.find(e=>e.className==='in-pitch-target'&&e.dataset.playerId===f.target.id);
    const ev={preventDefault(){},stopPropagation(){},detail:0,pointerId:1,pointerType:'touch'};
    target.handlers.click(ev);assert.equal(calls.length,0,'opening target via keyboard is not a commit');
    const menu=nodes.find(e=>e.className==='in-pitch-choice-menu'),grid=menu.children.find(e=>e.className==='in-pitch-choice-grid');
    assert.equal(grid.children.length,3);assert.ok(menu.children[0].textContent.includes(f.target.id));
    const lob=grid.children.find(e=>e.dataset.choiceId==='LOB_PASS');assert.ok(lob.textContent.includes('로빙'));assert.ok(lob.attributes['aria-label'].includes(f.target.id));
    now=2000;lob.handlers.pointerup(ev);assert.equal(calls.length,0,'release without press is inert');
    lob.handlers.pointerdown(ev);lob.handlers.pointerup(ev);assert.equal(calls.length,1);assert.equal(calls[0][0],'LOB_PASS');assert.equal(calls[0][1],f.target.id);assert.equal(calls[0][2].confirmedAction,true);assert.equal(calls[0][2].pendingChoiceId,p.id);
    assert.ok(parseFloat(menu.style.left)>=8&&parseFloat(menu.style.left)+180<=width-8);assert.ok(parseFloat(menu.style.top)>=8&&parseFloat(menu.style.top)+180<=height-8);
    const options=Array.from({length:8},(_,i)=>({id:`ACTION_${i}`,targetId:f.target.id,label:`Action ${i}`}));
    menuUI.show({id:'CAPACITY',options},E.snapshot(f.m));menuUI.selectTarget(f.target.id);
    assert.equal(menu.children.find(e=>e.className==='in-pitch-choice-grid').children.length,6);
    const nav=menu.children.find(e=>e.className==='in-pitch-choice-pages');nav.children[1].handlers.click(ev);
    assert.deepEqual(Array.from(menu.children.find(e=>e.className==='in-pitch-choice-grid').children,e=>e.dataset.choiceId),['ACTION_6','ACTION_7']);assert.equal(calls.length,1,'paging never commits');
  }
});
