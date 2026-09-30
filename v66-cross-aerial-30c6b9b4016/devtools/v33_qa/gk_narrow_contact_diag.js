'use strict';
// Diagnostic-only runner. It instruments a temporary copy of the supplied runtime;
// it never edits the gameplay source file.
const fs=require('fs');
const os=require('os');
const path=require('path');

const current=path.resolve(process.argv[2]);
const baseline=path.resolve(process.argv[3]);
const trials=Math.min(100,Math.max(1,Number(process.argv[4]||100)));
if(!current||!baseline)process.exit(2);

function instrument(src,depsDir){
  let text=fs.readFileSync(src,'utf8');
  const needle='shotGKContact=d<=shotSaveRadius||lateralDive;';
  if(!text.includes(needle))throw new Error(`contact needle missing in ${src}`);
  text=text.replace(needle,`${needle}
      if(m.__gkDiag){m.__gkDiag.push({age:Number(m.ball.age.toFixed(3)),z:Number((m.ball.z||0).toFixed(3)),gkX:Number(gp.x.toFixed(3)),gkY:Number(gp.y.toFixed(3)),ballX:Number(bp.x.toFixed(3)),ballY:Number(bp.y.toFixed(3)),dx:Number(dx.toFixed(3)),dy:Number(dy.toFixed(3)),body:Number(shotSaveRadius.toFixed(3)),reacted:dive.reacted,post:Number(dive.post.toFixed(3)),saveSet,lateral:Number(lateralDiveReach.toFixed(3)),depth:Number(depthReach.toFixed(3)),ellipse:Number((((dx/depthReach)**2)+((dy/lateralDiveReach)**2)).toFixed(3)),lateralDive,contact:shotGKContact});}`);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flr-gk-narrow-'));
  const runtime=path.join(dir,'continuous_match_core.js');
  fs.writeFileSync(runtime,text);
  for(const name of ['attribute_match_adapter.js','tactical_movement.js','restart_movement.js','match_flow_resolution.js','match_choice_telemetry.js','action_candidate_engine.js','aerial_contest.js','take_on_duel.js','ball_strike_model.js']){
    const from=path.join(depsDir,name);if(fs.existsSync(from))fs.copyFileSync(from,path.join(dir,name));
  }
  return {dir,runtime};
}

function run(label,src){
  const t=instrument(src,path.dirname(current)),C=require(t.runtime),A=require(path.join(t.dir,'attribute_match_adapter.js')),B=C.choiceActionBridge();
  const rows=[];
  for(let i=0;i<trials;i++){
    const m=C.createMatch(`GK-NARROW-${String(i+1).padStart(3,'0')}`,{dt:.05});
    m.time=100;m.restart=null;m.phase='OPEN_PLAY';m.events=[];m.score={HOME:0,AWAY:0};m.nextShape=999;m.transitionUntil=0;m.__gkDiag=[];
    for(const p of m.players){p.hasBall=false;p.vx=p.vy=0;p.nextThink=1e9;if(p.role!=='GK'){p.x=45;p.y=5+(Number(p.id.charCodeAt(p.id.length-1))%9)*6;p.tx=p.x;p.ty=p.y;}}
    const st=m.playersById['H-ST'],gk=m.playersById['A-GK'];
    Object.assign(st,{x:92,y:34,tx:92,ty:34,nextThink:1e9,bodyAngle:0});
    Object.assign(gk,{x:102.5,y:34,tx:102.5,ty:34,nextThink:1e9,bodyAngle:Math.PI});
    m.playerAbilityProfiles={'H-ST':{finishing:70,long_shots:60,ball_control:70,agility:70},'A-GK':{handling:60,reaction:60,gk_positioning:60,agility:60,diving:60}};
    B.setControlled(m,st);st.controlledSince=m.time-1;st.lastReceivedAt=m.time-1;B.executeShot(m,st,'FORCED_CLEAR',{releaseNow:true});
    const initial={targetY:m.ball.shotTargetY,onTarget:m.ball.onTarget,speed:Number(Math.hypot(m.ball.vx,m.ball.vy).toFixed(3))};
    let outcome='TIMEOUT',endAge=null;
    for(let k=0;k<90;k++){C.step(m,.05);const es=m.events.slice(-5);if(es.some(e=>e.type==='GOAL')){outcome='GOAL';endAge=m.ball.age;break;}if(es.some(e=>e.type==='SAVE'||e.type==='PARRY')){outcome='SAVE';endAge=m.ball.age;break;}if(m.restart&&m.restart.kind==='GOAL_KICK'){outcome='MISS';endAge=m.ball.age;break;}}
    rows.push({i:i+1,...initial,targetOffset:Number(Math.abs(m.ball.shotTargetY-34).toFixed(3)),outcome,endAge:endAge==null?null:Number(endAge.toFixed(3)),checks:m.__gkDiag});
  }
  function avg(a){return a.length?Number((a.reduce((x,y)=>x+y,0)/a.length).toFixed(3)):null;}
  const outcomes={};for(const o of ['SAVE','GOAL','MISS','TIMEOUT']){const rr=rows.filter(r=>r.outcome===o),checks=rr.flatMap(r=>r.checks);outcomes[o]={n:rr.length,firstCheckAge:avg(rr.map(r=>r.checks[0]?.age).filter(Number.isFinite)),firstReactAge:avg(rr.map(r=>r.checks.find(x=>x.reacted)?.age).filter(Number.isFinite)),firstSaveSetAge:avg(rr.map(r=>r.checks.find(x=>x.saveSet)?.age).filter(Number.isFinite)),minEllipse:avg(rr.map(r=>Math.min(...r.checks.map(x=>x.ellipse))).filter(Number.isFinite)),minDx:avg(rr.map(r=>Math.min(...r.checks.map(x=>x.dx))).filter(Number.isFinite)),maxZ:avg(rr.map(r=>Math.max(...r.checks.map(x=>x.z))).filter(Number.isFinite)),bodyContacts:checks.filter(x=>x.contact&&!x.lateralDive).length,diveContacts:checks.filter(x=>x.contact&&x.lateralDive).length,heightRejected:checks.filter(x=>x.contact&&x.z>2.5).length};}
  return {label,trials,source:src,aggregate:{onTarget:rows.filter(r=>r.onTarget!==false).length,outcomes},rows};
}
const out={conditions:{geometry:'13m fixed clear shot',dt:.05,trialsPerSource:trials,totalMicroTrials:trials*2,fields:'contact-frame z/dx/dy, body radius, reaction/save-set timing, ellipse norm'},v7:run('V7_HEAD',baseline),v2:run('V2_CURRENT',current)};
console.log(JSON.stringify(out,null,2));
