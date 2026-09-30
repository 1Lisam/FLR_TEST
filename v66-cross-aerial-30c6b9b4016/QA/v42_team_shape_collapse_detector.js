#!/usr/bin/env node
'use strict';
/* QA-only, deliberately independent of production Oracle contracts. */
const D=(a,b)=>Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y));
const roles={GK:'GK',LB:'FB',LCB:'CB',RCB:'CB',RB:'FB',LCM:'CM',CM:'CM',RCM:'CM',LW:'WF',ST:'ST',RW:'WF'};
const role=p=>p.role||roles[String(p.id||'').split('-').slice(1).join('-')]||'CM';
const team=p=>p.team||(String(p.id||'').startsWith('H-')?'HOME':'AWAY');
const local=(t,p)=>t==='HOME'?{x:Number(p.x),y:Number(p.y)}:{x:105-Number(p.x),y:68-Number(p.y)};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const n=x=>Number(Number(x).toFixed(3));

function legalContext(frame,t){
 const ev=frame.event||frame.triggeringEvent||{}, text=JSON.stringify([frame.phase,frame.boundaryType,frame.reason,ev.kind,ev.type,ev.detail,frame.players?.map(p=>p.action||p.tacticalTask||'')]).toUpperCase();
 const ball=frame.ball||{}, inBox=Number(ball.x)>=83&&Number(ball.y)>=8&&Number(ball.y)<=60;
 const restart=/CORNER|FREE_KICK/.test(text) && (/KICK|RESTART|SET_PIECE/.test(text)||frame.restart===true);
 const scramble=inBox && (/SAVE|BLOCK|CLEAR|SCRAMBLE|REBOUND|CROSS|HEADER/.test(text)||frame.scrambleEvidence===true);
 return {exempt:restart||scramble,kind:restart?'POSITIVE_RESTART_EVIDENCE':scramble?'POSITIVE_GOALMOUTH_SCRAMBLE_EVIDENCE':null};
}
function metrics(frame,t){
 const ps=(frame.players||[]).filter(p=>team(p)===t&&role(p)!=='GK'), lp=ps.map(p=>local(t,p));
 if(!ps.length)return {team:t,missing:true};
 const xs=lp.map(p=>p.x),ys=lp.map(p=>p.y), line=k=>lp.filter((_,i)=>k.includes(role(ps[i]))).map(p=>p.x);
 const df=line(['CB','FB']),mf=line(['CM']),fw=line(['WF','ST']);
 const channels=[0,17,34,51,68].map((x,i)=>({channel:i,count:lp.filter(p=>p.y>=x&&p.y<(i===4?69:x+17)).length}));
 const neigh=ps.map(p=>({id:p.id,count:ps.filter(q=>D(p,q)<=10).length})).sort((a,b)=>b.count-a.count);
 const graph=Object.fromEntries(ps.map(p=>[p.id,ps.filter(q=>D(p,q)<=14).map(q=>q.id)])),seen=new Set(),groups=[];
 for(const p of ps){if(seen.has(p.id))continue;const q=[p.id],g=[];seen.add(p.id);while(q.length){const id=q.pop();g.push(id);for(const z of graph[id])if(!seen.has(z)){seen.add(z);q.push(z);}}groups.push(g);}
 const centroid={x:n(mean(xs)),y:n(mean(ys))};
 return {team:t,nonGk:ps.length,bounding:{depth:n(Math.max(...xs)-Math.min(...xs)),lateralWidth:n(Math.max(...ys)-Math.min(...ys)),area:n((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)))},centroid,lineSeparation:{DF_MF:n(Math.abs(mean(df)-mean(mf))),MF_FW:n(Math.abs(mean(mf)-mean(fw))),DF_FW:n(Math.abs(mean(df)-mean(fw)))},channels,localNeighborhood:{radius:10,max:neigh[0]?.count||0,rows:neigh},largestConnectedCluster:{radius:14,size:Math.max(...groups.map(x=>x.length)),ids:groups.sort((a,b)=>b.length-a.length)[0]},centralOccupancy:lp.filter(p=>p.x>=25&&p.x<=82&&Math.abs(p.y-34)<=16).length};
}
function detect(frame,t){
 const m=metrics(frame,t), legal=legalContext(frame,t); if(m.missing)return{flagged:false,legal,m,signals:[]};
 const s=[];
 if(m.bounding.lateralWidth<=22)s.push('LATERAL_WIDTH_LE_22');
 if(m.bounding.depth<=25)s.push('DEPTH_SPAN_LE_25');
 if(m.lineSeparation.DF_MF<=9&&m.lineSeparation.MF_FW<=9)s.push('DF_MF_FW_LINES_COMPRESSED');
 if(Math.max(...m.channels.map(x=>x.count))>=5)s.push('CHANNEL_OCCUPANCY_GE_5');
 if(m.localNeighborhood.max>=5)s.push('LOCAL_DENSITY_R10_GE_5');
 if(m.largestConnectedCluster.size>=8)s.push('CONNECTED_CLUSTER_R14_GE_8');
 if(m.centralOccupancy>=8)s.push('CENTRAL_OCCUPANCY_GE_8');
 return {flagged:!legal.exempt&&s.length>=5,legal,m,signals:s,threshold:'5_OF_7_GROSS_SHAPE_SIGNALS'};
}
module.exports={metrics,detect,legalContext,role,team};
