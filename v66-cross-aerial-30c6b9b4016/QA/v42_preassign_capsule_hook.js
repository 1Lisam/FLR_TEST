'use strict';
/* QA-only observer installed in the isolated 332810c reference clone. */
function install({globalObject=globalThis,clone=JSON.parse,at=885.2}={}){
  let capture=null;
  const previous=globalObject.__V42_PREASSIGN_HOOK;
  globalObject.__V42_PREASSIGN_HOOK=match=>{
    if(!capture&&Math.abs(Number(match.time)-at)<1e-7)capture={time:match.time,state:clone(JSON.stringify(match))};
  };
  return{read:()=>capture,restore:()=>{globalObject.__V42_PREASSIGN_HOOK=previous;}};
}
module.exports={install};
