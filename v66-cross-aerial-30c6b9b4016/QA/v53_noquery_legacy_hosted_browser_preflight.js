#!/usr/bin/env node
'use strict';

/*
 * Hosted-only browser preflight.  It intentionally has no application imports:
 * Chromium loads index.html through the same static HTTP boundary as a user.
 */
const crypto=require('crypto');
const fs=require('fs');
const http=require('http');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.resolve(process.env.V53_HOSTED_OUTPUT_DIR||path.join(ROOT,'artifacts','v53-hosted-browser-preflight'));
const RESULT=path.join(OUT,'HOSTED_RESULT.json');
const LOGS=path.join(OUT,'HOSTED_BROWSER_LOGS.json');
const SCREENSHOT=path.join(OUT,'HOSTED_SCREENSHOT.png');
const EXPECTED_IDS=['H-GK','H-LB','H-LCB','H-RCB','H-RB','H-LCM','H-CM','H-RCM','H-LW','H-ST','H-RW','A-GK','A-LB','A-LCB','A-RCB','A-RB','A-LCM','A-CM','A-RCM','A-LW','A-ST','A-RW'];
const ONE_PIXEL_PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9mQAAAABJRU5ErkJggg==','base64');

function sha256(text){return crypto.createHash('sha256').update(text).digest('hex');}
function writeJson(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
function plainError(error){return {name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||'').slice(0,12000)};}
function fail(message){throw new Error(message);}
function assert(condition,message){if(!condition)fail(message);}
function relativeScriptSource(value){return String(value||'').replace(/^https?:\/\/[^/]+\//,'').replace(/^\//,'').split('?')[0];}
function readIndexScripts(){const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');return [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match=>relativeScriptSource(match[1]));}
function localReporterIdentity(){return require(path.join(ROOT,'reporter_source_identity.js'));}
function localReporterCheck(){
  const api=localReporterIdentity(),expected=api.EXPECTED||{};
  const indexScriptChain=readIndexScripts();
  const errors=[];
  if(JSON.stringify(indexScriptChain)!==JSON.stringify(expected.scriptChain||[]))errors.push('LOCAL_INDEX_SCRIPT_CHAIN_MISMATCH');
  const sources=(expected.sources||[]).map(row=>{
    const file=path.resolve(ROOT,row.path);
    const contained=file===ROOT||file.startsWith(ROOT+path.sep);
    const exists=contained&&fs.existsSync(file);
    const actual=exists?sha256(fs.readFileSync(file)):null;
    return {path:row.path,expectedSha256:row.sha256,actualSha256:actual,status:actual===row.sha256?'MATCH':'MISMATCH'};
  });
  for(const row of sources)if(row.status!=='MATCH')errors.push(`LOCAL_SOURCE_HASH_MISMATCH:${row.path}`);
  const observedManifestSha256=sha256(JSON.stringify(sources.map(row=>({path:row.path,sha256:row.actualSha256})).sort((a,b)=>a.path.localeCompare(b.path))));
  if(observedManifestSha256!==expected.manifestSha256)errors.push('LOCAL_REPORTER_MANIFEST_HASH_MISMATCH');
  return {buildId:api.BUILD_ID||null,expectedScriptChain:expected.scriptChain||[],indexScriptChain,sources,expectedManifestSha256:expected.manifestSha256||null,observedManifestSha256,errors,ok:errors.length===0};
}
function mime(file){return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'})[path.extname(file).toLowerCase()]||'application/octet-stream';}
function startServer(){
  const server=http.createServer((req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
      const file=path.resolve(ROOT,'.'+requested);
      if(!(file===ROOT||file.startsWith(ROOT+path.sep)))throw new Error('PATH_OUTSIDE_ROOT');
      const data=fs.readFileSync(file);
      res.writeHead(200,{'content-type':mime(file),'cache-control':'no-store'});
      res.end(data);
    }catch(error){res.writeHead(404,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(`NOT_FOUND ${String(error?.message||error)}`);}
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve({server,origin:`http://127.0.0.1:${server.address().port}`}));
  });
}
function closeServer(server){return new Promise(resolve=>server?server.close(()=>resolve()):resolve());}
function kickoffCheck(capture){
  const preview=capture?.preview||{};
  const players=Array.isArray(preview.players)?preview.players:[];
  const ball=preview.ball||{};
  const errors=[];
  const ids=players.map(player=>player?.id);
  const owner=players.find(player=>player.id===ball.ownerId);
  if(capture?.boundary!=='KICKOFF_PREVIEW_PRE_DRAW')errors.push('KICKOFF_CALLBACK_BOUNDARY_INVALID');
  if(capture?.legacyMode!==true)errors.push('DEFAULT_LEGACY_MODE_NOT_CONFIRMED');
  if(Number(preview.time)!==0)errors.push('KICKOFF_TIME_NOT_ZERO');
  if(preview.futureOutcomePrecomputed!==false)errors.push('KICKOFF_FUTURE_PRECOMPUTE_NOT_FALSE');
  if(players.length!==22)errors.push(`KICKOFF_PLAYER_COUNT_${players.length}`);
  if(new Set(ids).size!==22)errors.push('KICKOFF_PLAYER_IDENTITIES_NOT_UNIQUE');
  if(JSON.stringify([...ids].sort())!==JSON.stringify([...EXPECTED_IDS].sort()))errors.push('KICKOFF_PLAYER_IDENTITIES_UNEXPECTED');
  for(const team of ['HOME','AWAY'])if(players.filter(player=>player.team===team).length!==11)errors.push(`KICKOFF_${team}_COUNT_INVALID`);
  for(const player of players){
    if(!Number.isFinite(player.x)||!Number.isFinite(player.y)||player.x<0||player.x>105||player.y<0||player.y>68)errors.push(`KICKOFF_PLAYER_POSITION_ILLEGAL:${player.id||'UNKNOWN'}`);
    if(player.id?.startsWith('H-')&&player.x>52.5)errors.push(`KICKOFF_HOME_OPPONENT_HALF:${player.id}`);
    if(player.id?.startsWith('A-')&&player.x<52.5)errors.push(`KICKOFF_AWAY_OPPONENT_HALF:${player.id}`);
  }
  if(ball.mode!=='CONTROLLED'||ball.ownerId!=='H-CM'||!owner)errors.push('KICKOFF_BALL_OWNER_INVALID');
  if(owner&&(Math.abs(Number(ball.x)-Number(owner.x))>.001||Math.abs(Number(ball.y)-Number(owner.y))>.001))errors.push('KICKOFF_BALL_OWNER_POSITION_INCONSISTENT');
  for(const player of players.filter(player=>player.team==='AWAY'))if(Math.hypot(player.x-52.5,player.y-34)<9.15-.001)errors.push(`KICKOFF_OPPONENT_CENTRE_CIRCLE_VIOLATION:${player.id}`);
  return {ok:errors.length===0,errors,summary:{boundary:capture?.boundary||null,legacyMode:capture?.legacyMode===true,time:preview.time??null,futureOutcomePrecomputed:preview.futureOutcomePrecomputed??null,playerCount:players.length,ids,ball:{mode:ball.mode||null,ownerId:ball.ownerId||null,x:ball.x??null,y:ball.y??null},owner:{id:owner?.id||null,x:owner?.x??null,y:owner?.y??null}}};
}
function hasFuturePrecompute(value,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return false;
  seen.add(value);
  for(const [key,child] of Object.entries(value)){
    if(key==='futureOutcomePrecomputed'&&child===true)return true;
    if(hasFuturePrecompute(child,seen))return true;
  }
  return false;
}
async function snapshotPage(page){
  return page.evaluate(()=>{
    const visible=element=>{if(!element)return false;const style=getComputedStyle(element),box=element.getBoundingClientRect();return !element.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;};
    const scripts=[...document.querySelectorAll('script[src]')].map(node=>{
      const absolute=new URL(node.src,location.href).href;
      const resource=performance.getEntriesByName(absolute).find(entry=>entry.initiatorType==='script')||null;
      return {src:new URL(node.src,location.href).pathname.replace(/^\//,''),domPresent:true,resourceObserved:!!resource,transferSize:resource?.transferSize??null,duration:resource?.duration??null};
    });
    const bug=document.getElementById('heroBugReport');
    return {href:location.href,search:location.search,readyState:document.readyState,scripts,bugReport:{exists:!!bug,visible:visible(bug),disabled:!!bug?.disabled,text:bug?.textContent?.trim()||null},testOnly:{dock:!!document.querySelector('#finalMatchTestDock,.final-match-test-dock'),humanCalibration:!!document.querySelector('#v40HumanCalibrationSurface,.v40-human-calibration-surface'),knownGlobals:['FLR_FINAL_MATCH_TEST_DOCK','FLR_HUMAN_CALIBRATION_SURFACE','FLR_QA_TEST_SURFACES'].filter(key=>window[key]===true||typeof window[key]==='object'),testOnlySources:[...document.scripts].map(node=>new URL(node.src||location.href,location.href).pathname.replace(/^\//,'')).filter(src=>['runtime/choice_resolution_harness.js','runtime/step38_influence_harness.js','final_match_rare_scenario_harness.js','final_match_forced_presentation_patch.js','final_match_v37_forced_harness_patch.js','final_match_test_dock.js','final_match_v37_test_visual_patch.js','v40_human_calibration_surface.js'].includes(src))},v2Flags:{queryV2:[...new URLSearchParams(location.search).keys()].filter(key=>/v2|continuous.*authority/i.test(key)),coarseOptIn:window.FLR_QA_CONTINUOUS_SPATIAL_AUTHORITY_V2_COARSE===true,authorityEnabled:typeof window.FLRPG_CONTINUOUS_SPATIAL_AUTHORITY_V2?.enabled==='function'&&window.FLRPG_CONTINUOUS_SPATIAL_AUTHORITY_V2.enabled({})===true,authorityCoarseEnabled:typeof window.FLRPG_CONTINUOUS_SPATIAL_AUTHORITY_V2?.coarseEnabled==='function'&&window.FLRPG_CONTINUOUS_SPATIAL_AUTHORITY_V2.coarseEnabled({})===true},ui:{clock:document.getElementById('heroClock')?.textContent?.trim()||null,playback:document.getElementById('heroPlayback')?.textContent?.trim()||null,eventLog:document.getElementById('heroEventLog')?.textContent?.trim()||null,choiceVisible:visible(document.getElementById('heroChoicePanel')),choiceOptions:[...document.querySelectorAll('#heroChoiceButtons button.choice-option')].map(button=>({text:button.textContent.trim(),choiceId:button.dataset.choiceId||null,targetId:button.dataset.targetId||null})),debugSummary:document.getElementById('heroDebugSummary')?.textContent?.trim()||null},capture:window.__V53_HOSTED_PREFLIGHT_CAPTURE__||null};
  });
}
async function run(){
  const local=localReporterCheck();
  assert(local.ok,local.errors.join(','));
  const {chromium}=require('playwright');
  const {server,origin}=await startServer();
  const logs={console:[],pageErrors:[],requestFailures:[]};
  let browser,page;
  try{
    browser=await chromium.launch({headless:true});
    page=await browser.newPage({viewport:{width:1440,height:1080}});
    page.on('console',message=>logs.console.push({type:message.type(),text:message.text(),location:message.location()}));
    page.on('pageerror',error=>logs.pageErrors.push(plainError(error)));
    page.on('requestfailed',request=>logs.requestFailures.push({url:request.url(),failure:request.failure()}));
    await page.addInitScript(()=>{
      const compact=payload=>{const preview=payload?.preview||{},session=payload?.session||{};return {boundary:payload?.boundary||null,meta:payload?.meta||null,legacyMode:!session._continuousSpatialAuthorityV2&&!session._v2ResolutionLease&&session.opts?.continuousSpatialAuthorityV2Coarse!==true,preview:{time:preview.time??null,stateId:preview.stateId??null,futureOutcomePrecomputed:preview.futureOutcomePrecomputed??null,players:(preview.players||[]).map(player=>({id:player.id,team:player.team,role:player.role,slot:player.slot,x:player.x,y:player.y,tx:player.tx,ty:player.ty})),ball:preview.ball?{mode:preview.ball.mode,x:preview.ball.x,y:preview.ball.y,ownerId:preview.ball.ownerId}:null}};};
      window.__V53_HOSTED_PREFLIGHT_CAPTURE__={kickoffs:[],pendings:[],choiceClicks:[]};
      window.FLR_QA_KICKOFF_PREVIEW_CAPTURE=payload=>window.__V53_HOSTED_PREFLIGHT_CAPTURE__.kickoffs.push(compact(payload));
      window.FLR_QA_SHOW_PENDING_CAPTURE=payload=>window.__V53_HOSTED_PREFLIGHT_CAPTURE__.pendings.push({boundary:payload?.boundary||null,meta:payload?.meta||null,pending:{futureOutcomePrecomputed:payload?.pending?.futureOutcomePrecomputed??false,options:(payload?.pending?.options||[]).map(option=>({id:option.id,targetId:option.targetId??null,label:option.label??null}))},state:{time:payload?.state?.time??null,futureOutcomePrecomputed:payload?.state?.futureOutcomePrecomputed??false,ballOwnerId:payload?.state?.ball?.ownerId??null}});
      document.addEventListener('click',event=>{const button=event.target?.closest?.('#heroChoiceButtons button.choice-option');if(button)window.__V53_HOSTED_PREFLIGHT_CAPTURE__.choiceClicks.push({trusted:event.isTrusted,text:button.textContent.trim(),at:Date.now()});},true);
    });
    await page.goto(`${origin}/`,{waitUntil:'load',timeout:20000});
    await page.waitForTimeout(300);
    const before=await snapshotPage(page);
    assert(before.search==='',`QUERY_STRING_PRESENT:${before.search}`);
    assert(before.href===`${origin}/`,'NON_CANONICAL_LOCALHOST_URL');
    assert(before.bugReport.exists&&before.bugReport.visible&&!before.bugReport.disabled,'BUG_REPORT_CONTROL_NOT_VISIBLE_AND_ENABLED');
    assert(!before.testOnly.dock&&!before.testOnly.humanCalibration&&!before.testOnly.knownGlobals.length&&!before.testOnly.testOnlySources.length,'TEST_ONLY_SURFACE_PRESENT');
    assert(!before.v2Flags.queryV2.length&&!before.v2Flags.coarseOptIn&&!before.v2Flags.authorityEnabled&&!before.v2Flags.authorityCoarseEnabled,'V2_FLAG_OR_MODE_ACTIVE');
    assert(before.capture?.kickoffs?.length===1,'KICKOFF_CALLBACK_NOT_CAPTURED_BEFORE_PAGE_SCRIPTS_COMPLETE');
    const kickoff=kickoffCheck(before.capture.kickoffs[0]);
    assert(kickoff.ok,kickoff.errors.join(','));
    const expectedStatus=local.expectedScriptChain.map(src=>before.scripts.find(row=>row.src===src)||{src,domPresent:false,resourceObserved:false,status:'MISSING'}).map(row=>({...row,status:row.domPresent&&row.resourceObserved?'LOADED':'MISSING_OR_UNOBSERVED'}));
    assert(expectedStatus.every(row=>row.status==='LOADED'),'LOADED_SCRIPT_STATUS_FAILURE');
    const browserIdentity=await page.evaluate(async()=>{
      const api=window.FLR_REPORTER_SOURCE_IDENTITY;
      if(!api?.capture)return {missing:true};
      return api.capture({matchSecond:0,boundaryIdOrSceneId:'KICKOFF_PREVIEW_PRE_DRAW',heroPlayerId:'H-ST',heroRole:'ST',pendingChoice:null,committedChoice:null,currentStateMarkers:{phase:'BUILD_UP',possession:'HOME',ball:{ownerId:'H-CM'}},futureOutcomePrecomputed:false});
    });
    assert(browserIdentity?.validation?.classification==='CURRENT_MATCH',`BROWSER_REPORTER_IDENTITY_${browserIdentity?.validation?.classification||'MISSING'}`);
    const startBefore={clock:before.ui.clock,playback:before.ui.playback,eventLog:before.ui.eventLog};
    await page.locator('#heroStart').click();
    let after=before;
    const deadline=Date.now()+12000;
    while(Date.now()<deadline){
      await page.waitForTimeout(250);
      after=await snapshotPage(page);
      if(after.ui.choiceVisible||after.ui.clock!==startBefore.clock||after.ui.eventLog!==startBefore.eventLog)break;
    }
    const progressed=after.ui.choiceVisible||after.ui.clock!==startBefore.clock||after.ui.eventLog!==startBefore.eventLog||/진행|탐색|선택|재개/.test(after.ui.playback||'');
    assert(progressed,'START_DID_NOT_PRODUCE_BOUNDED_PROGRESSION');
    let choice={appeared:after.ui.choiceVisible,clicked:false,progressedAfterClick:null,noFuturePrecompute:true};
    if(after.ui.choiceVisible){
      const options=page.locator('#heroChoiceButtons button.choice-option');
      assert(await options.count()>0,'VISIBLE_CHOICE_WITHOUT_DOM_OPTION');
      const beforeChoice=after;
      assert(!hasFuturePrecompute(beforeChoice.capture?.pendings||[]),'CHOICE_CAPTURE_FUTURE_PRECOMPUTE_TRUE');
      await options.first().click();
      choice.clicked=true;
      const choiceDeadline=Date.now()+8000;
      do{await page.waitForTimeout(200);after=await snapshotPage(page);}while(Date.now()<choiceDeadline&&after.ui.choiceVisible&&after.ui.playback===beforeChoice.ui.playback&&after.ui.eventLog===beforeChoice.ui.eventLog);
      choice.progressedAfterClick=!after.ui.choiceVisible||after.ui.playback!==beforeChoice.ui.playback||after.ui.eventLog!==beforeChoice.ui.eventLog;
      choice.noFuturePrecompute=!hasFuturePrecompute(after.capture?.pendings||[])&&!/futurePrecomputed=true/.test(after.ui.debugSummary||'');
      assert(after.capture?.choiceClicks?.some(row=>row.trusted===true),'CHOICE_WAS_NOT_A_REAL_DOM_CLICK');
      assert(choice.progressedAfterClick,'CHOICE_CLICK_DID_NOT_PROGRESS');
      assert(choice.noFuturePrecompute,'CHOICE_PATH_FUTURE_PRECOMPUTE_DETECTED');
    }
    await page.screenshot({path:SCREENSHOT,fullPage:true});
    const pageErrors=logs.pageErrors.length;
    const consoleErrors=logs.console.filter(row=>row.type==='error');
    assert(pageErrors===0,'PAGE_ERRORS_PRESENT');
    assert(consoleErrors.length===0,'CONSOLE_ERRORS_PRESENT');
    assert(logs.requestFailures.length===0,'REQUEST_FAILURES_PRESENT');
    return {schemaVersion:'FLR_V53_NOQUERY_LEGACY_HOSTED_BROWSER_PREFLIGHT_1.0',verdict:'PASS',userVisualPass:'NO',environment:{origin,url:before.href,queryString:before.search,hostedBrowser:'Playwright Chromium'},localReporter:local,kickoff,loadedScripts:expectedStatus,browserReporterIdentity:{buildId:browserIdentity.buildId||null,classification:browserIdentity.validation?.classification||null,sourceStatuses:browserIdentity.sourceStatuses||[]},before,startBefore,after,choice,logs};
  }catch(error){
    if(page)try{await page.screenshot({path:SCREENSHOT,fullPage:true});}catch(_){}
    error.v53Logs=logs;
    throw error;
  }finally{
    if(browser)await browser.close();
    await closeServer(server);
  }
}

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  // Ensures the failure artifact set remains complete even if Chromium cannot launch.
  fs.writeFileSync(SCREENSHOT,ONE_PIXEL_PNG);
  let result;
  try{result=await run();}
  catch(error){result={schemaVersion:'FLR_V53_NOQUERY_LEGACY_HOSTED_BROWSER_PREFLIGHT_1.0',verdict:'FAIL',userVisualPass:'NO',error:plainError(error),logs:error.v53Logs||{console:[],pageErrors:[],requestFailures:[]}};}
  writeJson(RESULT,result);
  writeJson(LOGS,result.logs||{console:[],pageErrors:[],requestFailures:[],runnerError:result.error||null});
  process.stdout.write(JSON.stringify({verdict:result.verdict,result:RESULT,screenshot:SCREENSHOT,logs:LOGS})+'\n');
  if(result.verdict!=='PASS')process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
