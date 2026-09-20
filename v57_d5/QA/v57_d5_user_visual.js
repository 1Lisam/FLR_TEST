(function(){'use strict';
const api=()=>window.FLR_V57_FRAME_TICK_QA;
const mode=document.querySelector('#mode'),seed=document.querySelector('#seed'),speed=document.querySelector('#speed'),targets=document.querySelector('#targets');
let timer=null;
function stop(){if(timer){clearInterval(timer);timer=null;}}
function run(){stop();timer=setInterval(()=>{const n=Math.max(1,Number(speed.value)||1);for(let i=0;i<n;i++)api().step();},50);}
function init(){
  stop();
  api().init({mode:mode.value,scenario:'NATURAL',seed:seed.value,seconds:120,fps:20,showTargets:targets.checked,fixture:{kind:'NATURAL',source:'single_state_continuity_test.js:applyForcedScenario'}});
  run();
}
document.querySelector('#start').onclick=init;
document.querySelector('#pause').onclick=stop;
document.querySelector('#resume').onclick=run;
mode.onchange=init;
seed.onchange=init;
targets.onchange=()=>api().draw();
window.addEventListener('load',()=>{if(!api()?.engineReady())throw new Error('V57_ENGINE_COMPARE_NOT_READY');init();});
})();