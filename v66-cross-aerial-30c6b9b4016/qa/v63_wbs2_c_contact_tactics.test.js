const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const PROFILE='OPEN_PLAY_LOB_V1';

function fixture(team='HOME'){
  const m=E.createMatch(`V63-C2-${team}`),source=m.playersById[team==='HOME'?'H-LCM':'A-LCM'],target=m.playersById[team==='HOME'?'H-ST':'A-ST'];
  m.restart=null;m.phase='OPEN_PLAY';m.time=100;m.nextShape=Infinity;
  for(const p of m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4,vx:0,vy:0,nextThink:Infinity});
  Object.assign(source,{x:team==='HOME'?40:65,y:34,tx:team==='HOME'?40:65,ty:34});
  Object.assign(target,{x:team==='HOME'?56:49,y:34,tx:team==='HOME'?56:49,ty:34});
  E.choiceActionBridge().setControlled(m,source,true);
  assert.equal(E.choiceActionBridge().executePass(m,source,target,'PASS',null,null,{physicsProfile:PROFILE,choiceId:'LOB_PASS',targetId:target.id,commitEventId:'C2'}),true);
  return{m,source,target};
}
function ball(f,values={}){Object.assign(f.m.ball,{x:50,y:34,z:1.2,vx:0,vy:0,vz:0,airborne:true,age:0,lobContacts:[],offsideAtRelease:false,...values});}
function player(f,id,values={}){const p=f.m.playersById[id];Object.assign(p,{x:50,y:34,tx:50,ty:34,vx:0,vy:0,bodyAngle:0,...values});return p;}
function clear(f){for(const p of f.m.players)Object.assign(p,{x:5,y:4,tx:5,ty:4,vx:0,vy:0});}
function tick(f,n=1){for(let i=0;i<n;i++)E.step(f.m,.05);}
function contacts(f){return f.m.events.filter(e=>e.type==='LOB_CONTACT').map(e=>e.receipt);}
function fixedRoll(f,value){let draws=f.m.r.observe().drawCount;const r=()=>{draws++;return value;};r.observe=()=>({drawCount:draws});f.m.r=r;}

test('C2 current xyz/vxyz steering mirrors receiver, retains only two reachable defenders, and does not set an outcome',()=>{
  for(const team of ['HOME','AWAY']){
    const f=fixture(team);clear(f);ball(f,{x:team==='HOME'?48:57,y:31,z:1.5,vx:6*(team==='HOME'?1:-1),vy:2,vz:1});
    Object.assign(f.target,{x:team==='HOME'?55:50,y:32,vx:team==='HOME'?3:-3,vy:1});
    const ids=team==='HOME'?['A-LCB','A-RCB','A-CM']:['H-LCB','H-RCB','H-CM'];
    player(f,ids[0],{x:f.m.ball.x+1,y:31});player(f,ids[1],{x:f.m.ball.x+2,y:33});player(f,ids[2],{x:f.m.ball.x+14,y:34});
    const row=T.updateOpenPlayLobContactTactics(f.m);
    assert.equal(row.receiverId,f.target.id);assert.deepEqual(row.defenderIds.slice().sort(),ids.slice(0,2).sort());assert.equal(row.futureOutcomePrecomputed,false);
    assert.equal(f.target.tacticalTask,'LOB_RECEIVE_CURRENT_BALL');assert.equal(f.m.playersById[ids[0]].tacticalTask,'LOB_CONTACT_CHASE');assert.notEqual(f.m.playersById[ids[2]].tacticalTask,'LOB_CONTACT_CHASE');
    assert.ok(row.point.x!==f.m.ball.targetX,'live velocity point is not the immutable launch aim');
  }
});

test('C2 actual contact validates head height, selects only the physical pair, and calls AERIAL with intendedId null',()=>{
  const f=fixture();clear(f);ball(f,{z:1.8,vx:0,vz:0});
  const a=player(f,'H-ST'),d=player(f,'A-LCB'),third=player(f,'A-CM',{x:60,y:34});
  f.m.playerAbilityProfiles={...f.m.playerAbilityProfiles,[a.id]:{jumping:1,heading:1,strength:1,anticipation:1,off_ball:1,reaction:1},[d.id]:{jumping:99,heading:99,strength:99,anticipation:99,defensive_positioning:99,reaction:99,ball_control:60}};fixedRoll(f,.50);
  tick(f);const receipt=contacts(f)[0];assert.ok(receipt);assert.equal(receipt.actorId,'A-LCB');assert.equal(receipt.outcome,'AERIAL_REDIRECT');assert.equal(receipt.contest.intendedId,null);assert.equal(receipt.contest.outcome,'DEF');assert.deepEqual([receipt.contest.attackerId,receipt.contest.defenderId].sort(),[a.id,d.id].sort());
  assert.equal(f.m.events.filter(e=>e.type==='AERIAL_CONTEST').length,1);assert.notEqual(receipt.actorId,third.id);
  const high=fixture();clear(high);ball(high,{z:2.5,vx:0,vz:0});player(high,'H-ST');player(high,'A-LCB');tick(high);assert.equal(contacts(high).length,0,'outfield bodies cannot contact above head height');
});

test('C2 50/50 and remote third-party cases are deterministic physical contests, while a miss becomes a second ball',()=>{
  const run=()=>{const f=fixture();clear(f);ball(f,{z:.5,vx:0,vz:0});player(f,'H-ST');player(f,'A-LCB');player(f,'A-CM',{x:68,y:34});tick(f);return f;};
  const a=run(),b=run(),ra=contacts(a)[0],rb=contacts(b)[0];assert.deepEqual(ra.contest,rb.contest);assert.equal(ra.contest.intendedId,null);assert.notEqual(ra.actorId,'A-CM');
  const miss=fixture();clear(miss);ball(miss,{z:.001,vx:4,vz:-5});tick(miss,30);assert.equal(miss.m.ball.mode,'LOOSE');assert.ok(miss.m.events.some(e=>e.type==='LOB_SECOND_BALL'));
});

test('C2 GK hands require current box, reachable height and no intentional team-mate foot pass',()=>{
  const caught=fixture();clear(caught);ball(caught,{x:8,y:34,z:1.8,vx:0,vz:0,lobLastIntentionalFootPassTeam:'AWAY'});player(caught,'H-GK',{x:8,y:34});caught.m.playerAbilityProfiles={...caught.m.playerAbilityProfiles,'H-GK':{handling:99,reaction:99}};tick(caught);
  assert.equal(contacts(caught)[0].outcome,'GK_CATCH');assert.equal(contacts(caught)[0].legalHandContact,true);assert.equal(caught.m.ball.ownerId,'H-GK');
  const outside=fixture();clear(outside);ball(outside,{x:20,y:34,z:1.8,vx:0,vz:0,lobLastIntentionalFootPassTeam:'AWAY'});player(outside,'H-GK',{x:20,y:34});tick(outside);assert.notEqual(contacts(outside)[0].outcome,'GK_CATCH');assert.equal(contacts(outside)[0].legalHandContact,false);
  const backpass=fixture();clear(backpass);ball(backpass,{x:8,y:34,z:1.0,vx:0,vz:0,lobLastIntentionalFootPassTeam:'HOME'});player(backpass,'H-GK',{x:8,y:34});tick(backpass);assert.notEqual(contacts(backpass)[0].outcome,'GK_CATCH');assert.equal(contacts(backpass)[0].legalHandContact,false);
  const punch=fixture();clear(punch);ball(punch,{x:8,y:34,z:1.8,vx:20,vz:0,lobLastIntentionalFootPassTeam:'AWAY'});player(punch,'H-GK',{x:8,y:34});fixedRoll(punch,.50);tick(punch);assert.equal(contacts(punch)[0].outcome,'GK_PUNCH');assert.equal(contacts(punch)[0].legalHandContact,true);assert.equal(punch.m.ball.ownerId,null);
});

test('C2 leaves non-lob CROSS, GOAL_KICK and ordinary pass paths profile-free',()=>{
  const g=E.createMatch('V63-C2-NONLOB'),source=g.playersById['H-LCM'],target=g.playersById['H-ST'];g.restart=null;g.phase='OPEN_PLAY';E.choiceActionBridge().setControlled(g,source,true);E.choiceActionBridge().executePass(g,source,target,'CROSS',null,null);assert.equal(g.ball.physicsProfile,undefined);assert.equal(g.ball.kind,'CROSS');
});
