'use strict';
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const B=E.choiceActionBridge();

function gk(m,team){return m.players.find(p=>p.team===team&&p.role==='GK');}
function local(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function targetLocal(p){return local(p.team,p.tx,p.ty);}
function assertLocalBand(p,max=12){const t=targetLocal(p);assert(t.x<=max,`${p.id} left local GK band: ${t.x.toFixed(2)}`);return t;}
function assertNotBallTarget(m,p){assert(Math.hypot(p.tx-m.ball.x,p.ty-m.ball.y)>.25,`${p.id} targeted loose ball while non-primary`);}

function looseUnit(seed,x,y,lastTeam){
  const m=E.createMatch(seed);m.time=10;
  B.setLoose(m,x,y,0,0,lastTeam,lastTeam==='HOME'?'H-ST':'A-ST');
  T.assignLooseBallArbitration(m);
  return m;
}

// A loose ball by HOME's goal may legally select HOME GK, but the far AWAY GK
// remains on the ordinary attack-shape rail authored before loose arbitration.
{
  const m=looseUnit('V60-UNIT-HOME-GK-RUSH',7,34,'AWAY'),h=gk(m,'HOME'),a=gk(m,'AWAY');
  assert.equal(m.looseBallArbitration.teams.HOME.primaryId,h.id,'HOME GK is eligible primary');
  assert.equal(h.tacticalTask,'GK_RUSH','eligible HOME GK retains legal rush');
  assert.equal(m.looseBallArbitration.teams.AWAY.primaryId===a.id,false,'far AWAY GK is non-primary');
  assertLocalBand(a);assertNotBallTarget(m,a);
}

// At midfield neither keeper is eligible: both retain their own ordinary local
// bands instead of inheriting looseRoleTarget's generic ball-location fallback.
{
  const m=looseUnit('V60-UNIT-MIDFIELD-GKS',52.5,34,'HOME');
  for(const team of ['HOME','AWAY']){
    const p=gk(m,team);
    assert.notEqual(m.looseBallArbitration.teams[team].primaryId,p.id,`${team} GK is non-primary at midfield`);
    assertLocalBand(p);assertNotBallTarget(m,p);
  }
}

function cornerRegression(seed,y){
  const m=E.createMatch(seed),a=gk(m,'AWAY'),h=gk(m,'HOME');
  m.protagonistControllerId='NO_USER_CHOICE';
  // Real restart lifecycle only: no player relocation and no protagonist choice.
  B.startDeadRestart(m,'CORNER','AWAY',0,y);
  let kicked=false,opened=false,looseFrames=0,maxAwayTargetLocalX=-Infinity,maxAwayLocalX=-Infinity,homeRushes=0;
  for(let i=0;i<1200;i++){
    E.step(m,.05);
    if((m.events||[]).some(e=>e.type==='CORNER_KICK'))kicked=true;
    if(!kicked)continue;
    const at=targetLocal(a),ap=local('AWAY',a.x,a.y);
    maxAwayTargetLocalX=Math.max(maxAwayTargetLocalX,at.x);maxAwayLocalX=Math.max(maxAwayLocalX,ap.x);
    assert(at.x<=18,`${seed}: A-GK received opponent-side target (${at.x.toFixed(2)})`);
    assert(ap.x<=18,`${seed}: A-GK physically left own-goal-side band (${ap.x.toFixed(2)})`);
    if(m.ball.mode==='LOOSE'){
      looseFrames++;
      assert(Math.hypot(a.tx-m.ball.x,a.ty-m.ball.y)>.25,`${seed}: A-GK chased loose ball`);
    }
    if(h.tacticalTask==='GK_RUSH')homeRushes++;
    if(m.phase==='OPEN_PLAY'){opened=true;break;}
  }
  assert(kicked,`${seed}: natural corner kick`);assert(opened,`${seed}: natural open-play transition`);
  assert(!(m.events||[]).some(e=>e.type==='USER_CHOICE'),`${seed}: no protagonist choice`);
  return{seed,looseFrames,homeRushes,maxAwayTargetLocalX:Number(maxAwayTargetLocalX.toFixed(3)),maxAwayLocalX:Number(maxAwayLocalX.toFixed(3))};
}

const corners=[cornerRegression('V59-CORNER-TOP',0),cornerRegression('V59-CORNER-BOTTOM',68)];
console.log(JSON.stringify({verdict:'PASS_V60_LOOSE_BALL_GK_AUTHORITY',corners}));
