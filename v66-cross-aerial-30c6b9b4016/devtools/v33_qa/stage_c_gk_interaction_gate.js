'use strict';
const path=require('path');
const root=process.argv[2];if(!root){console.error('usage: node stage_c_gk_interaction_gate.js TARGET_ROOT');process.exit(2)}
const E=require(path.join(root,'runtime','continuous_match_core.js'));
function setup(seed,handling,speed,z){
  const m=E.createMatch(seed,{dt:.05});m.time=100;m.restart=null;m.phase='CHANCE';m.nextShape=999;m.transitionUntil=0;m.events=[];m.score={HOME:0,AWAY:0};m.lastShotAt.AWAY=100;m.possession='AWAY';m.ballOwner=null;
  let k=0;for(const p of m.players){p.hasBall=false;p.nextThink=999;if(p.role!=='GK'){p.x=50;p.y=4+(k++%10)*6;p.tx=p.x;p.ty=p.y;p.vx=p.vy=0;}}
  const g=m.playersById['H-GK'];Object.assign(g,{x:5,y:34,tx:5,ty:34,vx:0,vy:0,nextThink:999});
  m.playerAbilityProfiles={[g.id]:{handling,reaction:60,gk_positioning:60,agility:60,diving:60}};
  m.ball={mode:'FLIGHT',kind:'SHOT',x:5.75,y:34,z,vx:-speed,vy:0,vz:0,age:.2,ownerId:null,lastTouchPlayer:'A-ST',lastTouchTeam:'AWAY',shotTeam:'AWAY',shotTargetY:34,onTarget:true,shotOneVOne:false,shotClearKeeperChance:false,airborne:true};
  return{m,g};
}
const c=setup('CATCH-0',100,12,.2);E.step(c.m,.05);
const catchPass=c.m.stats.gkCatches===1&&c.m.stats.saves===1&&c.m.ball.mode==='CONTROLLED'&&c.m.ball.ownerId==='H-GK'&&c.m.events.some(e=>e.type==='SAVE'&&/잡아/.test(e.text));
const p=setup('PARRY-1',20,28,.8);E.step(p.m,.05);
const parryEvent=p.m.events.find(e=>e.type==='PARRY');const parryPass=!!parryEvent&&p.m.stats.gkParries===1&&p.m.stats.saves===1&&p.m.ball.mode==='LOOSE'&&p.m.ball.ownerId==null;
const a=p.m.playersById['A-ST'];Object.assign(a,{x:p.m.ball.x+p.m.ball.vx*.05,y:p.m.ball.y+p.m.ball.vy*.05,tx:p.m.ball.x+p.m.ball.vx*.05,ty:p.m.ball.y+p.m.ball.vy*.05,vx:0,vy:0,nextThink:999});E.step(p.m,.05);
const reboundPass=p.m.ball.mode==='CONTROLLED'&&p.m.ball.ownerId==='A-ST'&&p.m.possession==='AWAY';
const pc=require('fs').readFileSync(path.join(root,'runtime','protagonist_match_controller.js'),'utf8');
const controllerPass=pc.includes("['PARRY','CHIP_PARRY'].includes(ev?.type)")&&pc.includes("'SAVE','PARRY','CHIP_SAVE'");
const checks={CATCH_CREATES_GK_CONTROL:catchPass,PARRY_CREATES_LIVE_LOOSE_BALL:parryPass,PARRY_REBOUND_CAN_BE_RECONTROLLED:reboundPass,PROTAGONIST_CONTROLLER_RECOGNIZES_PARRY:controllerPass};
const pass=Object.values(checks).every(Boolean);
console.log(JSON.stringify({schema:'FLR_STAGE_C_GK_INTERACTION_GATE_V1',pass,checks,catch:{events:c.m.events,ballMode:c.m.ball.mode,ownerId:c.m.ball.ownerId,catches:c.m.stats.gkCatches||0},parry:{event:parryEvent||null,ballModeAfterRebound:p.m.ball.mode,ownerIdAfterRebound:p.m.ball.ownerId,parries:p.m.stats.gkParries||0}},null,2));
if(!pass)process.exit(1);
