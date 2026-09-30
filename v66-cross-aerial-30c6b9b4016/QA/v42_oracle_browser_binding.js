#!/usr/bin/env node
'use strict';
/* Converts only captured browser evidence into the existing independent Oracle inputs. */
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),CAP=path.join(ROOT,'evidence/v42/V42_ORACLE_BROWSER_CAPTURE.json'),OUT=path.join(ROOT,'evidence/v42/V42_ORACLE_BROWSER_RESULTS.json');
const {evaluate}=require('./v42_football_plausibility_oracle_runner');
function blocked(c){const ids=['SPI-001','MOT-004','CON-005','AUT-006','CHO-009','SES-010','DEP-012','CMP-011'];return{schemaVersion:'V42_ORACLE_BROWSER_RESULTS_1.0',disposition:'V42_BROWSER_ORACLE_BLOCKED',captureStatus:c?.verdict||'MISSING',blocker:c?.blocker||'BROWSER_CAPTURE_MISSING',results:ids.map(contractId=>({contractId,status:'BLOCKED',detail:'Real browser evidence unavailable; browser binding may not infer PASS from source/import-only observations.'})),note:'No browser-dependent contract is passed without real browser evidence.'}}
function bind(c){
  if(c?.verdict!=='CAPTURED'||!c.browser?.available||!c.frames?.length||!c.network?.length)return blocked(c);
  const options=c.dom?.offered||[],clicked=c.dom?.clicked||{};
  const o={seed:null,sessionId:null,frames:[],current:null,browser:{available:true,userAgent:c.browser.userAgent,pageUrl:c.browser.pageUrl},choices:options,choiceUi:{valid:options.length>0&&options.every(x=>x.choiceId!=null)},authority:{user:true,choiceId:clicked.choiceId,targetId:clicked.targetId,executedChoiceId:null,executedTargetId:null,focusHoverNoAction:c.dom?.focusHoverNoAction?.actionObserved===false},sessionLifecycle:{oldSeed:JSON.stringify(c.sessionLifecycle?.oldSeed),newSeed:JSON.stringify(c.sessionLifecycle?.newSeed)},deployment:{complete:c.network.every(x=>x.status&&x.contentType&&x.sha256),match:true,dependencies:c.network},completionLedger:[{actual:'UNPROVEN',claimed:'UNPROVEN'}]};
  const raw=evaluate(o); const results=raw.results.map(r=>{if(r.contractId==='AUT-006')return {...r,status:'BLOCKED',detail:'Rendered receipt text does not expose engine exact pair; capture must additionally obtain existing debug/download receipt.'};if(['SPI-001','MOT-004','CON-005'].includes(r.contractId))return {...r,status:'BLOCKED',detail:'Canvas pixels were captured but exposed 22-player state was not captured in this run.'};return r});
  return{schemaVersion:'V42_ORACLE_BROWSER_RESULTS_1.0',disposition:results.some(r=>['HARD_FAIL','FAIL'].includes(r.status))?'V42_BROWSER_ORACLE_CURRENT_FAIL_REPRODUCIBLE':'V42_BROWSER_ORACLE_IMPLEMENTATION_INCOMPLETE',captureStatus:c.verdict,results,capsules:raw.capsules,limits:['One browser episode cannot disprove the user report.']};
}
function run(){let c=null;try{c=JSON.parse(fs.readFileSync(CAP,'utf8'))}catch{}const r=bind(c);fs.writeFileSync(OUT,JSON.stringify(r,null,2)+'\n');return r}
if(require.main===module){const r=run();console.log(JSON.stringify({disposition:r.disposition,results:r.results?.length||0},null,2));process.exitCode=r.disposition==='V42_BROWSER_ORACLE_BLOCKED'?12:0}
module.exports={bind,run};
