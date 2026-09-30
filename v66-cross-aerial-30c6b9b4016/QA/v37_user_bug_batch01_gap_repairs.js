'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
function patchText(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8');}
function context(globals){const ctx={console,...globals};ctx.globalThis=ctx;vm.createContext(ctx);return ctx;}
function runPatch(ctx,rel){vm.runInContext(patchText(rel),ctx,{filename:rel});}

// 1) Corner run-up target must be reachable by the normal player movement envelope.
{
  const players=[{id:'K',team:'HOME',role:'WF',x:95,y:8,tx:95,ty:8,vx:0,vy:0},{id:'ST',team:'HOME',role:'ST',x:99,y:34,tx:99,ty:34,vx:0,vy:0},{id:'CB',team:'AWAY',role:'CB',x:99,y:37,tx:99,ty:37,vx:0,vy:0}];
  const setup={kind:'CORNER',team:'HOME',createdAt:1,kickerId:'K',targets:{K:{x:105.45,y:-.72,task:'CORNER_KICKER_RUNUP_START'},ST:{x:99,y:34,task:'CORNER_ATTACK_SETUP'},CB:{x:99,y:37.4,task:'CORNER_DEFENCE_SETUP'}},cornerRunup:{start:{x:105.45,y:-.72}}};
  const m={seed:'C',time:3,players,playersById:Object.fromEntries(players.map(p=>[p.id,p])),restart:{kind:'CORNER',team:'HOME',x:103.8,y:1.2,stage:'SETUP',setup}};
  const R={begin(mm){for(const [id,t] of Object.entries(setup.targets)){const p=mm.playersById[id];p.tx=t.x;p.ty=t.y;p.tacticalTask=t.task;}return setup;},assign(){return true;},debugSummary(){return{}}};
  const ctx=context({FLRPG_RESTART_MOVEMENT:R});runPatch(ctx,'runtime/v37_set_piece_liveliness_patch.js');ctx.FLRPG_RESTART_MOVEMENT.begin(m);
  assert(setup.targets.K.x<=104.1&&setup.targets.K.x>=.9&&setup.targets.K.y>=.9&&setup.targets.K.y<=67.1,'corner run-up target must be inside movement envelope');
  assert(setup.v37CornerRunupReachable===true,'corner reachability flag missing');
  assert(Math.hypot(setup.targets.K.x-103.8,setup.targets.K.y-1.2)<3,'run-up target must remain near the corner arc');
}

// 2) A core-created reach in the same step must be adopted immediately, discard the 8.0 impulse,
//    and use the shot target captured at release rather than the current ball Y.
{
  const gk={id:'H-GK',team:'HOME',role:'GK',x:3,y:34,vx:0,vy:0,tx:3,ty:34};
  const m={time:10,players:[gk],playerAbilityProfiles:{'H-GK':{reaction:60,gk_positioning:60,diving:60,agility:60}},ball:{mode:'FLIGHT',kind:'SHOT',shotTargetY:37,shotTeam:'AWAY',lastTouchTeam:'AWAY',x:10,y:32,age:.30,onTarget:true}};
  const E={step(mm,dt){mm.time+=dt||.05;mm.ball.x=6.2;mm.ball.y=32.4;if(!mm.ball.gkParryReach){mm.ball.gkParryReach={startedAt:mm.time,startX:gk.x,startY:gk.y,targetX:gk.x,targetY:mm.ball.y,side:-1};gk.vy=-8;}return mm;}};
  const ctx=context({FLRPG_CONTINUOUS_CORE:E});runPatch(ctx,'runtime/v37_match_feel_patch.js');ctx.FLRPG_CONTINUOUS_CORE.step(m,.05);
  assert(m.ball.gkParryReach.v37LockedIntent===true,'late core reach was not adopted');
  assert(m.ball.gkParryReach.v37ShotTargetY===37,'shot target intent must remain frozen');
  assert(m.ball.gkParryReach.targetY>34,'GK must commit toward original target side, not current ball Y');
  assert(Math.hypot(gk.vx,gk.vy)<.05,'first adopted frame must restart from ~0 speed');
  ctx.FLRPG_CONTINUOUS_CORE.step(m,.05);const speed=Math.hypot(gk.vx,gk.vy);assert(speed>0&&speed<=6.61,'next frame must accelerate within bounded peak');
}

// 3) Forced GK presentation must keep its direction indicator on the initial shot side.
{
  const baseResult={key:'GK_SHOT_BOX',futureOutcomePrecomputed:false,frames:[
    {time:1,ball:{kind:'SHOT',shotTargetY:38,v37DiveIntent:{shotTargetY:38,side:1}},players:[{id:'H-GK',team:'HOME',role:'GK',x:5,y:34,tx:5,ty:34,action:'GK_REACT_WAIT'}]},
    {time:1.1,ball:{kind:'SHOT',shotTargetY:38,x:8,y:29},players:[{id:'H-GK',team:'HOME',role:'GK',x:5,y:34.1,tx:5,ty:34.2,action:'GK_SAVE_SET'}]},
    {time:1.2,ball:{kind:'SHOT',shotTargetY:38,x:9,y:27},players:[{id:'H-GK',team:'HOME',role:'GK',x:5,y:34.3,tx:5,ty:34.4,action:'GK_SAVE_REACH'}]}
  ]};
  const H={run:()=>JSON.parse(JSON.stringify(baseResult))};const ctx=context({FLRPG_FINAL_MATCH_RARE_SCENARIOS:H});runPatch(ctx,'final_match_forced_presentation_patch.js');const out=ctx.FLRPG_FINAL_MATCH_RARE_SCENARIOS.run('GK_SHOT_BOX','X',{});
  assert.equal(out.presentationGkAim.policy,'INITIAL_SHOT_DIRECTION_ONLY_V37');assert(out.presentationGkAim.applied);
  for(const f of out.frames.slice(1)){const g=f.players[0];assert(g.ty>g.y,'direction indicator must stay on initial shot side');assert(Math.abs(g.ty-g.y)>=.99);}
}
console.log('PASS V37 user bug batch 01 gap repair QA');
