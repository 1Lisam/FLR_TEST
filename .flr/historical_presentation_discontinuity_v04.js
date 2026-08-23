'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const file=path.join(ROOT,'step71_hybrid_v06_ui.js');
const src=fs.readFileSync(file,'utf8');
function extractFunction(name){
  const needle=`function ${name}(`,start=src.indexOf(needle);if(start<0)throw new Error(`missing ${needle}`);
  const open=src.indexOf('{',start);let depth=0,quote=null,esc=false;
  for(let i=open;i<src.length;i++){
    const ch=src[i];
    if(quote){if(esc){esc=false;continue;}if(ch==='\\'){esc=true;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0)return src.slice(start,i+1);}
  }
  throw new Error(`unclosed ${name}`);
}
const lerp=(a,b,t)=>a+(b-a)*t;
function angleLerp(a,b,t){if(!Number.isFinite(a))return b;if(!Number.isFinite(b))return a;let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return a+d*t;}
let result;
try{
  if(!src.includes('FLR_DISCONTINUITY_SNAP_V1'))throw new Error('missing discontinuity marker');
  const interp=(new Function('lerp','angleLerp',`${extractFunction('interp')}; return interp;`))(lerp,angleLerp);
  const base={time:1,ball:{x:0,y:0,z:0},players:[{id:'P',x:0,y:0,bodyAngle:0,faceTargetAngle:0}]};
  const far={time:1.1,ball:{x:10,y:0,z:0},players:[{id:'P',x:10,y:0,bodyAngle:0,faceTargetAngle:0}]};
  const near={time:1.1,ball:{x:1,y:0,z:0},players:[{id:'P',x:1,y:0,bodyAngle:0,faceTargetAngle:0}]};
  const a=interp(base,far,.5),b=interp(base,near,.5);
  const checks={playerLargeJumpSnaps:a.players[0].x===10,ballLargeJumpSnaps:a.ball.x===10,playerNormalMotionInterpolates:Math.abs(b.players[0].x-.5)<1e-9,ballNormalMotionInterpolates:Math.abs(b.ball.x-.5)<1e-9};
  result={schemaVersion:'FLR_HISTORICAL_PRESENTATION_DISCONTINUITY_V04_1.0',checks,status:Object.values(checks).every(Boolean)?'PASS':'FAIL'};
}catch(e){result={schemaVersion:'FLR_HISTORICAL_PRESENTATION_DISCONTINUITY_V04_1.0',status:'FAILED_TO_RUN',error:String(e&&e.stack||e)};}
console.log(JSON.stringify(result));process.exit(result.status==='PASS'?0:1);
