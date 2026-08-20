(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_TAKE_ON_DUEL=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='STEP39-TAKE-ON-DUEL-0.1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resolve(ctx={}){
  const attack=Number(ctx.attackerSkill)||60,defend=Number(ctx.defenderSkill)||60;
  const dist=Number(ctx.distance)||2.5,space=Number(ctx.spaceBehind)||5;
  let win=0.42+(attack-defend)*0.0042+(space-4)*0.018+(dist>2.0?0.025:0)-(dist<1.25?0.06:0);
  if(ctx.wide)win+=0.025;
  win=clamp(win,0.25,0.76);
  const r=clamp(Number(ctx.roll)||0,0,0.999999);
  if(r<win)return{outcome:'BEAT_DEFENDER',winProbability:win};
  const cleanLoss=clamp(0.46+(defend-attack)*0.0035+(dist<1.5?0.08:0),0.32,0.70);
  const residual=(r-win)/Math.max(0.0001,1-win);
  return{outcome:residual<cleanLoss?'TACKLED':'LOOSE_BALL',winProbability:win};
}
return{VERSION,resolve};
});
