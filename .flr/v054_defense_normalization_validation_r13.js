'use strict';
const path=require('path'),cp=require('child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
function runJson(script,args=[]){const p=cp.spawnSync(process.execPath,[path.join(__dirname,script),...args],{encoding:'utf8'});let obj;try{obj=JSON.parse(p.stdout);}catch(e){console.error(p.stdout,p.stderr);throw e;}return{status:p.status,obj,stderr:String(p.stderr||'').slice(-4000)};}
const base=runJson('v054_defense_normalization_validation_r5.js',[root]);
const checks=[...(base.obj.checks||[])],watches=[...(base.obj.watches||[])];const check=(id,pass,value)=>checks.push({id,pass:!!pass,value});
for(const seed of ['DEV-RECENT-1787573272419-1','DEV-RECENT-1787575663982-11']){
 const q=runJson('v054_backline_probe.js',[root,seed]);const b=q.obj;
 check(`BACKFOUR:${seed}:PROBE_COMPLETES`,q.status===0&&b.completed===true,{status:q.status,completed:b.completed,shots:b.shots,goals:b.goals});
 check(`BACKFOUR:${seed}:SEVERE_DEPTH_FRAGMENTATION`,Number(b.over6Pct)<=30,{avgSpread:b.avgSpread,over4Pct:b.over4Pct,over6Pct:b.over6Pct,maxSpread:b.maxSpread,shots:b.shots,goals:b.goals});
 watches.push({id:`BACKFOUR:${seed}:DEPTH_SHAPE`,value:{avgSpread:b.avgSpread,over4Pct:b.over4Pct,over6Pct:b.over6Pct,maxSpread:b.maxSpread,topDeep:b.topDeep}});
}
const eco=runJson('v054_ecology_probe.js',[root]);
check('ECOLOGY_PROBE_COMPLETES',eco.status===0&&(eco.obj.rows||[]).every(r=>r.completed),eco.obj.rows||[]);
for(const r of eco.obj.rows||[])watches.push({id:`ECOLOGY:${r.seed}`,value:r});
const failedIds=checks.filter(x=>!x.pass).map(x=>x.id),status=(base.status===0&&failedIds.length===0)?'PASS':'FAIL';
console.log(JSON.stringify({schemaVersion:'FLR_V054_DEFENCE_NORMALIZATION_VALIDATION_R13',status,baseStatus:base.obj.status,baseExitStatus:base.status,failedIds,checks,watches},null,2));if(status!=='PASS')process.exitCode=1;
