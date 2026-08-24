'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]);
const H=require(path.join(root,'live_hybrid_session_v02.js'));
const A=require(path.join(root,'live_v06_scene_authority_browser.js'));
const key='MARK_TARGET_STABILITY',seed='DEV-RECENT-1787575897894-18';
const d=H.createDeveloperScenario({key,seed});
const v=A.runDeveloperVisualWindow(d.boundary,{runtimeDir:path.join(root,'runtime'),seed:d.seed,durationSeconds:9});
const rows=v.frames||[];
const pl=(f,id)=>(f.players||[]).find(p=>p.id===id)||null;
const local=(x,y)=>({x:105-Number(x),y:68-Number(y)});
const P=(f,id)=>{const p=pl(f,id);if(!p)return null;const l=local(p.x,p.y),t=(Number.isFinite(Number(p.tx))&&Number.isFinite(Number(p.ty)))?local(p.tx,p.ty):null;return{id:p.id,role:p.role,slot:p.slot,x:+l.x.toFixed(2),y:+l.y.toFixed(2),tx:t?+t.x.toFixed(2):null,ty:t?+t.y.toFixed(2):null,vx:Number.isFinite(Number(p.vx))?+(-Number(p.vx)).toFixed(2):null,vy:Number.isFinite(Number(p.vy))?+(-Number(p.vy)).toFixed(2):null,action:p.action||null,task:p.tacticalTask||null,mark:p.markTargetId||null,sprint:!!p.sprint};};
const out=[];
for(const f of rows){if(f.time<757.0||f.time>760.0)continue;const b=f.ball||{},bl=(Number.isFinite(Number(b.x))&&Number.isFinite(Number(b.y)))?local(b.x,b.y):null;out.push({t:+f.time.toFixed(2),possession:f.possession||null,phase:f.phase||null,zone:f.zone||null,ball:{mode:b.mode||null,kind:b.kind||null,ownerId:b.ownerId||null,intendedReceiverId:b.intendedReceiverId||null,x:bl?+bl.x.toFixed(2):null,y:bl?+bl.y.toFixed(2):null,vx:Number.isFinite(Number(b.vx))?+(-Number(b.vx)).toFixed(2):null,vy:Number.isFinite(Number(b.vy))?+(-Number(b.vy)).toFixed(2):null},players:['A-LB','A-LCB','A-RCB','A-RB','A-LCM','A-CM','A-RCM','H-LCM','H-RW','H-CM'].map(id=>P(f,id)).filter(Boolean)});}
console.log(JSON.stringify({schemaVersion:'FLR_V054_CM_COLLAPSE_DETAIL_1.0',status:'PASS',key,seed,frames:rows.length,window:out},null,2));
