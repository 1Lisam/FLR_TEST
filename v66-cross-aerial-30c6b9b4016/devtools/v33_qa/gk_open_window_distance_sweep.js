'use strict';
const path=require('path');const root=process.argv[2],trials=Number(process.argv[3]||400);if(!root)process.exit(2);
const E=require(path.resolve(root,'runtime/continuous_match_core.js')),B=E.choiceActionBridge();
function one(distance,i){
 const m=E.createMatch(`OPEN-${distance}-${i}`,{dt:.05});m.time=100;m.restart=null;m.phase='OPEN_PLAY';m.events=[];m.score={HOME:0,AWAY:0};m.nextShape=999;m.transitionUntil=0;
 for(const p of m.players){p.hasBall=false;p.vx=p.vy=0;p.nextThink=1e9;if(p.role!=='GK'){p.x=45;p.y=5+(Number(p.id.charCodeAt(p.id.length-1))%9)*6;p.tx=p.x;p.ty=p.y;}}
 const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];Object.assign(st,{x:105-distance,y:34,tx:105-distance,ty:34,nextThink:1e9,bodyAngle:0});Object.assign(gk,{x:99,y:34,tx:99,ty:34,nextThink:1e9,bodyAngle:Math.PI});
 m.playerAbilityProfiles={['H-ST']:{finishing:60,long_shots:60,ball_control:60,reaction:60,balance:60},['A-GK']:{handling:60,reaction:60,gk_positioning:60,agility:60,diving:60}};
 B.setControlled(m,st);st.controlledSince=m.time-1.0;st.lastReceivedAt=m.time-1.0;B.executeShot(m,st,'FORCED_OPEN',{releaseNow:true});
 const onTarget=!!m.ball.onTarget,clear=!!m.ball.shotClearKeeperChance,onev=!!m.ball.shotOneVOne,targetY=m.ball.shotTargetY,style=m.ball.strikeStyle;
 let prev={g:m.stats.goals||0,s:m.stats.saves||0,b:m.stats.shotBlocks||0,gk:m.stats.goalKicks||0};let outcome='UNRESOLVED';
 for(let k=0;k<300;k++){E.step(m,.05);const cur={g:m.stats.goals||0,s:m.stats.saves||0,b:m.stats.shotBlocks||0,gk:m.stats.goalKicks||0};if(cur.g>prev.g){outcome='GOAL';break}if(cur.s>prev.s){outcome='SAVE';break}if(cur.b>prev.b){outcome='BLOCK';break}if(cur.gk>prev.gk){outcome='MISS';break}prev=cur;}
 return{outcome,onTarget,clear,onev,targetY,style};
}
const out={trials,distances:{}};for(const d of [10,13,15,18]){const rows=[];for(let i=0;i<trials;i++)rows.push(one(d,i));const c={};for(const r of rows)c[r.outcome]=(c[r.outcome]||0)+1;out.distances[d]={counts:c,goalRate:(c.GOAL||0)/trials,saveRate:(c.SAVE||0)/trials,onTargetRate:rows.filter(r=>r.onTarget).length/trials,clearRate:rows.filter(r=>r.clear).length/trials,oneVOneRate:rows.filter(r=>r.onev).length/trials,styles:Object.fromEntries(Object.entries(rows.reduce((a,r)=>(a[r.style]=(a[r.style]||0)+1,a),{})).sort())};}console.log(JSON.stringify(out,null,2));
