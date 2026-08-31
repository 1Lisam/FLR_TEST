(function(root){'use strict';
const H=root&&root.FLRPG_FINAL_MATCH_RARE_SCENARIOS;if(!H||H.__v36PresentationPatched)return;
const originalRun=H.run.bind(H);
function cloneFrame(f){return{...f,ball:f?.ball?{...f.ball}:f?.ball,players:Array.isArray(f?.players)?f.players.map(p=>({...p})):f?.players,events:Array.isArray(f?.events)?f.events.map(e=>({...e})):f?.events};}
function nearestContactPlayer(frame,ball,excludeId){let best=null,bestD=Infinity;for(const p of frame?.players||[]){if(!p||p.role==='GK'||p.id===excludeId)continue;const d=Math.hypot(Number(p.x)-Number(ball.x),Number(p.y)-Number(ball.y));if(d<bestD){bestD=d;best=p;}}return best;}
function smoothCrossContact(result){if(!result||!['CROSS_LEFT','CROSS_RIGHT'].includes(result.key)||!Array.isArray(result.frames)||result.frames.length<2)return result;
  const frames=result.frames.map(cloneFrame);let adjusted=false,contactIndex=-1,contactPlayerId=null,contactGap=null;
  for(let i=1;i<frames.length;i++){
    const prev=frames[i-1],cur=frames[i];if(prev?.ball?.kind!=='CROSS'||cur?.ball?.kind==='CROSS'||!cur?.ball)continue;
    let p=null;const changedTouch=cur.ball.lastTouchPlayer&&cur.ball.lastTouchPlayer!==prev.ball.lastTouchPlayer;
    const pid=cur.ball.ownerId||(changedTouch?cur.ball.lastTouchPlayer:null);if(pid)p=(cur.players||[]).find(x=>x.id===pid)||null;
    if(!p)p=nearestContactPlayer(cur,prev.ball,prev.ball.lastTouchPlayer);if(!p)break;
    const actualX=Number(cur.ball.x),actualY=Number(cur.ball.y),targetX=Number(p.x),targetY=Number(p.y),gap=Math.hypot(targetX-actualX,targetY-actualY);contactIndex=i;contactPlayerId=p.id;contactGap=gap;
    if(!Number.isFinite(gap)||gap<=.78)break;
    const dx=targetX-actualX,dy=targetY-actualY,span=Math.min(4,frames.length-i);
    for(let k=0;k<span;k++){const q=frames[i+k];if(!q?.ball)continue;const factor=span<=1?1:Math.max(0,1-k/(span-1));q.ball.x=Number(q.ball.x)+dx*factor;q.ball.y=Number(q.ball.y)+dy*factor;q.presentationOnly={...(q.presentationOnly||{}),crossContactBridge:true,sourceFrameIndex:i,contactPlayerId:p.id};}
    adjusted=true;break;
  }
  return{...result,frames,presentationContact:{applied:adjusted,contactIndex,contactPlayerId,originalGap:Number.isFinite(contactGap)?Number(contactGap.toFixed(3)):null,engineOutcomeUnchanged:true,futureOutcomePrecomputed:false}};
}
H.run=function(key,seed,opts){return smoothCrossContact(originalRun(key,seed,opts));};H.__v36PresentationPatched=true;
})(typeof globalThis!=='undefined'?globalThis:this);