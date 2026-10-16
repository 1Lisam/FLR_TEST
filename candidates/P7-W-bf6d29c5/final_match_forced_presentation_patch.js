(function(root){'use strict';
const H=root&&root.FLRPG_FINAL_MATCH_RARE_SCENARIOS;if(!H||H.__v37PresentationPatched)return;
const baseRun=H.run.bind(H),deep=v=>v==null?v:JSON.parse(JSON.stringify(v));
function inspectCrossContact(result){if(!result||!['CROSS_LEFT','CROSS_RIGHT'].includes(result.key)||!Array.isArray(result.frames))return result;let contactIndex=-1,contactPlayerId=null,contactGap=null;for(let i=1;i<result.frames.length;i++){const a=result.frames[i-1],b=result.frames[i];if(a?.ball?.kind!=='CROSS'||b?.ball?.kind==='CROSS')continue;const id=b.ball.ownerId||b.ball.lastTouchPlayer,p=(b.players||[]).find(x=>x.id===id);contactIndex=i;contactPlayerId=id||null;contactGap=p?Math.hypot(p.x-b.ball.x,p.y-b.ball.y):null;break}return{...result,presentationContact:{applied:false,policy:'ENGINE_TRAJECTORY_ONLY_V37',contactIndex,contactPlayerId,observedGap:Number.isFinite(contactGap)?Number(contactGap.toFixed(3)):null,engineOutcomeUnchanged:true,futureOutcomePrecomputed:false}}}
H.run=function(key,seed,opts){const result=baseRun(key,seed,opts);return inspectCrossContact(result)};
H.__v37PresentationPatched=true;
})(typeof globalThis!=='undefined'?globalThis:this);
