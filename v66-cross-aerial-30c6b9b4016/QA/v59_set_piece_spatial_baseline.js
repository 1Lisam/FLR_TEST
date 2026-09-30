'use strict';
const assert=require('assert'),R=require('../runtime/restart_movement.js');
global.FLRPG_RESTART_MOVEMENT=R;
require('../runtime/free_kick_templates.js');
require('../runtime/free_kick_wall_model.js');
require('../runtime/corner_templates.js');
const E=require('../runtime/continuous_match_core.js');
const slots=[['GK','GK',5,34],['LB','FB',22,10],['LCB','CB',20,27],['RCB','CB',20,41],['RB','FB',22,58],['LCM','CM',45,21],['CM','CM',47,34],['RCM','CM',45,47],['LW','WF',67,11],['ST','ST',70,34],['RW','WF',67,57]],world=(t,x,y)=>t==='HOME'?{x,y}:{x:105-x,y:68-y},local=world;
function make(kind,team,x,y,extra={}){const players=[];for(const t of ['HOME','AWAY'])for(const [slot,role,lx,ly] of slots)players.push({id:`${t[0]}-${slot}`,team:t,slot,role,x:t==='HOME'?lx:105-lx,y:t==='HOME'?ly:68-ly,tx:0,ty:0,action:'HOLD',tacticalTask:'HOLD'});const q=world(team,x,y),m={seed:`v59-${kind}-${x}-${y}-${JSON.stringify(extra)}`,time:10,players,restart:{kind,team,x:q.x,y:q.y,stage:'SETUP',setupStartedAt:10,...extra}};m.playersById=Object.fromEntries(players.map(p=>[p.id,p]));return m;}
function noDuplicateNonWall(m,s){for(const team of ['HOME','AWAY']){const seen=new Map();for(const p of m.players.filter(q=>q.team===team&&q.role!=='GK')){const role=s.freeKickPlan?.roles[p.id]||s.cornerPlan?.roles[p.id]||'',t=s.targets[p.id];if(role==='WALL'||!t)continue;const key=`${t.x.toFixed(6)},${t.y.toFixed(6)}`;assert(!seen.has(key),`duplicate ${team} ${role}/${seen.get(key)} at ${key}`);seen.set(key,role);}}}
function plan(kind,team,x,y,extra={}){const m=make(kind,team,x,y,extra),s=R.begin(m),p=kind==='FREE_KICK'?s.freeKickPlan:s.cornerPlan,quick=kind==='FREE_KICK'&&p.restartMode==='QUICK_RESTART';if(quick){assert(Object.keys(s.targets).length<22,'quick restart has no complete player map');assert.equal(Object.entries(s.targets).filter(([id])=>m.playersById[id].role!=='GK').length,1,'quick restart targets only the kicker outfield');assert.equal(p.complete,false,'quick plan is intentionally incomplete');}else{assert.equal(Object.keys(s.targets).length,22,'complete player map');assert.equal(new Set(Object.keys(s.targets)).size,22,'one target each');assert.equal(Object.entries(p.roles).filter(([id])=>m.playersById[id].team===team&&m.playersById[id].role!=='GK').length,10,'10 attacking outfield responsibilities');assert.equal(Object.entries(p.roles).filter(([id])=>m.playersById[id].team!==team&&m.playersById[id].role!=='GK').length,10,'10 defending outfield responsibilities');noDuplicateNonWall(m,s);}for(const t of Object.values(s.targets))assert(Number.isFinite(t.x)&&Number.isFinite(t.y));return{m,s,p};}
function mirrored(a,b){for(const [id,t] of Object.entries(a.targets)){const mate=id.startsWith('H-')?`A-${id.slice(2)}`:`H-${id.slice(2)}`,u=b.targets[mate];assert(u,`mirror target ${id}`);assert(Math.abs(t.x-(105-u.x))<1e-6&&Math.abs(t.y-(68-u.y))<1e-6,`mirror ${id}`);}}
for(const y of [14,54])for(const [x,type,f] of [[52,'DIRECT','DEEP_DIRECT'],[52,'INDIRECT','DEEP_INDIRECT'],[70,'DIRECT','WIDE_DIRECT_DELIVERY'],[70,'INDIRECT','INDIRECT_DELIVERY'],[88,'DIRECT','DIRECT_SHOT_CLOSE'],[79,'DIRECT','DIRECT_SHOT_MID'],[65,'DIRECT','DIRECT_LONG_DELIVERY']]){const h=plan('FREE_KICK','HOME',x,y,{freeKickType:type}),a=plan('FREE_KICK','AWAY',x,y,{freeKickType:type});assert.equal(h.p.freeKickType,type);if(x===52||x===70)assert.equal(h.p.family,f);assert.equal(a.p.family,h.p.family);assert.equal(h.p.restartMode,f.startsWith('DEEP')?'QUICK_RESTART':'SETTLED_RESTART');mirrored(h.s,a.s);}
for(const [x,f] of [[88,'DIRECT_SHOT_CLOSE'],[79,'DIRECT_SHOT_MID'],[65,'DIRECT_LONG_DELIVERY']])assert.equal(plan('FREE_KICK','HOME',x,34,{freeKickType:'DIRECT'}).p.family,f);
for(const team of ['HOME','AWAY'])for(const y of [14,54])for(const short of [false,true]){const {p}=plan('CORNER',team,104,y,{cornerType:short?'SHORT':'DELIVERED'}),rs=Object.values(p.roles);assert.equal(p.family,short?'SHORT_CORNER':'DELIVERED_CORNER');assert(rs.some(r=>r.startsWith('EDGE_'))&&rs.includes('COUNTER_OUTLET'));if(short){assert(rs.includes('SHORT_OPTION'));assert.equal(rs.filter(r=>r==='SHORT_DEFENDER').length,1);}}
function assertFreeKickLayers(fixture,expectedWall){
 const {m,s,p}=fixture,w=s.freeKickWall,roles=Object.entries(p.roles),byRole=role=>roles.filter(([,r])=>r===role).map(([id])=>id);
 assert.equal(w.count>0,expectedWall,'expected wall/no-wall fixture');
 assert.deepEqual(byRole('WALL').sort(),[...w.wallPlayerIds].sort(),'wall IDs are distinct from template roles');
 assert(byRole('MARK_CONTEST').length>=1&&byRole('DEFENSIVE_SECOND_BALL').length+byRole('WIDE_EDGE_CLEARANCE').length>=1&&byRole('COUNTER_OUTLET').length>=1,'distinct defensive layers');
 assert(byRole('MARK_CONTEST').filter(id=>['CB','FB'].includes(m.playersById[id].role)).length>=2,'back line supplies primary marks');
 for(const id of byRole('MARK_CONTEST')){assert(m.playersById[id].markTargetId,'mark target retained');assert(['CB','FB','CM'].includes(m.playersById[id].role),'structural defender marks danger');}
 for(const id of [...byRole('MARK_CONTEST'),...byRole('BOX_ZONE'),...byRole('DEFENSIVE_SECOND_BALL'),...byRole('WIDE_EDGE_CLEARANCE')])for(const q of w.wallPoints)assert(Math.hypot(s.targets[id].x-q.x,s.targets[id].y-q.y)>=2.15,`${id} clear of wall`);
 if(!expectedWall)assert.equal(byRole('WALL').length,0,'no pseudo-wall');
 const before=JSON.stringify({roles:p.roles,targets:s.targets,wall:w.wallPlayerIds});R.assign(m);R.assign(m);assert.equal(JSON.stringify({roles:p.roles,targets:s.targets,wall:s.freeKickWall.wallPlayerIds}),before,'stable repeated layer assignment');
}
assertFreeKickLayers(plan('FREE_KICK','HOME',88,34,{freeKickType:'DIRECT'}),true);
assertFreeKickLayers(plan('FREE_KICK','HOME',70,14,{freeKickType:'INDIRECT'}),false);
function inBallWallCorridor(m,s,target){
 const wall=s.freeKickWall;if(wall.count<3)return false;
 const ball=local(m.restart.team,m.restart.x,m.restart.y),points=wall.wallPoints.map(q=>local(m.restart.team,q.x,q.y)),mark=local(m.restart.team,target.x,target.y);
 const centre={x:points.reduce((n,q)=>n+q.x,0)/points.length,y:points.reduce((n,q)=>n+q.y,0)/points.length},length=Math.hypot(centre.x-ball.x,centre.y-ball.y),ux=(centre.x-ball.x)/length,uy=(centre.y-ball.y)/length,px=-uy,py=ux;
 const along=(mark.x-ball.x)*ux+(mark.y-ball.y)*uy,lateral=(mark.x-ball.x)*px+(mark.y-ball.y)*py,shoulder=Math.max(...points.map(q=>Math.abs((q.x-centre.x)*px+(q.y-centre.y)*py)));
 return along>=.5&&along<=length+.15&&Math.abs(lateral)<=shoulder+.85;
}
for(const team of ['HOME','AWAY']){
 const {m,s,p}=plan('FREE_KICK',team,88,34,{freeKickType:'DIRECT'}),w=s.freeKickWall,roles=Object.entries(p.roles),defs=roles.filter(([id])=>m.playersById[id].team!==team),attack=roles.filter(([id])=>m.playersById[id].team===team);
 assert(w.count>=4&&w.count<=5,'central direct free kick has a large wall');
 assert(defs.filter(([id,r])=>r==='WALL'&&m.playersById[id].role==='WF').length<=1,'at most one wide forward joins the large wall');
 assert(defs.some(([id,r])=>m.playersById[id].role==='CM'&&r==='DEFENSIVE_SECOND_BALL'),'midfielder remains at the second ball');
 assert.equal(defs.filter(([id,r])=>m.playersById[id].role==='CB'&&r!=='WALL'&&['MARK_CONTEST','BOX_ZONE'].includes(r)).length,2,'both centre-backs keep danger/box cover');
 for(const [id,r] of defs)if(['MARK_CONTEST','BOX_ZONE','DEFENSIVE_SECOND_BALL','WIDE_EDGE_CLEARANCE'].includes(r))assert(!inBallWallCorridor(m,s,s.targets[id]),`${id} outside the ball-to-wall corridor`);
 assert(attack.some(([id,r])=>r.startsWith('TARGET_')&&Math.min(...w.wallPoints.map(q=>Math.hypot(s.targets[id].x-q.x,s.targets[id].y-q.y)))>=1&&Math.min(...w.wallPoints.map(q=>Math.hypot(s.targets[id].x-q.x,s.targets[id].y-q.y)))<=3.5),'a primary attacker occupies a clear wall shoulder');
}
for(const team of ['HOME','AWAY'])for(const [x,count] of [[82,4],[77,3]]){
 const {m,s,p}=plan('FREE_KICK',team,x,34,{freeKickType:'DIRECT'});assert.equal(s.freeKickWall.count,count,'intermediate central wall count');
 const def=Object.entries(p.roles).filter(([id])=>m.playersById[id].team!==team);
 if(count===4)assert(def.filter(([id,r])=>r==='WALL'&&m.playersById[id].role==='WF').length<=1,'four-player wall retains winger width');
 for(const [id,r] of def)if(['MARK_CONTEST','BOX_ZONE','DEFENSIVE_SECOND_BALL','WIDE_EDGE_CLEARANCE'].includes(r))assert(!inBallWallCorridor(m,s,s.targets[id]),`${id} outside intermediate wall corridor`);
}
const wallDistances=[21.5,26.5,31.5,37.5,43.5],wallOffsets=[0,10,18],expectedDirect=[[4,3,2,1,0],[3,3,2,0,0],[3,2,1,0,0]],expectedIndirect=[[2,1,0,0,0],[2,1,0,0,0],[1,1,0,0,0]];
for(const [i,offset] of wallOffsets.entries()){
 const direct=[],indirect=[];
 for(const d of wallDistances){const x=105-Math.sqrt(d*d-offset*offset),y=34+offset;direct.push(plan('FREE_KICK','HOME',x,y,{freeKickType:'DIRECT'}).s.freeKickWall.count);indirect.push(plan('FREE_KICK','HOME',x,y,{freeKickType:'INDIRECT'}).s.freeKickWall.count);}
 assert.deepEqual(direct,expectedDirect[i],`direct wall matrix at lateral ${offset}`);
 assert.deepEqual(indirect,expectedIndirect[i],`indirect wall matrix at lateral ${offset}`);
 for(let j=0;j<wallDistances.length;j++){assert(direct[j]>=indirect[j],`indirect wall no larger at ${offset}/${wallDistances[j]}`);if(i)assert(direct[j]<=expectedDirect[0][j],`wide direct wall no larger at ${offset}/${wallDistances[j]}`);}
}
for(const team of ['HOME','AWAY'])for(const cornerY of [14,54]){
 const {m,s,p}=plan('CORNER',team,104,cornerY,{cornerType:'DELIVERED'}),def=m.players.filter(q=>q.team!==team&&q.role!=='GK'),marks=def.filter(q=>p.roles[q.id]==='BOX_MARK'),cm=def.filter(q=>q.role==='CM'&&p.roles[q.id]==='EDGE_CLEARANCE'),wf=def.filter(q=>q.role==='WF'&&p.roles[q.id]!=='BOX_MARK');
 const dangerCount=Object.values(p.roles).filter(r=>/^FIRST_WAVE_|^SECOND_WAVE_/.test(r)).length;
 assert.equal(marks.length,dangerCount,'delivered corner marks available danger actors');
 assert.equal(marks.filter(q=>['CB','FB'].includes(q.role)).length,Math.min(4,dangerCount),'backs take primary box marks before midfield');
 assert.equal(marks.filter(q=>q.role==='CM').length,Math.max(0,dangerCount-4),'midfielder fills any extra mark');
 assert(cm.length>=1,'non-marking midfielders occupy the edge');
 assert(wf.length>=1&&wf.every(q=>p.roles[q.id]==='WIDE_EDGE_CLEARANCE'),'non-marking wingers support wide clearance');
 for(const q of wf)assert(cm.some(c=>local(team,s.targets[q.id].x,s.targets[q.id].y).x<=local(team,s.targets[c.id].x,s.targets[c.id].y).x),'winger no deeper than an edge midfielder');
 assert(def.some(q=>q.role==='ST'&&p.roles[q.id]==='COUNTER_OUTLET'),'striker remains counter outlet');
 const before=JSON.stringify({roles:p.roles,targets:s.targets});R.assign(m);R.assign(m);assert.equal(JSON.stringify({roles:p.roles,targets:s.targets}),before,'corner assignment stable');
}
{const m=make('CORNER','HOME',104,14,{cornerType:'DELIVERED'}),back=m.playersById['A-RB'];back.role='WF';const s=R.begin(m),p=s.cornerPlan,def=m.players.filter(q=>q.team==='AWAY'),marks=def.filter(q=>p.roles[q.id]==='BOX_MARK');assert.equal(marks.filter(q=>['CB','FB'].includes(q.role)).length,3,'available backs mark first');assert(marks.some(q=>q.role==='CM'),'midfielder marks when a back is unavailable');}
for(const team of ['HOME','AWAY']){
 const top=plan('CORNER',team,104,14,{cornerType:'DELIVERED'}),bottom=plan('CORNER',team,104,54,{cornerType:'DELIVERED'});
 const shape=f=>Object.entries(f.p.roles).filter(([id])=>f.m.playersById[id].team!==team&&f.m.playersById[id].role!=='GK').map(([id,role])=>{const v=local(team,f.s.targets[id].x,f.s.targets[id].y);return `${role}:${v.x.toFixed(2)}:${v.y.toFixed(2)}`;}).sort();
 const reflected=Object.entries(top.p.roles).filter(([id])=>top.m.playersById[id].team!==team&&top.m.playersById[id].role!=='GK').map(([id,role])=>{const v=local(team,top.s.targets[id].x,top.s.targets[id].y);return `${role}:${v.x.toFixed(2)}:${(68-v.y).toFixed(2)}`;}).sort();
 assert.deepEqual(shape(bottom),reflected,'top and bottom corner defending shapes mirror');
}
function assertOwnLanePairs(fixture,label){
 const {m,s}=fixture,wallIds=new Set(s.freeKickWall?.wallPlayerIds||[]);
 for(const [leftSlot,rightSlot] of [['LW','RW'],['LB','RB'],['LCB','RCB'],['LCM','RCM']])for(const team of ['HOME','AWAY']){
  const left=m.players.find(p=>p.team===team&&p.slot===leftSlot),right=m.players.find(p=>p.team===team&&p.slot===rightSlot),lt=s.targets[left.id],rt=s.targets[right.id];
  if(!lt||!rt)continue;
  const targetL=local(team,lt.x,lt.y).y,targetR=local(team,rt.x,rt.y).y;
  assert(targetL<targetR,`${label}: ${team} ${leftSlot}/${rightSlot} targets preserve actor order`);
  if(!wallIds.has(left.id))assert(targetL<=34.5,`${label}: ${team} ${leftSlot} keeps own half`);
  if(!wallIds.has(right.id))assert(targetR>=33.5,`${label}: ${team} ${rightSlot} keeps own half`);
 }
 for(const team of ['HOME','AWAY'])for(const [fbSlot,cbSlot,sign] of [['LB','LCB',-1],['RB','RCB',1]]){
  const fb=m.players.find(p=>p.team===team&&p.slot===fbSlot),cb=m.players.find(p=>p.team===team&&p.slot===cbSlot);
  if(wallIds.has(fb.id)||wallIds.has(cb.id))continue;
  const fy=local(team,s.targets[fb.id].x,s.targets[fb.id].y).y,cy=local(team,s.targets[cb.id].x,s.targets[cb.id].y).y;
  assert(sign*(fy-cy)>=.35,`${label}: ${team} ${fbSlot} stays outside ${cbSlot} by line band`);
  assert(Math.abs(fy-34)>=Math.abs(cy-34)-.15,`${label}: ${team} ${cbSlot} remains central to ${fbSlot}`);
 }
}
const v62Cases={direct:plan('FREE_KICK','AWAY',88,34,{freeKickType:'DIRECT'}),indirect:plan('FREE_KICK','AWAY',70,14,{freeKickType:'INDIRECT'}),top:plan('CORNER','AWAY',104,14,{cornerType:'DELIVERED'}),bottom:plan('CORNER','AWAY',104,54,{cornerType:'DELIVERED'})};
for(const [label,fixture] of Object.entries(v62Cases))assertOwnLanePairs(fixture,`V62 ${label}`);
assert(v62Cases.direct.s.freeKickWall.count>=4,'V62 strong central wall');
{const {m,s}=v62Cases.direct,w=s.freeKickWall,ids=w.wallPlayerIds,def=w.defendingTeam,sideRank=id=>m.playersById[id].slot?.startsWith('L')?-1:m.playersById[id].slot?.startsWith('R')?1:0;
 assert.equal(w.count,5,'V62 strong wall count remains five');
 assert.deepEqual(ids,[...ids].sort((a,b)=>sideRank(a)-sideRank(b)||local(def,m.playersById[a].x,m.playersById[a].y).y-local(def,m.playersById[b].x,m.playersById[b].y).y),'V62 wall actors follow own-team side order');
 for(let i=1;i<w.wallPoints.length;i++)assert(local(def,w.wallPoints[i-1].x,w.wallPoints[i-1].y).y<local(def,w.wallPoints[i].x,w.wallPoints[i].y).y,'V62 wall points follow own-team side order');
 const lb=m.players.find(p=>p.team===def&&p.slot==='LB'),rb=m.players.find(p=>p.team===def&&p.slot==='RB');
 if(ids.includes(lb.id)&&ids.includes(rb.id))assert(ids.indexOf(lb.id)<ids.indexOf(rb.id),'V62 wall LB before RB');
}
for(const slot of ['LCB','RCB','LCM','RCM']){
 const a=v62Cases.top.m.players.find(p=>p.team==='HOME'&&p.slot===slot),b=v62Cases.bottom.m.players.find(p=>p.team==='HOME'&&p.slot===slot);
 assert.equal(v62Cases.top.p.roles[a.id],v62Cases.bottom.p.roles[b.id],`V62 corner ${slot} keeps assignment identity`);
}
{const wave=f=>Object.entries(f.p.roles).filter(([id,role])=>f.m.playersById[id].team==='AWAY'&&/^(?:FIRST_WAVE_|SECOND_WAVE_)/.test(role)).map(([id])=>{const v=local('AWAY',f.s.targets[id].x,f.s.targets[id].y);return `${v.x.toFixed(2)}:${v.y.toFixed(2)}`;}).sort();
 const reflected=Object.entries(v62Cases.top.p.roles).filter(([id,role])=>v62Cases.top.m.playersById[id].team==='AWAY'&&/^(?:FIRST_WAVE_|SECOND_WAVE_)/.test(role)).map(([id])=>{const v=local('AWAY',v62Cases.top.s.targets[id].x,v62Cases.top.s.targets[id].y);return `${v.x.toFixed(2)}:${(68-v.y).toFixed(2)}`;}).sort();
 assert.deepEqual(wave(v62Cases.bottom),reflected,'V62 corner contest geometry mirrors without relabeling CB/CM actors');
}
for(const p of v62Cases.direct.m.players.filter(q=>q.team==='AWAY'&&q.role==='WF')){
 const t=v62Cases.direct.s.targets[p.id],v=local('AWAY',t.x,t.y);
 if(t.task.endsWith('_HOLD')&&v.x>88)assert(Math.abs(v.y-34)>=5,`V62 ${p.id} outside central shot corridor`);
}
{const {m,s,p}=plan('FREE_KICK','HOME',88,34,{freeKickType:'DIRECT'}),w=s.freeKickWall;assert(w.count>=3);for(const q of w.wallPoints)assert(Math.hypot(q.x-m.restart.x,q.y-m.restart.y)>=9.15-.04);for(const [id,t] of Object.entries(s.targets))if(m.playersById[id].team==='HOME'&&id!==s.kickerId)for(const q of w.wallPoints)assert(Math.hypot(t.x-q.x,t.y-q.y)>=1-.04,`attacker clearance ${id}`);const before=JSON.stringify({roles:p.roles,targets:s.targets});R.assign(m);R.assign(m);assert.equal(JSON.stringify({roles:p.roles,targets:s.targets}),before,'repeated assignment stable');assert.equal(R.readiness(m).ready,false,'readiness false before setup');for(const [id,t] of Object.entries(s.targets)){const q=m.playersById[id];q.x=q.tx=t.x;q.y=q.ty=t.y;}R.readiness(m);m.time=s.maxReadyAt;m.restart.stage='APPROACH';const k=m.playersById[s.kickerId];k.x=k.tx=m.restart.x;k.y=k.ty=m.restart.y;R.assign(m);assert(R.readiness(m).ready,'readiness true after setup');}
{const {m,s}=plan('FREE_KICK','HOME',88,34,{freeKickType:'DIRECT'});for(const [id,t] of Object.entries(s.targets)){const p=m.playersById[id];p.x=t.x;p.y=t.y;}R.readiness(m);m.time=(s.minReadyAt+s.maxReadyAt)/2;m.restart.stage='APPROACH';const kicker=m.playersById[s.kickerId];kicker.x=m.restart.x;kicker.y=m.restart.y;const id=s.freeKickWall.wallPlayerIds[0],wallPlayer=m.playersById[id],target=s.targets[id];wallPlayer.x=target.x+2;assert.equal(R.readiness(m).ready,false,'actual wall player gates readiness');wallPlayer.x=target.x;assert(R.readiness(m).ready,'wall restores readiness');}
function realRestart(kind,metadata){const m=E.createMatch(`V59-REAL-${kind}-${JSON.stringify(metadata||{})}`),b=E.choiceActionBridge();m.time=30;m.protagonistControllerId='NO_USER_CHOICE';b.startDeadRestart(m,kind,'HOME',kind==='CORNER'?103.8:88,kind==='CORNER'?1.2:34,null,metadata);return{m,b};}
{const {m,b}=realRestart('FREE_KICK');assert.equal(m.restart.freeKickType,'DIRECT');b.startDeadRestart(m,'FREE_KICK','HOME',88,34,null,{freeKickType:'INDIRECT'});assert.equal(m.restart.freeKickType,'INDIRECT');b.startDeadRestart(m,'FREE_KICK','HOME',88,34,{freeKickType:'INVALID'});assert.equal(m.restart.freeKickType,'DIRECT');}
function lifecycle(kind){const {m}=realRestart(kind,kind==='FREE_KICK'?{freeKickType:'INDIRECT'}:null),seen=[m.phase];for(let i=0;i<520;i++){const s=m.restart?.setup;if(s&&m.restart.stage==='SETUP'){for(const [id,t] of Object.entries(s.targets)){const p=m.playersById[id];p.x=p.tx=t.x;p.y=p.ty=t.y;p.vx=p.vy=0;}m.time=Math.max(m.time,s.maxReadyAt);}E.step(m,.05);seen.push(m.phase);if(seen.includes('SET_PIECE_LIVE')&&m.phase==='OPEN_PLAY')break;}assert(seen.includes('SET_PIECE_SETUP'),`${kind} setup`);assert(seen.includes('SET_PIECE_LIVE'),`${kind} live`);assert(seen.includes('OPEN_PLAY'),`${kind} open play`);assert(!(m.events||[]).some(e=>e.type==='USER_CHOICE'),'no USER_CHOICE');assert(!(m.userChoiceLog||[]).length,'no unchosen hero action');const text=JSON.stringify({restart:m.restart,setPieceLive:m.setPieceLive,events:m.events,userChoiceLog:m.userChoiceLog});assert(!/(futureOutcome|winner|result)/i.test(text),'no future outcome/winner/result fields');}
lifecycle('FREE_KICK');lifecycle('CORNER');
{const m=E.createMatch('V59-DI'),b=E.choiceActionBridge(),seen=[m.phase];let setupAt=null,liveAt=null,openAt=null;m.protagonistControllerId='NO_USER_CHOICE';b.startDeadRestart(m,'FREE_KICK','AWAY',67.97,57.02,null,{freeKickType:'INDIRECT'});for(let i=0;i<800;i++){E.step(m,.05);seen.push(m.phase);if(m.phase==='SET_PIECE_SETUP'&&setupAt===null)setupAt=m.time;if(m.phase==='SET_PIECE_LIVE'&&liveAt===null)liveAt=m.time;if(m.phase==='OPEN_PLAY'&&liveAt!==null){openAt=m.time;break;}}const taken=(m.events||[]).find(e=>e.type==='FREE_KICK_TAKEN');assert(seen.includes('SET_PIECE_SETUP'),'V59-DI setup');assert(taken,'V59-DI free kick taken');assert(seen.includes('SET_PIECE_LIVE'),'V59-DI live');assert(seen.includes('OPEN_PLAY'),'V59-DI open play');assert(setupAt!==null&&taken.t-setupAt<12,`V59-DI natural setup bounded (${(taken.t-setupAt).toFixed(2)}s)`);assert(liveAt!==null&&openAt!==null&&openAt-liveAt<2,`V59-DI live-to-open bounded (${(openAt-liveAt).toFixed(2)}s)`);assert(!(m.events||[]).some(e=>e.type==='USER_CHOICE'),'V59-DI no USER_CHOICE');assert(!(m.userChoiceLog||[]).length,'V59-DI no unchosen hero action');const text=JSON.stringify({restart:m.restart,setPieceLive:m.setPieceLive,events:m.events,userChoiceLog:m.userChoiceLog});assert(!/(futureOutcome|winner|result)/i.test(text),'V59-DI no future outcome/winner/result fields');}
for(const kind of ['OFFSIDE','GOAL_KICK','THROW_IN','PENALTY']){const {m,b}=realRestart(kind);b.startDeadRestart(m,kind,'AWAY',60,34);assert.equal(m.restart.kind,kind);assert.notEqual(m.phase,'SET_PIECE_LIVE');assert.equal(m.restart.freeKickType,undefined);}
console.log(JSON.stringify({verdict:'PASS_V59_SET_PIECE_SPATIAL_BASELINE',futureOutcomePrecomputed:false,unchosenHeroAction:false}));
