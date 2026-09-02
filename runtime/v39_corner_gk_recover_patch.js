(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v39CornerGKRecover)return;
const VERSION='V39-CORNER-GK-RECOVER-0.1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const other=t=>t==='HOME'?'AWAY':'HOME';
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const local=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id)||null;
const live=R.cornerLiveUpdate?.bind(R);
if(live)R.cornerLiveUpdate=function(m,sp){
  const ok=live(m,sp);if(!sp||sp.kind!=='CORNER')return ok;
  const defTeam=other(sp.team),gk=m.players.find(p=>p.team===defTeam&&p.role==='GK');if(!gk)return ok;
  const bl=local(sp.team,m.ball.x,m.ball.y);
  /* Keep the keeper in a goal-protection set position while the corner is live.
   * Small ball-side shading is allowed, but a passive GK_SET target must never
   * ask the keeper to remain several metres outside the goal-centre lane. */
  const shade=clamp((bl.y-34)*0.10,-2.6,2.6),w=world(sp.team,98.2,34+shade);
  gk.tx=w.x;gk.ty=w.y;gk.action='GK_SET';gk.tacticalTask='GK_SET';gk.sprint=Math.hypot(gk.x-w.x,gk.y-w.y)>2.2;
  return ok;
};
R.V39_CORNER_GK_RECOVER_VERSION=VERSION;R.__v39CornerGKRecover=true;
})(typeof globalThis!=='undefined'?globalThis:this);
