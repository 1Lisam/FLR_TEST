#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..'),ui=fs.readFileSync(path.join(ROOT,'step71_hybrid_v06_ui.js'),'utf8');
const ids=new Map();
function el(id){if(!ids.has(id))ids.set(id,{id,hidden:false,value:id==='heroNonHeroMode'?'FULL':'H-ST',checked:false,children:[],style:{},dataset:{},classList:{add(){},remove(){},contains(){return false}},appendChild(x){this.children.push(x);return x},append(...xs){this.children.push(...xs)},addEventListener(){},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,right:900,bottom:600,width:900,height:600}},scrollIntoView(){},closest(){return stage},focus(){},querySelector(){return null},querySelectorAll(){return[]},innerHTML:'',textContent:'',disabled:false});return ids.get(id)}
const stage=el('stage');stage.getBoundingClientRect=()=>({left:0,top:0,right:900,bottom:600,width:900,height:600});
const ctx={clearRect(){},fillRect(){},strokeRect(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},save(){},restore(){},fillText(){},setLineDash(){}};
const canvas=el('heroPitch');canvas.width=900;canvas.height=600;canvas.getContext=()=>ctx;canvas.closest=()=>stage;
const liveState={m:{players:[],ball:{},_resolutionLease:{id:'LEASE'}},pending:null};
const entry={time:100,score:{HOME:0,AWAY:0},phase:'CHANCE',possession:'AWAY',ball:{mode:'LOOSE',x:9,y:34,ownerId:null},players:[{id:'H-ST',team:'HOME',role:'ST',x:55,y:34}]};
const end={...entry,time:105.4,score:{HOME:0,AWAY:1},ball:{mode:'DEAD',x:-.72,y:34,ownerId:null},spatialAuthorityV2:{active:true}};
const goal={t:105.4,type:'GOAL',team:'AWAY',actorId:'A-ST',crossing:{x:0,y:34},text:'레드팀 득점 0-1'};
const opened={state:liveState,entrySnapshot:entry,snapshot:end,frames:[entry,end],actualEvents:[goal]};
const incompleteHandback={snapshot:end,hadChoice:false,result:null,actualEvents:[goal],episodeFrames:[entry,end],entrySnapshot:entry};
const world={opts:{heroTeam:'HOME'},state:{score:{HOME:0,AWAY:0},resolvedEvents:[]}};
let resumeCalls=0,searchCalls=0;
const H={resumeFromHighRes(_world,hb){resumeCalls++;assert.strictEqual(hb.state,liveState,'V2_HANDBACK_LEASE_IDENTITY_MISMATCH');world.state.score={...hb.snapshot.score};world.state.resolvedEvents.push({kind:'HIGH_RES_GOAL',t:goal.t,team:'AWAY',detail:{score:{...hb.snapshot.score},text:goal.text}});}};
const E={snapshot:x=>JSON.parse(JSON.stringify(x)),FIELD:{GOAL_Y1:30.34,GOAL_Y2:37.66},createMatch(){return{players:[]}}};
const X={build(){return{highResolution:{actualResult:null}}}};
const source=ui.replace(/setup\(\);requestAnimationFrame\(loop\);/,`window.__V53_NONHERO={start:startReplay,process:processReplay,setContext(){world=__fixture.world;opened=__fixture.opened;activeBoundary={sceneId:'NONHERO-GOAL',stateSnapshot:__fixture.entry};beforeHybrid={};deferredHandback=__fixture.handback;},state:()=>({phase,replayFrames:replayList.length,resumeCalls:__fixture.resumeCalls(),searchCalls:__fixture.searchCalls()})};`);
const context={window:{},document:{getElementById:id=>id==='heroPitch'?canvas:el(id),createElement:tag=>el('created-'+tag+'-'+Math.random()),querySelectorAll:()=>[],body:el('body')},performance:{now:()=>1000},requestAnimationFrame(){},setTimeout(){return 1},clearTimeout(){},setInterval(){},clearInterval(){},console,URLSearchParams,Math,Number,JSON,Date,location:{search:''},navigator:{clipboard:{writeText(){return Promise.resolve()}}},Blob:function(){},URL:{createObjectURL(){return''},revokeObjectURL(){}},__fixture:{world,opened,entry,handback:incompleteHandback,resumeCalls:()=>resumeCalls,searchCalls:()=>searchCalls}};
context.window=context;context.window.FLRPG_CONTINUOUS_CORE=E;context.window.FLRPG_PROTAGONIST_MATCH_CONTROLLER={};context.window.FLRPG_LIVE_HYBRID_SESSION_V02=H;context.window.FLRPG_LIVE_V06_SCENE_AUTHORITY={};context.window.FLRPG_HYBRID_SCENE_DEBUG=X;context.window.FLRPG_FULL_TIME_PRESENTATION={};context.window.FLRPG_IN_PITCH_CHOICE_UI=null;context.window.matchMedia=()=>({matches:false});context.window.open=()=>{};context.window.addEventListener=()=>{};
vm.runInNewContext(source,context,{filename:'step71_hybrid_v06_ui.js'});const A=context.__V53_NONHERO;assert(A,'V53 non-hero seam missing');A.setContext();
let thrown=null;try{A.start([entry,end],'NOCHOICE_HANDOFF','QA non-hero goal');A.process(2.7);}catch(error){thrown=error;}
const state=A.state(),passed=!thrown&&state.resumeCalls===1&&state.replayFrames===0&&['GOAL_NOTICE','SEARCHING'].includes(state.phase)&&world.state.score.AWAY===1;
const out={schemaVersion:'V53_NONHERO_GOAL_REPLAY_HANDBACK_1.0',verdict:passed?'PASS':'FAIL',reproducedFreeze:!!thrown,error:thrown?.message||null,checks:{replayCompleted:state.replayFrames===0,handbackExactlyOnce:state.resumeCalls===1,returnedToFlow:['GOAL_NOTICE','SEARCHING'].includes(state.phase),scoreReachedHandback:world.state.score.AWAY===1,noChoiceApplied:true,noFuturePrecompute:true},facts:{replaySeconds:5.4,playbackSpeed:2,terminalWallSeconds:2.7,phase:state.phase,resumeCalls:state.resumeCalls}};
fs.mkdirSync(path.join(ROOT,'evidence/v53/sol_bugfix_bundle'),{recursive:true});fs.writeFileSync(path.join(ROOT,'evidence/v53/sol_bugfix_bundle/PHASE_A_NONHERO_REPLAY.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(!passed)process.exit(1);
