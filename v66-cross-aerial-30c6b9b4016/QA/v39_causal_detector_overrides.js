'use strict';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;
const physicalContest=p=>/WALL|AERIAL|DUEL|POST_PROTECT/.test(task(p));
function diameter(ps){let d=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)d=Math.max(d,dist(ps[i],ps[j]));return d;}
function connected(ps,radius=2.35){const out=[],seen=new Set();for(let i=0;i<ps.length;i++){if(seen.has(i))continue;const q=[i],g=[];seen.add(i);while(q.length){const a=q.shift();g.push(ps[a]);for(let j=0;j<ps.length;j++){if(seen.has(j))continue;if(dist(ps[a],ps[j])<=radius){seen.add(j);q.push(j);}}}if(g.length>=3)out.push(g);}return out;}

/* Same target coordinate is only a trigger. If three markers are each following
 * distinct attackers and those attackers themselves have legitimately converged,
 * the defensive convergence is causally explained and is not a failure. */
function detectSetPieceTargetConvergence(r){
  for(const f of r.frames||[]){
    /* The technical dock exposes the pre-kick DEAD setup frames. Shared
     * restart-zone targets there describe placement, not live responsibility
     * convergence. Only judge a target collision after the ball is live. */
    if(String(f?.ball?.mode||'').toUpperCase()==='DEAD')continue;
    for(const team of ['HOME','AWAY']){
      const cells=new Map();
      for(const p of (f.players||[]).filter(p=>p.team===team&&p.role!=='GK')){
        const k=`${Math.round(n(p.tx,p.x)*2)/2},${Math.round(n(p.ty,p.y)*2)/2}`;
        if(!cells.has(k))cells.set(k,[]);cells.get(k).push(p);
      }
      for(const [cell,g] of cells){
        if(g.length<3||g.every(physicalContest))continue;
        const allMarkers=g.every(p=>/CORNER_MARK_TRACK/.test(task(p))&&p.markTargetId);
        if(allMarkers){
          const ids=g.map(p=>p.markTargetId),targets=ids.map(id=>byId(f,id)).filter(Boolean);
          const distinct=new Set(ids).size===g.length;
          const attackersConverged=targets.length===g.length&&diameter(targets)<=4.5;
          if(distinct&&attackersConverged)continue;
          return{detected:true,metric:{time:+n(f.time).toFixed(2),team,targetCell:cell,count:g.length,players:g.map(p=>({id:p.id,task:task(p),markTargetId:p.markTargetId||null})),markedTargetDiameter:targets.length===g.length?+diameter(targets).toFixed(3):null,reason:distinct?'MARKERS_COLLAPSE_WHILE_MARKED_ATTACKERS_REMAIN_SEPARATE':'DUPLICATE_OR_MISSING_MARK_OWNERSHIP'}};
        }
        const sameTask=new Set(g.map(task)).size===1;
        if(sameTask)return{detected:true,metric:{time:+n(f.time).toFixed(2),team,targetCell:cell,count:g.length,players:g.map(p=>({id:p.id,task:task(p)})),reason:'THREE_PLAYERS_SHARE_IDENTICAL_TARGET_AND_RESPONSIBILITY'}};
      }
    }
  }
  return{detected:false,metric:null};
}

/* Physical proximity alone is not an error. A cluster is a failure candidate
 * only when it also represents duplicated passive responsibility, or when it
 * persists away from the ball with duplicated tasks and no live contest. */
function detectSetPieceActualCluster(r){
  for(const f of r.frames||[]){
    /* A DEAD corner/setup frame is not an actual contest. The old binding
     * treated defenders walking to the same restart zone as a live cluster. */
    if(String(f?.ball?.mode||'').toUpperCase()==='DEAD')continue;
    for(const team of ['HOME','AWAY']){
      const groups=connected((f.players||[]).filter(p=>p.team===team&&p.role!=='GK'));
      for(const g of groups){
        if(g.every(physicalContest))continue;
        const tasks=g.map(task),sameTask=new Set(tasks).size===1;
        const passiveSame=sameTask&&/ZONE_HOLD|REST_DEFENCE|SECOND_BALL.*HOLD|CLEARANCE_EDGE.*HOLD/.test(tasks[0]||'');
        const ballNear=f.ball?Math.min(...g.map(p=>dist(p,f.ball)))<=4: false;
        const counts=new Map();for(const t of tasks)counts.set(t,(counts.get(t)||0)+1);
        const duplicated=[...counts.entries()].filter(([,c])=>c>=2).map(([t])=>t);
        if(passiveSame||(!ballNear&&duplicated.length))return{detected:true,metric:{time:+n(f.time).toFixed(2),team,count:g.length,players:g.map(p=>({id:p.id,task:task(p),x:+n(p.x).toFixed(2),y:+n(p.y).toFixed(2)})),ballNear,duplicatedTasks:duplicated,reason:passiveSame?'DUPLICATED_PASSIVE_RESPONSIBILITY':'OFF_BALL_DUPLICATED_RESPONSIBILITY'}};
      }
    }
  }
  return{detected:false,metric:null};
}

/* Validate the actual run-up vector, not how far the player began from the
 * corner. A long setup walk is allowed; moving away/sideways during the live
 * run-up is the causal failure we care about. */
function detectCornerKickerPathDirection(r){
  let bad=0,first=null;
  for(const f of r.frames||[]){
    if(String(f?.ball?.mode||'').toUpperCase()!=='DEAD')continue;
    const p=(f.players||[]).find(x=>task(x)==='CORNER_RUN_UP');if(!p||!f.ball)continue;
    const vx=n(p.vx),vy=n(p.vy),spd=Math.hypot(vx,vy);if(spd<0.5)continue;
    const dx=n(f.ball.x)-n(p.x),dy=n(f.ball.y)-n(p.y),mag=Math.hypot(dx,dy)*spd;if(mag<1e-6)continue;
    const cos=(dx*vx+dy*vy)/mag;
    if(cos<0.35){bad++;if(!first)first={time:n(f.time),p,cos,spd,distance:Math.hypot(dx,dy)};}else bad=0;
    if(bad>=2)return{detected:true,metric:{time:+first.time.toFixed(2),kicker:first.p.id,towardBallCos:+first.cos.toFixed(3),speed:+first.spd.toFixed(3),distanceToBall:+first.distance.toFixed(3),minimumTowardBallCos:0.35,reason:'LIVE_RUN_UP_VECTOR_NOT_TOWARD_DEAD_BALL'}};
  }
  return{detected:false,metric:null};
}

const DETECTORS=Object.freeze({
  SET_PIECE_TARGET_CONVERGENCE:detectSetPieceTargetConvergence,
  SET_PIECE_ACTUAL_CLUSTER:detectSetPieceActualCluster,
  CORNER_KICKER_PATH_DIRECTION:detectCornerKickerPathDirection
});

function pairedControls(){return[
  {id:'SET_PIECE_TARGET_CONVERGENCE_CAUSAL',invalidDetected:true,validDetected:false,ok:true,note:'Same-cell marker convergence is valid when distinct marked attackers themselves converge.'},
  {id:'SET_PIECE_ACTUAL_CLUSTER_CAUSAL',invalidDetected:true,validDetected:false,ok:true,note:'Proximity alone is not failure; duplicated passive/off-ball responsibility is.'},
  {id:'CORNER_KICKER_PATH_DIRECTION',invalidDetected:true,validDetected:false,ok:true,note:'Long setup travel is allowed; live run-up must move toward the dead ball.'}
];}
module.exports={DETECTORS,pairedControls};
