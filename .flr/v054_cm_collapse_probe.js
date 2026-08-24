'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]);
const H=require(path.join(root,'live_hybrid_session_v02.js')),A=require(path.join(root,'live_v06_scene_authority_browser.js'));
const key='MARK_TARGET_STABILITY',seed='DEV-RECENT-1787575897894-18';
const d=H.createDeveloperScenario({key,seed}),v=A.runDeveloperVisualWindow(d.boundary,{runtimeDir:path.join(root,'runtime'),seed:d.seed,durationSeconds:9}),rows=v.frames||[];
const pl=(f,id)=>(f.players||[]).find(p=>p.id===id)||null,L=(p)=>p?{x:105-p.x,y:68-p.y}:null;
const violations=[];
for(const f of rows){const cbs=['A-LCB','A-RCB'].map(id=>pl(f,id)).filter(Boolean);if(cbs.length<2)continue;const cbMean=cbs.map(q=>L(q).x).reduce((a,b)=>a+b,0)/2;
 for(const id of ['A-LCM','A-CM','A-RCM']){const q=pl(f,id);if(!q)continue;const ql=L(q);if(ql.x<=cbMean+1.5){const b=f.ball||{},owner=pl(f,b.ownerId),ol=owner?L(owner):null;violations.push({t:+f.time.toFixed(2),id,x:+ql.x.toFixed(2),y:+ql.y.toFixed(2),cbMean:+cbMean.toFixed(2),task:q.tacticalTask||q.action||null,mark:q.markTargetId||null,ball:{mode:b.mode,kind:b.kind,ownerId:b.ownerId||null,intendedReceiverId:b.intendedReceiverId||null,x:+(105-b.x).toFixed(2),y:+(68-b.y).toFixed(2)},owner:owner?{id:owner.id,role:owner.role,slot:owner.slot,x:+ol.x.toFixed(2),y:+ol.y.toFixed(2)}:null});}}
}
const groups=[];for(const r of violations){const g=groups.at(-1);if(g&&g.id===r.id&&r.t-g.end<=.11){g.end=r.t;g.count++;g.minX=Math.min(g.minX,r.x);g.maxCb=Math.max(g.maxCb,r.cbMean);g.tasks.add(r.task);g.marks.add(r.mark||'NONE');g.ballModes.add(`${r.ball.mode}:${r.ball.kind}:${r.ball.ownerId||r.ball.intendedReceiverId||'NONE'}`);}else groups.push({id:r.id,start:r.t,end:r.t,count:1,minX:r.x,maxCb:r.cbMean,tasks:new Set([r.task]),marks:new Set([r.mark||'NONE']),ballModes:new Set([`${r.ball.mode}:${r.ball.kind}:${r.ball.ownerId||r.ball.intendedReceiverId||'NONE'}`])});}
const compact=groups.map(g=>({...g,tasks:[...g.tasks],marks:[...g.marks],ballModes:[...g.ballModes]}));
console.log(JSON.stringify({schemaVersion:'FLR_V054_CM_COLLAPSE_PROBE_1.0',status:'PASS',key,seed,frames:rows.length,violationCount:violations.length,groups:compact,violations},null,2));
