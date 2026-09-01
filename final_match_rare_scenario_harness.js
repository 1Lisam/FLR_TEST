(function(root,factory){
  const A=(root&&root.FLRPG_LIVE_V06_SCENE_AUTHORITY)||((typeof require==='function')?require('./live_v06_scene_authority_browser.js'):null);
  const api=factory(A);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FLRPG_FINAL_MATCH_RARE_SCENARIOS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
'use strict';
const deep=v=>v==null?v:JSON.parse(JSON.stringify(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash32(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function unit(seed,salt){return(hash32(`${seed}|${salt}`)>>>0)/4294967296;}
function signed(seed,salt,span=1){return(unit(seed,salt)-.5)*2*span;}
function runtimeDir(opts={}){if(opts.runtimeDir)return opts.runtimeDir;if(typeof __dirname!=='undefined'&&typeof require==='function')return require('path').join(__dirname,'runtime');return null;}
const SCENARIOS={
  CORNER_ATTACK_LEFT:{label:'코너킥 · 우리 팀 왼쪽',kind:'SET_PIECE',restart:'CORNER',team:'HOME',lane:'LEFT',heroPlayerId:'H-ST',heroRole:'ST',progress:.965},
  CORNER_ATTACK_RIGHT:{label:'코너킥 · 우리 팀 오른쪽',kind:'SET_PIECE',restart:'CORNER',team:'HOME',lane:'RIGHT',heroPlayerId:'H-ST',heroRole:'ST',progress:.965},
  CORNER_DEFEND_LEFT:{label:'코너킥 수비 · 상대 왼쪽',kind:'SET_PIECE',restart:'CORNER',team:'AWAY',lane:'LEFT',heroPlayerId:'H-LCB',heroRole:'CB',progress:.965},
  CORNER_DEFEND_RIGHT:{label:'코너킥 수비 · 상대 오른쪽',kind:'SET_PIECE',restart:'CORNER',team:'AWAY',lane:'RIGHT',heroPlayerId:'H-LCB',heroRole:'CB',progress:.965},
  FREE_KICK_ATTACK_LEFT:{label:'프리킥 · 우리 팀 왼쪽',kind:'SET_PIECE',restart:'FREE_KICK',team:'HOME',lane:'LEFT',heroPlayerId:'H-ST',heroRole:'ST',progress:.72},
  FREE_KICK_ATTACK_RIGHT:{label:'프리킥 · 우리 팀 오른쪽',kind:'SET_PIECE',restart:'FREE_KICK',team:'HOME',lane:'RIGHT',heroPlayerId:'H-ST',heroRole:'ST',progress:.72},
  FREE_KICK_DEFEND_LEFT:{label:'프리킥 수비 · 상대 왼쪽',kind:'SET_PIECE',restart:'FREE_KICK',team:'AWAY',lane:'LEFT',heroPlayerId:'H-LCB',heroRole:'CB',progress:.72},
  FREE_KICK_DEFEND_RIGHT:{label:'프리킥 수비 · 상대 오른쪽',kind:'SET_PIECE',restart:'FREE_KICK',team:'AWAY',lane:'RIGHT',heroPlayerId:'H-LCB',heroRole:'CB',progress:.72},
  CROSS_LEFT:{label:'왼쪽 크로스',kind:'CROSS',side:'LEFT',heroPlayerId:'H-ST',heroRole:'ST'},
  CROSS_RIGHT:{label:'오른쪽 크로스',kind:'CROSS',side:'RIGHT',heroPlayerId:'H-ST',heroRole:'ST'},
  ST_BREAKAWAY:{label:'ST 단독 돌파',kind:'BREAKAWAY',heroPlayerId:'H-ST',heroRole:'ST'},
  GK_SHOT_LONG:{label:'GK 대응 · 중거리 슈팅',kind:'GK_SHOT',distance:'LONG',heroPlayerId:'H-GK',heroRole:'GK'},
  GK_SHOT_BOX:{label:'GK 대응 · 박스 안 슈팅',kind:'GK_SHOT',distance:'BOX',heroPlayerId:'H-GK',heroRole:'GK'},
  GK_SHOT_CLOSE:{label:'GK 대응 · 근거리 슈팅',kind:'GK_SHOT',distance:'CLOSE',heroPlayerId:'H-GK',heroRole:'GK'}
};
const KEYS=Object.freeze(Object.keys(SCENARIOS));
function structure(seed){
  const width=clamp(48+signed(seed,'width',10),36,62),homeLine=clamp(50+signed(seed,'home-line',8),40,60),awayLine=clamp(50+signed(seed,'away-line',8),40,60);
  return{HOME:{midfieldOccupancy:3,backLineOccupancy:4,width,lineHeight:homeLine,transitionDebt:clamp(.16+unit(seed,'home-debt')*.22,.12,.40)},AWAY:{midfieldOccupancy:3,backLineOccupancy:4,width:clamp(50+signed(seed,'away-width',10),36,64),lineHeight:awayLine,transitionDebt:clamp(.14+unit(seed,'away-debt')*.24,.10,.40)}};
}
function boundary(key,seed){
  const c=SCENARIOS[key];if(!c)throw new Error(`UNKNOWN_RARE_SCENARIO:${key}`);
  const team=c.team||'HOME',lane=c.lane||(c.side||'CENTER'),progress=clamp((c.progress??(c.kind==='BREAKAWAY'?.84:c.kind==='GK_SHOT'?.83:.78))+signed(seed,'progress',.035),.62,.975),zone=progress>=.88?'BOX':progress>=.62?'FINAL_THIRD':'MIDFIELD',phase=progress>=.82?'CHANCE':'FINAL_THIRD',ownerId=c.kind==='GK_SHOT'?'A-ST':c.kind==='CROSS'?(c.side==='LEFT'?'H-LW':'H-RW'):c.kind==='BREAKAWAY'?'H-ST':(team==='HOME'?'H-CM':'A-CM');
  const stateSnapshot={second:900+Math.floor(unit(seed,'clock')*2400),score:{HOME:Math.floor(unit(seed,'home-score')*3),AWAY:Math.floor(unit(seed,'away-score')*3)},possession:team,zone,phase,danger:clamp(.58+unit(seed,'danger')*.30,.58,.90),ball:{team,lane,progress,ownerId},structure:structure(seed)};
  const b={id:`FM-${key}-${hash32(seed).toString(16)}`,type:c.kind==='SET_PIECE'?'SET_PIECE_2D_WINDOW':c.kind==='GK_SHOT'?'NON_HERO_SHOT_2D_WINDOW':'PROTAGONIST_2D_WINDOW',sceneId:`FM-${key}-${hash32(seed).toString(16)}`,atSecond:stateSnapshot.second,sourceEventId:null,reason:`FINAL_MATCH_${key}`,heroPlayerId:c.heroPlayerId,heroRole:c.heroRole,heroTeam:'HOME',stateSnapshot,preContext:[],futureOutcomePrecomputed:false,choicePrecomputed:false};
  if(c.kind==='SET_PIECE')b.setPiece={kind:c.restart,team:c.team,lane:c.lane,progress};
  if(c.kind==='GK_SHOT')b.shot={team:'AWAY',shooterId:'A-ST',quality:c.distance==='CLOSE'?.91:c.distance==='BOX'?.78:.64,fromZone:zone};
  return b;
}
function setPos(p,x,y){p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=0;p.vy=0;p.sprint=false;}
function collect(opened,start,duration=7,opts={}){
  const {E,P,state}=opened,frames=[deep(E.snapshot(state.m))];state.mode='FULL_SKIP';let guard=0,stopReason='DURATION_LIMIT',heroBoundaryArmed=false;
  while(!state.m.completed&&!state.pending&&(state.m.time<start+duration||(state.m.players||[]).some(p=>(p.v37DivePresentation?.holdUntil||0)>state.m.time))&&guard++<2400){
    P.step(state,.05);frames.push(deep(E.snapshot(state.m)));
    if(opts.heroOnControlId&&!heroBoundaryArmed&&state.m.ball.mode==='CONTROLLED'&&state.m.ball.ownerId===opts.heroOnControlId){
      const hp=state.m.playersById?.[opts.heroOnControlId]||state.m.players.find(p=>p.id===opts.heroOnControlId);heroBoundaryArmed=true;state.mode='PLAYER_ALL';state.lastPauseAt=state.m.time-1.0;state.lastPauseControlledSince=-999;state.forceNextChoice=true;if(hp){hp.nextThink=state.m.time;hp.lockTargetUntil=0;}P.maybeCheckpoint(state);
    }else P.maybeCheckpoint(state);
    if(state.pending){stopReason='USER_DECISION_BOUNDARY';break;}
    const recent=(state.m.events||[]).filter(e=>e.t>=start-.001),terminal=recent.findLast?recent.findLast(e=>['GOAL','SAVE','CHIP_SAVE','PARRY','PARRY_SAFE','PARRY_DANGER','SHOT_MISSED','CORNER','GOAL_KICK','THROW_IN','OFFSIDE'].includes(e.type)):[...recent].reverse().find(e=>['GOAL','SAVE','CHIP_SAVE','PARRY','PARRY_SAFE','PARRY_DANGER','SHOT_MISSED','CORNER','GOAL_KICK','THROW_IN','OFFSIDE'].includes(e.type));
    const holdUntil=state.m.players?.find(p=>p.role==='GK')?.v37DivePresentation?.holdUntil||0;
    if(terminal&&state.m.time>start+.75&&state.m.time>=holdUntil){stopReason=`TERMINAL_${terminal.type}`;break;}
  }
  if(state.m.completed)stopReason='MATCH_COMPLETED';
  return{frames,pending:state.pending?deep(state.pending):null,snapshot:E.snapshot(state.m),actualEvents:(state.m.events||[]).filter(e=>e.t>=start-.001).map(deep),stopReason};
}
function runCross(key,seed,opts={}){
  const c=SCENARIOS[key],b=boundary(key,seed),opened=A.seedMatch(b,{seed:`${seed}|ENTRY`,runtimeDir:runtimeDir(opts),explicitHeroChoiceRequired:true}),{E,state}=opened,m=state.m,br=E.choiceActionBridge(),left=c.side==='LEFT',winger=br.playerById(m,left?'H-LW':'H-RW'),st=br.playerById(m,'H-ST');
  if(!winger||!st)throw new Error('CROSS_FIXTURE_PLAYERS_MISSING');
  const wx=clamp(84+signed(seed,'winger-x',5),78,92),wy=left?clamp(8+signed(seed,'winger-y',4),4,15):clamp(60+signed(seed,'winger-y',4),53,64),sx=clamp(87+signed(seed,'st-x',3),83,91),sy=clamp(34+signed(seed,'st-y',5),27,41);
  setPos(winger,wx,wy);setPos(st,sx,sy);st.tx=clamp(sx+1.5+unit(seed,'st-run')*2.2,84,94);st.ty=clamp(sy+signed(seed,'st-run-y',2.8),25,43);st.vx=(st.tx-st.x)/1.2;st.vy=(st.ty-st.y)/1.2;st.runUntil=m.time+2.4;st.sprint=true;
  const lcb=br.playerById(m,'A-LCB'),rcb=br.playerById(m,'A-RCB'),lb=br.playerById(m,'A-LB'),rb=br.playerById(m,'A-RB'),line=clamp(Math.max(st.x+2.8,92)+signed(seed,'onside-line',1.1),91.5,96.5);
  if(lcb)setPos(lcb,line,clamp(30+signed(seed,'lcb-y',2.5),25,35));if(rcb)setPos(rcb,clamp(line+.6+signed(seed,'rcb-x',.8),92,97),clamp(39+signed(seed,'rcb-y',2.5),34,44));if(lb)setPos(lb,clamp(line-2.2+signed(seed,'lb-x',1.0),87,95),clamp(52+signed(seed,'lb-y',3),45,59));if(rb)setPos(rb,clamp(line-2.2+signed(seed,'rb-x',1.0),87,95),clamp(16+signed(seed,'rb-y',3),9,23));
  m.possession='HOME';m.protagonistExplicitActionRequired=true;br.setControlled(m,winger);winger.controlledSince=m.time-.8;winger.nextThink=m.time+9;
  const start=m.time;br.executePass(m,winger,st,'CROSS',{running:true},'FINAL_MATCH_RARE_SCENE');const entrySnapshot=deep(E.snapshot(m));
  const out=collect(opened,start,7,{heroOnControlId:'H-ST'});return{key,label:c.label,seed,boundary:b,entrySnapshot,...out,forcedSetup:'CROSS_RELEASE_TO_HERO_DECISION_BOUNDARY',futureOutcomePrecomputed:false};
}
function runBreakaway(key,seed,opts={}){
  const c=SCENARIOS[key],b=boundary(key,seed),opened=A.seedMatch(b,{seed:`${seed}|ENTRY`,runtimeDir:runtimeDir(opts),explicitHeroChoiceRequired:true}),{E,P,state}=opened,m=state.m,br=E.choiceActionBridge(),st=br.playerById(m,'H-ST'),gk=br.playerById(m,'A-GK'),lcb=br.playerById(m,'A-LCB'),rcb=br.playerById(m,'A-RCB');
  if(!st||!gk||!lcb||!rcb)throw new Error('BREAKAWAY_FIXTURE_PLAYERS_MISSING');
  const sx=clamp(82+signed(seed,'st-x',4),78,87),sy=clamp(34+signed(seed,'st-y',6),25,43),gkx=clamp(100+signed(seed,'gk-x',1),98.2,101.2),gky=clamp(34+signed(seed,'gk-y',2.5),30,38),trail=clamp(5+unit(seed,'trail')*5,5,10);
  setPos(st,sx,sy);setPos(gk,gkx,gky);setPos(lcb,clamp(sx-trail,67,82),clamp(sy-5+signed(seed,'lcb-y',2),18,39));setPos(rcb,clamp(sx-trail+signed(seed,'rcb-x',2),67,83),clamp(sy+5+signed(seed,'rcb-y',2),29,50));
  m.possession='HOME';m.protagonistExplicitActionRequired=true;br.setControlled(m,st);st.controlledSince=m.time-1.0;st.nextThink=m.time+2.0;st.lockTargetUntil=m.time+.70;st.action='HOLD_BALL';st.tacticalTask='HOLD_BALL';st.bodyAngle=0;st.faceTargetAngle=0;st.tx=clamp(st.x+3.2,3,101);st.ty=clamp(st.y+signed(seed,'carry-y',1.6),3,65);st.vx=2.8;st.vy=(st.ty-st.y)/1.2;st.sprint=true;
  const start=m.time,entrySnapshot=deep(E.snapshot(m)),frames=[deep(entrySnapshot)];state.mode='FULL_SKIP';state.forceNextChoice=false;
  let guard=0;while(!m.completed&&m.time<start+.55&&guard++<16){P.step(state,.05);frames.push(deep(E.snapshot(m)));if(m.ball.ownerId!=='H-ST'||m.ball.mode!=='CONTROLLED')break;}
  state.mode='PLAYER_ALL';state.lastPauseAt=m.time-1.0;state.lastPauseControlledSince=-999;state.forceNextChoice=true;st.nextThink=m.time;st.lockTargetUntil=0;P.maybeCheckpoint(state);
  guard=0;while(!state.pending&&!m.completed&&guard++<20){P.step(state,.05);frames.push(deep(E.snapshot(m)));P.maybeCheckpoint(state);}
  const pending=state.pending?deep(state.pending):null;if(!pending)throw new Error('BREAKAWAY_CHOICE_NOT_FOUND');
  return{key,label:c.label,seed,boundary:b,entrySnapshot,frames,pending,snapshot:E.snapshot(m),actualEvents:(m.events||[]).filter(e=>e.t>=start-.001).map(deep),stopReason:'USER_DECISION_BOUNDARY',forcedSetup:'BREAKAWAY_CONTEXT_AND_USER_DECISION_ONLY',futureOutcomePrecomputed:false};
}
function runGkShot(key,seed,opts={}){
  const c=SCENARIOS[key],b=boundary(key,seed),opened=A.seedMatch(b,{seed:`${seed}|ENTRY`,runtimeDir:runtimeDir(opts),explicitHeroChoiceRequired:true,visualClock:true}),{E,state}=opened,m=state.m,br=E.choiceActionBridge(),shooter=br.playerById(m,'A-ST'),gk=br.playerById(m,'H-GK');
  if(!shooter||!gk)throw new Error('GK_FIXTURE_PLAYERS_MISSING');
  const localX=c.distance==='LONG'?72:c.distance==='BOX'?88:94,x=105-localX,y=clamp(34+signed(seed,'shot-y',7),25,43);setPos(shooter,x,y);setPos(gk,clamp(4.8+signed(seed,'gk-x',.7),3.8,6),clamp(34+signed(seed,'gk-y',2.5),29,39));
  m.possession='AWAY';m.protagonistExplicitActionRequired=true;br.setControlled(m,shooter);shooter.controlledSince=m.time-.9;shooter.nextThink=m.time+99;const start=m.time;br.executeShot(m,shooter,'FINAL_MATCH_RARE_SCENE',{releaseNow:true});const entrySnapshot=deep(E.snapshot(m));const out=collect(opened,start,6);
  return{key,label:c.label,seed,boundary:b,entrySnapshot,...out,forcedSetup:'SHOT_RELEASE_ONLY',futureOutcomePrecomputed:false};
}
function runSetPiece(key,seed,opts={}){const c=SCENARIOS[key],b=boundary(key,seed),out=A.runSetPieceWindow(b,{seed:`${seed}|SETPIECE`,runtimeDir:runtimeDir(opts),durationSeconds:10});return{key,label:c.label,seed,heroPlayerId:c.heroPlayerId,boundary:b,...out,forcedSetup:'DEAD_BALL_CONTEXT_ONLY',futureOutcomePrecomputed:false};}
function run(key,seed='FINAL-MATCH-RARE-001',opts={}){const c=SCENARIOS[key];if(!c)throw new Error(`UNKNOWN_RARE_SCENARIO:${key}`);if(!A)throw new Error('LIVE_V06_SCENE_AUTHORITY_UNAVAILABLE');if(c.kind==='SET_PIECE')return runSetPiece(key,seed,opts);if(c.kind==='CROSS')return runCross(key,seed,opts);if(c.kind==='BREAKAWAY')return runBreakaway(key,seed,opts);if(c.kind==='GK_SHOT')return runGkShot(key,seed,opts);throw new Error(`UNSUPPORTED_RARE_SCENARIO:${key}`);}
function summary(result){const events=result.actualEvents||[],pending=result.pending||null,first=result.frames?.[0]||result.entrySnapshot,last=result.frames?.at?.(-1)||result.snapshot;return{key:result.key,label:result.label,seed:result.seed,forcedSetup:result.forcedSetup,futureOutcomePrecomputed:result.futureOutcomePrecomputed,stopReason:result.stopReason||null,hadChoice:!!pending,choiceKind:pending?.kind||null,optionIds:(pending?.options||[]).map(o=>o.id),events:events.map(e=>e.type),entry:{time:first?.time,ball:first?.ball?{mode:first.ball.mode,x:first.ball.x,y:first.ball.y,ownerId:first.ball.ownerId}:null},exit:{time:last?.time,ball:last?.ball?{mode:last.ball.mode,x:last.ball.x,y:last.ball.y,ownerId:last.ball.ownerId}:null}};}
return{SCENARIOS,KEYS,boundary,run,summary};
});
