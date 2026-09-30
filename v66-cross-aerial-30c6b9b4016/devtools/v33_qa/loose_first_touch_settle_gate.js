'use strict';
const path=require('path');const root=process.argv[2];if(!root)process.exit(2);const E=require(path.resolve(root,'runtime/continuous_match_core.js')),bridge=E.choiceActionBridge();
function trial(seed,ability,speed=12,rivalDist=2.5){
 const m=E.createMatch(seed,{dt:.05,telemetry:{}});m.time=100;m.restart=null;m.phase='OPEN_PLAY';m.setPieceLive=null;m.nextShape=1e9;m.events=[];
 const p=m.playersById['H-ST'],r=m.playersById['A-LCB'];for(const q of m.players){q.x=q.team==='HOME'?15:95;q.y=q.slot==='GK'?34:6+(q.id.charCodeAt(q.id.length-1)%8)*7;q.tx=q.x;q.ty=q.y;q.vx=q.vy=0;q.nextThink=1e9;q.lockTargetUntil=0;q.pressCommitUntil=0;q.pressRecoverUntil=0;}
 p.x=80;p.y=34;p.tx=80;p.ty=34;p.nextThink=1e9;r.x=80.2;r.y=34+rivalDist;r.tx=r.x;r.ty=r.y;r.nextThink=1e9;m.playerAbilityProfiles={'H-ST':{ball_control:ability}};
 bridge.setLoose(m,79.45,34,speed,0,'HOME','H-RW');m.possession='HOME';m.nextShape=1e9;
 for(let i=0;i<12;i++){E.step(m,.05);if(m.events.some(e=>e.type==='LOOSE_FIRST_TOUCH_SETTLE'))return'SETTLE';if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId==='H-ST')return'CLEAN';if(m.ball.mode==='CONTROLLED')return'OTHER';}
 return'NONE';
}
const rows=[];for(const ability of [40,60,80]){const c={ability,trials:240,clean:0,settle:0,other:0,none:0};for(let i=0;i<c.trials;i++){const x=trial(`SETTLE-${ability}-${i}`,ability);c[x.toLowerCase()]++;}c.cleanRate=c.clean/c.trials;c.settleRate=c.settle/c.trials;rows.push(c);}
const low={trials:120,clean:0,settle:0,other:0,none:0};for(let i=0;i<low.trials;i++){const x=trial(`SETTLE-LOW-${i}`,60,4.5,2.5);low[x.toLowerCase()]++;}
const pass=rows[0].clean<rows[1].clean&&rows[1].clean<rows[2].clean&&rows.every(x=>x.clean>0&&x.settle>0)&&low.clean===low.trials&&low.settle===0;
console.log(JSON.stringify({pass,highEnergy:{speed:12,rivalDist:2.5,rows},lowEnergy:{speed:4.5,rivalDist:2.5,ability:60,...low}},null,2));process.exit(pass?0:1);
