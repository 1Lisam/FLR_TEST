#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
from pathlib import Path
p=Path('runtime/continuous_match_core.js')
s=p.read_text()
old="""    const nearest=candidates.map(p=>({p,d:dist(p,m.ball)})).sort((a,b)=>a.d-b.d)[0];if(!nearest)continue;const p=nearest.p;p.tx=m.ball.x;p.ty=m.ball.y;p.action=p.role==='GK'?'GK_RUSH':'CHASE_LOOSE';p.tacticalTask=p.role==='GK'?'GK_RUSH':'CHASE_LOOSE';p.sprint=true;"""
add="""
    // A striker who just took the shot may still carry a short post-shot movement lock.
    // Once the live rebound actually selects him as an eligible chaser, clear only
    // stale movement/facing state and let normal CHASE_LOOSE acceleration take over.
    if(p.role==='ST'&&p.team!==m.ball.lastTouchTeam&&p.id===m.ball.shotSourcePlayerId){
      p.postShotHoldUntil=0;p.lockTargetUntil=0;p.nextThink=m.time;p.runUntil=0;p.runType=null;p.faceTargetAngle=null;
    }"""
if s.count(old)!=1: raise SystemExit(f'chase anchor count={s.count(old)}')
if 'short post-shot movement lock' in s: raise SystemExit('patch already present')
p.write_text(s.replace(old,old+add,1))
PY
node --check runtime/continuous_match_core.js
git diff --check
node <<'NODE'
const E=require('./runtime/continuous_match_core.js');
const m=E.createMatch('V34-RUSH-15M-20',{dt:.05});m.time=0;m.phase='OPEN_PLAY';m.restart=null;m.nextShape=99999;m.events=[];m.score={HOME:0,AWAY:0};m.possession='HOME';m.playerAbilityProfiles={'A-GK':{handling:45,reaction:60,gk_positioning:60,agility:60,diving:60},'H-ST':{finishing:75}};
const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];for(const p of m.players){p.nextThink=99999;p.vx=p.vy=0;p.hasBall=false;}Object.assign(st,{x:88,y:34,tx:88,ty:34,bodyAngle:0,faceTargetAngle:0,postShotHoldUntil:9,lockTargetUntil:9,nextThink:9,runUntil:9,runType:'SHOT_FOLLOW'});Object.assign(gk,{x:101,y:34,tx:101,ty:34,vx:0,vy:0,action:'GK_SAVE_SET',tacticalTask:'GK_SAVE_SET',nextThink:99999});m.ball={mode:'FLIGHT',kind:'SHOT',x:90,y:34,z:0,vx:20,vy:0,vz:0,ownerId:null,intendedReceiverId:null,lastTouchTeam:'HOME',lastTouchPlayer:'H-ST',shotSourcePlayerId:'H-ST',shotTeam:'HOME',shotTargetY:34,shotDistance:15,originX:90,originY:34,targetX:105,targetY:34,shotOneVOne:true,shotClearKeeperChance:true,onTarget:true,airborne:false,age:.4};m.lastTouchTeam='HOME';m.lastTouchPlayer='H-ST';
let block=null,first=null,primary=null,cover=false,gkEarly=false;const rows=[];
for(let i=0;i<70;i++){E.step(m,.05);if(!block)block=(m.events||[]).find(e=>e.type==='RUSH_BLOCK')||null;if(block){const since=m.time-block.t;if(st.action==='CHASE_LOOSE'&&!first)first={t:m.time,hold:st.postShotHoldUntil||0,lock:st.lockTargetUntil||0,run:st.runUntil||0};const ch=m.players.filter(p=>p.team==='AWAY'&&p.role!=='GK'&&p.action==='CHASE_LOOSE');if(ch.length&&!primary)primary=ch[0].id;const cbs=m.players.filter(p=>p.team==='AWAY'&&p.role==='CB');if(ch.length&&cbs.some(p=>p.id!==ch[0].id&&p.action!=='CHASE_LOOSE'))cover=true;if(since<.78&&m.ball.mode==='CONTROLLED'&&m.ball.ownerId==='A-GK')gkEarly=true;if(since>=0&&since<=.85)rows.push({x:st.x,speed:Math.hypot(st.vx,st.vy),action:st.action});if(since>=.85)break;}}
const chase=rows.filter(r=>r.action==='CHASE_LOOSE'),maxSpeed=chase.length?Math.max(...chase.map(r=>r.speed)):0,disp=rows.length?rows.at(-1).x-rows[0].x:0;
const pass=!!block&&!!first&&first.hold===0&&first.lock===0&&first.run===0&&chase.length>=4&&maxSpeed>=4&&disp>=2&&!!primary&&cover&&!gkEarly;
console.log(JSON.stringify({verdict:pass?'PASS_FOR_USER_VISUAL_RETEST':'FAIL_PUBLIC_CHASE_PACE',maxSpeed,displacement:disp,firstChase:first,primaryDefender:primary,cover,gkEarlyControl:gkEarly,contactGap:block?.contact?.gap},null,2));if(!pass)process.exit(1);
NODE
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git add runtime/continuous_match_core.js
git diff --cached --quiet && { echo 'no deploy changes'; exit 1; }
git commit -m 'Fix RUSH_BLOCK striker chase pace (TEST_ONLY)'
git push origin HEAD:main
