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
  // This wrapper must preserve the canonical outside-field origin.  The old
  // repair used an in-field offset and ordinary clamps, undoing buildCorner
  // and causing the recurring visual failure before RUN_UP even began.
  const lp=worldToLocal(r.team,r.x,r.y),top=lp.y<34,runupLocal={x:Math.max(105.45,lp.x+1.55),y:top?-0.72:68.72},w=localToWorld(r.team,runupLocal.x,runupLocal.y);
  t.x=w.x;t.y=w.y;t.task='CORNER_KICKER_RUNUP_START';t.required=true;t.sprint=true;if(setup.cornerRunup)setup.cornerRunup.start={...w};
  kicker.tx=w.x;kicker.ty=w.y;kicker.action='CORNER_KICKER_RUNUP_START';kicker.tacticalTask='CORNER_KICKER_RUNUP_START';kicker.sprint=dist(kicker,w)>2.0;setup.v37CornerRunupReachable=true;return setup;}
function keepWallClear(m,setup,q){const wall=setup?.freeKickWall;if(!wall||wall.count<3)return q;let x=q.x,y=q.y;for(const w of wall.wallPoints||[]){let dx=x-w.x,dy=y-w.y,d=Math.hypot(dx,dy);if(d>=1.08)continue;if(d<.01){dx=x-m.restart.x;dy=y-m.restart.y;d=Math.hypot(dx,dy)||1;}const push=1.10-d;x+=dx/d*push;y+=dy/d*push;}return{x:clamp(x,1,104),y:clamp(y,1,67)};}
function applyLiveliness(m,setup){const r=m?.restart;if(!r||!setup||r.kind!=='CORNER'||!setup.targets)return setup;repairCornerRunup(m,setup);return setup;}
const baseBegin=R.begin.bind(R),baseAssign=R.assign.bind(R),baseDebug=typeof R.debugSummary==='function'?R.debugSummary.bind(R):null;
R.begin=function(m){const s=baseBegin(m);return applyLiveliness(m,s);};
R.assign=function(m){const ok=baseAssign(m);if(m?.restart?.setup)applyLiveliness(m,m.restart.setup);return ok;};
if(baseDebug)R.debugSummary=function(m){const d=baseDebug(m);if(d&&m?.restart&&['CORNER','FREE_KICK'].includes(m.restart.kind)){d.livelinessPatch=VERSION;if(m.restart.kind==='CORNER')d.cornerRunupReachable=!!m.restart.setup?.v37CornerRunupReachable;}return d;};
R.V37_SET_PIECE_LIVELINESS_VERSION=VERSION;R.__v37SetPieceLivelinessPatch=true;
})(typeof globalThis!=='undefined'?globalThis:this);
