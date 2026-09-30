#!/usr/bin/env node
'use strict';

// Focused no-query regressions for #1629.  These execute the public Legacy
// path and reject a V2 selector, auto-executed protagonist restart, or a
// renderer decision that hides an actual corner kick.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const H=require('../live_hybrid_session_v02.js'),V=require('../live_v06_scene_authority_browser.js'),Rare=require('../final_match_rare_scenario_harness.js');
const deep=value=>JSON.parse(JSON.stringify(value));
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
function element(id){return{id,disabled:false,checked:true,hidden:true,value:'',textContent:'',style:{},focus(){},removeAttribute(){},addEventListener(){}};}
async function reporter(){
 const elements={heroBugReport:element('heroBugReport'),heroBugOpenIssue:element('heroBugOpenIssue'),heroBugModal:element('heroBugModal'),heroBugDescription:element('heroBugDescription'),heroBugAttachJson:element('heroBugAttachJson'),heroBugCategory:{value:'기타'},heroBugPriority:{value:'3'},heroPlayback:element('heroPlayback')},actions={insertBefore(){}};
 elements.heroBugModal.querySelector=()=>actions;
 let legacyReportCalls=0,legacySubmitCalls=0,legacyOpenCalls=0;elements.heroBugReport.onclick=()=>{legacyReportCalls++;};elements.heroBugOpenIssue.onclick=()=>{legacySubmitCalls++;};
 const payloads=[],capture={captureKind:'BOUNDED_CURRENT_STATE',match:{second:7,score:{HOME:0,AWAY:0},possession:'HOME',phase:'OPEN_PLAY',heroPlayerId:'H-ST',heroRole:'ST'},ball:{mode:'CONTROLLED',x:53,y:34,ownerId:'H-ST'},players:[],futureOutcomePrecomputed:false};
 const win={FLR_BUG_REPORT_ENDPOINT:'https://report.test/report',FLR_CURRENT_BUG_STATE:()=>deep(capture),fetch:async(_url,init)=>{payloads.push(deep(JSON.parse(init.body)));return{status:201,ok:true,json:async()=>({ok:true,reportId:`r-${payloads.length}`,hasDebug:true})};}};
 Object.assign(win,{window:win,document:{readyState:'complete',getElementById:id=>elements[id]||null,createElement:()=>{const node=element('link');node.hidden=true;return node;}},MutationObserver:class{observe(){}},setTimeout:fn=>{fn();return 1},clearTimeout(){},console,crypto:{randomUUID:()=>`r-${payloads.length}`},location:{href:'http://flr.local/'},navigator:{userAgent:'qa'},open(){legacyOpenCalls++;}});
 vm.runInNewContext(read('final_match_bug_report_ui.js'),win,{filename:'final_match_bug_report_ui.js'});
 assert.equal(typeof elements.heroBugReport.onclick,'function','FINAL_REPORT_HANDLER_MISSING');
 elements.heroBugReport.onclick({preventDefault(){}});elements.heroBugDescription.value='normal';await elements.heroBugOpenIssue.onclick({preventDefault(){}});
 win.FLR_FINAL_MATCH_FORCED_REPORT={scenarioKey:'FORCED',snapshot:{time:12,score:{HOME:0,AWAY:0},possession:'HOME',phase:'OPEN_PLAY',ball:{mode:'CONTROLLED',x:60,y:34,ownerId:'H-ST'}},futureOutcomePrecomputed:false};
 elements.heroBugReport.onclick({preventDefault(){}});elements.heroBugDescription.value='forced';await elements.heroBugOpenIssue.onclick({preventDefault(){}});
 assert.equal(legacyReportCalls,0,'LEGACY_REPORT_HANDLER_INTERCEPTED');assert.equal(legacySubmitCalls,0,'LEGACY_SUBMIT_HANDLER_INTERCEPTED');assert.equal(legacyOpenCalls,0,'LEGACY_GITHUB_OPENER_INTERCEPTED');assert.equal(payloads.length,2,'ANONYMOUS_SUBMISSIONS_MISSING');assert.equal(payloads[0].debug.captureKind,'BOUNDED_CURRENT_STATE');assert.equal(payloads[1].debug.scenarioKey,'FORCED');
 return{normalDebug:payloads[0].debug.captureKind,forcedDebug:payloads[1].debug.scenarioKey,legacyHandlers:{report:legacyReportCalls,submit:legacySubmitCalls,githubOpen:legacyOpenCalls}};
}
function findLegacyBoundary(){for(let i=0;i<32;i++){const session=H.createSession({seed:`V55-R1629-LEGACY-${i}`,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:5400}),out=H.advanceUntilBoundary(session);if(out.boundary?.type==='PROTAGONIST_2D_WINDOW'&&out.boundary.stateSnapshot?.spatial?.schemaVersion==='HYBRID_AUTHORITATIVE_COARSE_SPATIAL_1.0')return{session,boundary:out.boundary};}throw new Error('DEFAULT_LEGACY_BOUNDARY_NOT_FOUND');}
function freezing(){
 const {session,boundary}=findLegacyBoundary();assert.equal(session.opts.continuousSpatialAuthorityV2Coarse,undefined,'V2_OPTION_ON_DEFAULT_PATH');
 const env=V.seedMatch(boundary,{seed:`${session.opts.seed}|V55`,runtimeDir:path.join(ROOT,'runtime'),explicitHeroChoiceRequired:true}),m=env.state.m,carrier=boundary.stateSnapshot.spatial;
 assert.equal(m.nextShape,m.time,'LEGACY_FIRST_SHAPE_NOT_ELIGIBLE');
 for(const p of m.players){const carried=carrier.players.find(row=>row.id===p.id);assert(carried,`CARRIER_PLAYER_MISSING:${p.id}`);assert.equal(p.x,carried.x,`ENTRY_X_CHANGED:${p.id}`);assert.equal(p.y,carried.y,`ENTRY_Y_CHANGED:${p.id}`);}
 env.E.step(m,.1);const forwards=m.players.filter(p=>p.role==='ST'||p.role==='WF').filter(p=>p.id!==m.ball.ownerId);
 assert(forwards.length>=5,'OFF_BALL_FORWARD_SAMPLE_TOO_SMALL');assert(forwards.every(p=>p.tacticalTask!=='CURRENT_STATE_HANDOFF'&&p.tacticalTask!=='MATCH_START_SHAPE'),`FORWARD_TARGET_STILL_FROZEN:${forwards.filter(p=>p.tacticalTask==='CURRENT_STATE_HANDOFF'||p.tacticalTask==='MATCH_START_SHAPE').map(p=>p.id).join(',')}`);
 return{schema:boundary.stateSnapshot.spatial.schemaVersion,entryCoordinates:'PRESERVED',firstHighResTargets:forwards.map(p=>[p.id,p.tacticalTask,Number(p.tx.toFixed(2)),Number(p.ty.toFixed(2))])};
}
function cornerDecision(){const source=read('step71_hybrid_v06_ui.js'),a=source.indexOf('function setPieceReplayDecision('),b=source.indexOf('function setPieceSummary(',a),ctx={eventMentionsHero:()=>false};vm.runInNewContext(source.slice(a,b),ctx,{filename:'step71_hybrid_v06_ui.js'});const decision=ctx.setPieceReplayDecision({actualEvents:[{type:'CORNER_KICK',t:44.2}],setPieceContinuation:null},{});assert.equal(decision.show,true,'CORNER_KICK_HIDDEN_WITHOUT_CONTINUATION');assert.equal(decision.eventT,44.2,'CORNER_KICK_EVENT_TIME_LOST');return decision;}
function corner(){
 const template=Rare.boundary('CORNER_ATTACK_RIGHT','V55-R1629-CORNER'),first=V.seedMatch(template,{seed:'V55-R1629-CORNER|SETPIECE',runtimeDir:path.join(ROOT,'runtime'),explicitHeroChoiceRequired:true}),kicker=first.state.m.restart?.setup?.kickerId;assert(kicker,'CORNER_KICKER_MISSING');
 const boundary=deep(template);boundary.heroPlayerId=kicker;boundary.heroRole=first.state.m.playersById[kicker].role;const opened=V.runSetPieceWindow(boundary,{seed:'V55-R1629-CORNER|SETPIECE',runtimeDir:path.join(ROOT,'runtime'),durationSeconds:12});
 assert.equal(opened.state.m.protagonistControllerId,kicker,'PROTAGONIST_KICKER_ID_DRIFT');assert(opened.pending?.kind==='RESTART','PROTAGONIST_CORNER_NOT_PAUSED');assert(!opened.state.m.events.some(e=>e.type==='CORNER_KICK'),'CORNER_AUTO_EXECUTED_BEFORE_CHOICE');
 const option=opened.pending.options.find(row=>row.targetId!=null);assert(option,'EXACT_CORNER_TARGET_OPTION_MISSING');const before=JSON.stringify({events:opened.state.m.events,pending:opened.state.pending});const rejected=opened.P.applyChoice(opened.state,option.id,`${option.targetId}-INVALID`,{source:'V55_INVALID'});assert.equal(rejected.ok,false,'INVALID_CORNER_TARGET_ACCEPTED');assert.equal(JSON.stringify({events:opened.state.m.events,pending:opened.state.pending}),before,'INVALID_CORNER_TARGET_MUTATED');
 const accepted=opened.P.applyChoice(opened.state,option.id,option.targetId,{source:'V55_EXACT'});assert.equal(accepted.ok,true,'EXACT_CORNER_CHOICE_REJECTED');const frames=[];for(let i=0;i<140&&!opened.state.m.events.some(e=>e.type==='CORNER_KICK');i++){opened.P.step(opened.state,.1);frames.push(opened.E.snapshot(opened.state.m));}const kick=opened.state.m.events.find(e=>e.type==='CORNER_KICK');assert(kick,'EXPLICIT_CORNER_CHOICE_DID_NOT_KICK');assert(frames.some(frame=>frame.time>=kick.t-.001&&frame.ball?.mode==='FLIGHT'),'EXPLICIT_CORNER_KICK_HAS_NO_CAUSAL_FRAME');
 return{decision:cornerDecision(),kicker,choice:[option.id,option.targetId],kickTime:Number(kick.t.toFixed(2)),postKickFrames:frames.filter(frame=>frame.time>=kick.t-.001).length};
}
async function run(){const result={schemaVersion:'V55_R1629_LEGACY_VISUAL_REGRESSIONS_1.0',defaultNoQueryLegacy:true,reporter:await reporter(),freezing:freezing(),corner:corner(),futureOutcomePrecomputed:false};console.log(JSON.stringify({...result,verdict:'PASS'},null,2));return result;}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
