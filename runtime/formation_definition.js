(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FLRPG_FORMATION_DEFINITION=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const FORMATIONS=Object.freeze({
  '4-3-3':Object.freeze({
    id:'4-3-3',
    slots:Object.freeze({
      GK:Object.freeze({roleFamily:'GK',lane:'CENTER',verticalLine:'GOALKEEPER',nominal:[6,34]}),
      LB:Object.freeze({roleFamily:'FB',lane:'LEFT_WIDE',verticalLine:'BACK_LINE',nominal:[25,9]}),
      LCB:Object.freeze({roleFamily:'CB',lane:'LEFT_HALFSPACE',verticalLine:'BACK_LINE',nominal:[22,25]}),
      RCB:Object.freeze({roleFamily:'CB',lane:'RIGHT_HALFSPACE',verticalLine:'BACK_LINE',nominal:[22,43]}),
      RB:Object.freeze({roleFamily:'FB',lane:'RIGHT_WIDE',verticalLine:'BACK_LINE',nominal:[25,59]}),
      LCM:Object.freeze({roleFamily:'CM',lane:'LEFT_HALFSPACE',verticalLine:'MIDFIELD_LINE',nominal:[45,20]}),
      CM:Object.freeze({roleFamily:'CM',lane:'CENTER',verticalLine:'MIDFIELD_LINE',nominal:[45,34]}),
      RCM:Object.freeze({roleFamily:'CM',lane:'RIGHT_HALFSPACE',verticalLine:'MIDFIELD_LINE',nominal:[45,48]}),
      LW:Object.freeze({roleFamily:'WF',lane:'LEFT_WIDE',verticalLine:'FRONT_LINE',nominal:[65,8]}),
      ST:Object.freeze({roleFamily:'ST',lane:'CENTER',verticalLine:'LAST_LINE',nominal:[70,34]}),
      RW:Object.freeze({roleFamily:'WF',lane:'RIGHT_WIDE',verticalLine:'FRONT_LINE',nominal:[65,60]})
    })
  })
});
function template(id='4-3-3'){return FORMATIONS[id]||FORMATIONS['4-3-3'];}
function descriptor(slot,id='4-3-3'){return template(id).slots[slot]||null;}
function roleFamily(slot,id='4-3-3'){return descriptor(slot,id)?.roleFamily||'CM';}
function side(slot,id='4-3-3'){const lane=descriptor(slot,id)?.lane||'CENTER';return lane.startsWith('LEFT')?'LEFT':lane.startsWith('RIGHT')?'RIGHT':'CENTER';}
function sideSign(slot,id='4-3-3'){return side(slot,id)==='LEFT'?-1:side(slot,id)==='RIGHT'?1:0;}
function nominal(slot,id='4-3-3'){const q=descriptor(slot,id)?.nominal||[45,34];return[q[0],q[1]];}
// Formation data is a reference shape only. It may seed kick-off/restart organisation and
// provide role/lane semantics, but it must NEVER manufacture a 2D scene-entry layout.
// Live Hybrid positions are advanced continuously from the previous spatial frame.
function shapeReferenceLocal({slot,role,inPossession,progress,phase,width=50,lineHeight=50,ballLocalY=34,formation='4-3-3'}){
  let [x,y]=nominal(slot,formation);const pr=Number(progress)||50;
  x+=(inPossession?1:-1)*clamp((pr-50)*.18,-8,10);
  x+=(Number(lineHeight||50)-50)*.08;
  const s=side(slot,formation),near=(ballLocalY<27&&s==='LEFT')||(ballLocalY>41&&s==='RIGHT');
  if(inPossession&&role==='CM'&&['FINAL_THIRD','CHANCE'].includes(phase))x=Math.max(x,slot==='CM'?58:67);
  if(inPossession&&role==='WF'&&['FINAL_THIRD','CHANCE'].includes(phase))x=Math.max(x,74);
  if(inPossession&&role==='ST'&&['FINAL_THIRD','CHANCE'].includes(phase))x=Math.max(x,80);
  const w=clamp(Number(width||50)/50,.75,1.25);y=34+(y-34)*w;
  if(role==='CM')x+=inPossession?(slot==='CM'?-1.1:(near?2.2:.7)):(slot==='CM'?.4:(near?-1.0:.8));
  else if(role==='FB')x+=inPossession?(near?2.0:-.5):(near?.6:-.3);
  else if(role==='WF')x+=inPossession?(near?1.4:2.4):(near?-1.0:.4);
  if(role!=='GK')y+=(ballLocalY-y)*(inPossession?.06:.12);
  return{x:clamp(x,4,101),y:clamp(y,4,64)};
}
// Compatibility alias for the Phase-1 callers. The name is historical; this remains only a
// reference target, never an instruction to re-place a live player at scene start.
const possessionBaseLocal=shapeReferenceLocal;
return{FORMATIONS,template,descriptor,roleFamily,side,sideSign,nominal,shapeReferenceLocal,possessionBaseLocal};
});
