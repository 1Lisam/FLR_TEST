(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FLR_LEGACY_COMMENTARY_HIGHLIGHT=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Presentation-only: these are already emitted Legacy receipts, never predictions.
const DECISIVE_TYPES=new Set(['GOAL','SAVE','PARRY','CHIP_SAVE','CHIP_PARRY','BLOCK','TACKLE','INTERCEPT','DRIBBLE_BEAT','TAKE_ON_TACKLED','TAKE_ON_LOOSE','FOUL','OFFSIDE','CORNER','GOAL_KICK','PENALTY','FULL_TIME']);
const PREFIX={GOAL:'골입니다.',SAVE:'막아냈습니다.',PARRY:'쳐냈습니다.',CHIP_SAVE:'막아냈습니다.',CHIP_PARRY:'쳐냈습니다.',BLOCK:'수비가 막아냈습니다.',TACKLE:'공을 빼앗았습니다.',INTERCEPT:'패스 길을 끊었습니다.',DRIBBLE_BEAT:'돌파가 이어집니다.',TAKE_ON_TACKLED:'돌파가 막혔습니다.',TAKE_ON_LOOSE:'공이 흘렀습니다.',FOUL:'파울로 흐름이 끊깁니다.',OFFSIDE:'오프사이드입니다.',CORNER:'코너킥입니다.',GOAL_KICK:'골킥으로 재개됩니다.',PENALTY:'페널티 상황입니다.',FULL_TIME:'경기 종료입니다.'};
const number=x=>Number(x);
function eventKey(e){return `${Number(e?.t).toFixed(3)}|${e?.type||''}|${e?.actorId||''}|${e?.targetId||''}|${e?.text||''}`;}
function isRecordedPastEvent(e,matchTime){return !!e&&DECISIVE_TYPES.has(e.type)&&Number.isFinite(number(e.t))&&number(e.t)<=number(matchTime)+.001;}
function actualEventFrames(history,event,matchTime,before=.8){const at=number(event?.t),now=number(matchTime);if(!Number.isFinite(at)||!Number.isFinite(now)||at>now+.001)return [];return(history||[]).filter(frame=>{const t=number(frame?.time);return Number.isFinite(t)&&t>=at-before-.001&&t<=now+.001;}).map(frame=>JSON.parse(JSON.stringify(frame)));}
function commentaryFor(e){const prefix=PREFIX[e?.type]||'실제 경기 기록입니다.',receipt=String(e?.text||'');return receipt?`${prefix} ${receipt}`:prefix;}
function isIndependentNonProtagonist(e,heroPlayerId){return isRecordedPastEvent(e,Number(e?.t))&&!!e.actorId&&e.actorId!==heroPlayerId;}
return{VERSION:'V51_LEGACY_COMMENTARY_HIGHLIGHT_1.0',DECISIVE_TYPES,eventKey,isRecordedPastEvent,actualEventFrames,commentaryFor,isIndependentNonProtagonist};
});
