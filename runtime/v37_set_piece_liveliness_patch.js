(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v37SetPieceLivelinessPatch)return;
const VERSION='V37-SET-PIECE-LIVELINESS-0.2-CORNER-RUNUP';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y));
const localToWorld=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const worldToLocal=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
function hash32(str){let h=2166136261>>>0;for(let i=0;i<String(str).length;i++){h^=String(str).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function playerById(m,id){return m?.playersById?.[id]||m?.players?.find(p=>p.id===id)||null;}
function repairCornerRunup(m,setup){const r=m?.restart;if(!r||r.kind!=='CORNER'||!setup||setup.kind!=='CORNER'||r.stage!=='SETUP'||!setup.kickerId)return setup;const t=setup.targets?.[setup.kickerId],kicker=playerById(m,setup.kickerId);if(!t||!kicker)return setup;
  const sx=r.x<52.5?1:-1,sy=r.y<34?1:-1,w={x:clamp(r.x+sx*1.65,.9,104.1),y:clamp(r.y+sy*1.65,.9,67.1)};
  t.x=w.x;t.y=w.y;t.task='CORNER_KICKER_RUNUP_START';t.required=true;t.sprint=true;if(setup.cornerRunup)setup.cornerRunup.start={...w};
  kicker.tx=w.x;kicker.ty=w.y;kicker.action='CORNER_KICKER_RUNUP_START';kicker.tacticalTask='CORNER_KICKER_RUNUP_START';kicker.sprint=dist(kicker,w)>2.0;setup.v37CornerRunupReachable=true;return setup;}
function nearestMarker(m,p,restartTeam){const wanted=p.team===restartTeam?m.players.filter(q=>q.team!==p.team&&q.role!=='GK'):m.players.filter(q=>q.team===restartTeam&&q.role!=='GK'&&q.id!==m.restart?.setup?.kickerId);let best=null,bd=99;for(const q of wanted){const d=dist(p,q);if(d<bd){bd=d;best=q;}}return bd<=5.4?best:null;}
function keepWallClear(m,setup,q){const wall=setup?.freeKickWall;if(!wall||wall.count<3)return q;let x=q.x,y=q.y;for(const w of wall.wallPoints||[]){let dx=x-w.x,dy=y-w.y,d=Math.hypot(dx,dy);if(d>=1.08)continue;if(d<.01){dx=x-m.restart.x;dy=y-m.restart.y;d=Math.hypot(dx,dy)||1;}const push=1.10-d;x+=dx/d*push;y+=dy/d*push;}return{x:clamp(x,1,104),y:clamp(y,1,67)};}
function livelyTarget(m,setup,p,t){const r=m.restart,elapsed=Math.max(0,m.time-(setup.createdAt||m.time)),local=worldToLocal(r.team,t.x,t.y),phase=(hash32(`${m.seed}|${r.kind}|${p.id}`)%6283)/1000,freq=.95+((hash32(`${p.id}|FREQ`)%700)/1000),a=Math.sin(elapsed*freq+phase),b=Math.sin(elapsed*(freq*.73)+phase*1.37);let ax=0,ay=0,task=t.task||p.tacticalTask||'SET_PIECE_SETUP';
  if(r.kind==='CORNER'){if(p.team===r.team&&['ST','WF','CM'].includes(p.role)){ax=.58;ay=.82;task='CORNER_ATTACK_JOSTLE';}else if(p.team!==r.team&&['CB','FB','CM'].includes(p.role)){ax=.38;ay=.62;task='CORNER_MARK_JOSTLE';}}
  else if(r.kind==='FREE_KICK'){if(p.team===r.team&&['ST','WF'].includes(p.role)){ax=.72;ay=.52;task='FREE_KICK_RUN_READY';}else if(p.team===r.team&&p.role==='CM'){ax=.34;ay=.38;task='FREE_KICK_SECOND_BALL_READY';}else if(p.team!==r.team&&['CB','FB','CM'].includes(p.role)){ax=.34;ay=.46;task='FREE_KICK_TRACK_RUNNER';}}
  if(ax===0&&ay===0)return null;let q=localToWorld(r.team,clamp(local.x+a*ax,1,104),clamp(local.y+b*ay,1,67));if(r.kind==='FREE_KICK'&&p.team===r.team)q=keepWallClear(m,setup,q);return{...q,task};}
function applyLiveliness(m,setup){const r=m?.restart;if(!r||!setup||!['CORNER','FREE_KICK'].includes(r.kind)||!setup.targets)return setup;repairCornerRunup(m,setup);const wallIds=new Set(setup.freeKickWall?.wallPlayerIds||[]);for(const [id,t] of Object.entries(setup.targets)){const p=m.playersById?.[id]||m.players.find(q=>q.id===id);if(!p||id===setup.kickerId||p.role==='GK'||wallIds.has(id)||String(t.task||'').includes('WALL')||String(t.task||'').includes('KICKER'))continue;if(dist(p,t)>3.4)continue;const q=livelyTarget(m,setup,p,t);if(!q)continue;p.tx=q.x;p.ty=q.y;p.action=q.task;p.tacticalTask=q.task;p.sprint=false;const marker=nearestMarker(m,p,r.team);p.markTargetId=marker?.id||null;}return setup;}
const baseBegin=R.begin.bind(R),baseAssign=R.assign.bind(R),baseDebug=typeof R.debugSummary==='function'?R.debugSummary.bind(R):null;
R.begin=function(m){const s=baseBegin(m);return applyLiveliness(m,s);};
R.assign=function(m){const ok=baseAssign(m);if(m?.restart?.setup)applyLiveliness(m,m.restart.setup);return ok;};
if(baseDebug)R.debugSummary=function(m){const d=baseDebug(m);if(d&&m?.restart&&['CORNER','FREE_KICK'].includes(m.restart.kind)){d.livelinessPatch=VERSION;if(m.restart.kind==='CORNER')d.cornerRunupReachable=!!m.restart.setup?.v37CornerRunupReachable;}return d;};
R.V37_SET_PIECE_LIVELINESS_VERSION=VERSION;R.__v37SetPieceLivelinessPatch=true;
})(typeof globalThis!=='undefined'?globalThis:this);
