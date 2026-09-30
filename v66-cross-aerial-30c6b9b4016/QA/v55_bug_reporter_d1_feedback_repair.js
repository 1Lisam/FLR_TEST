#!/usr/bin/env node
'use strict';

// Focused regression for the D1 binding and final anonymous reporter feedback.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
function element(id){return{id,disabled:false,checked:true,hidden:true,value:'',textContent:'',style:{},focus(){},removeAttribute(){},addEventListener(){}};}
function binding(){
 const source=read('bug-report-worker/wrangler.toml'),match=source.match(/\[\[d1_databases\]\]\s+binding\s*=\s*"([^"]+)"\s+database_name\s*=\s*"([^"]+)"\s+database_id\s*=\s*"([^"]+)"/);
 assert(match,'D1_BINDING_BLOCK_MISSING');assert.deepEqual(match.slice(1),['BUG_REPORT_DB','flr-bug-reports','d9a6c89d-113c-4717-bc93-4d0ead3ea25d'],'D1_BINDING_IDENTITY_DRIFT');
 return{binding:match[1],databaseName:match[2],databaseId:match[3]};
}
async function feedback(){
 const elements={heroBugReport:element('heroBugReport'),heroBugOpenIssue:element('heroBugOpenIssue'),heroBugModal:element('heroBugModal'),heroBugDescription:element('heroBugDescription'),heroBugAttachJson:element('heroBugAttachJson'),heroBugCategory:{value:'QA'},heroBugPriority:{value:'3'},heroPlayback:element('heroPlayback')};
 const dialog={appendChild(node){elements[node.id]=node;}};elements.heroBugModal.querySelector=selector=>selector==='.bug-dialog'?dialog:null;
 const responses=[],calls=[];let releasePending;
 const win={FLR_BUG_REPORT_ENDPOINT:'https://report.test/report',fetch:async(_url,init)=>{calls.push(JSON.parse(init.body));return responses.shift()();}};
 Object.assign(win,{window:win,document:{readyState:'complete',getElementById:id=>elements[id]||null,createElement:tag=>element(tag)},MutationObserver:class{observe(){}},setTimeout:fn=>{fn();return 1},clearTimeout(){},console:{warn(){}},crypto:{randomUUID:()=>`qa-${calls.length}`},location:{href:'http://flr.local/'},navigator:{userAgent:'qa'}});
 vm.runInNewContext(read('final_match_bug_report_ui.js'),win,{filename:'final_match_bug_report_ui.js'});
 const submit=elements.heroBugOpenIssue,open=()=>elements.heroBugReport.onclick({preventDefault(){}}),send=async(text)=>{open();elements.heroBugDescription.value=text;return submit.onclick({preventDefault(){}});};
 responses.push(()=>new Promise(resolve=>{releasePending=()=>resolve({ok:true,status:201,json:async()=>({ok:true,reportId:'saved',hasDebug:false})});}));
 const first=send('pending then success');await Promise.resolve();await Promise.resolve();
 assert.equal(calls.length,1,'FIRST_SUBMISSION_NOT_SENT');assert.equal(submit.disabled,true,'PENDING_SUBMIT_NOT_DISABLED');assert.match(elements.heroBugReportStatus.textContent,/전송이 끝날 때까지 기다려주세요/,'PENDING_FEEDBACK_MISSING');
 const duplicate=submit.onclick({preventDefault(){}});await Promise.resolve();assert.equal(calls.length,1,'IN_FLIGHT_DUPLICATE_SUBMITTED');releasePending();await Promise.all([first,duplicate]);
 assert.equal(elements.heroBugModal.hidden,true,'SUCCESS_MODAL_NOT_CLOSED');assert.match(elements.heroPlayback.textContent,/버그 등록 완료/,'SUCCESS_FEEDBACK_MISSING');assert.equal(submit.disabled,false,'SUCCESS_SUBMIT_NOT_RESTORED');
 responses.push(()=>Promise.resolve({ok:true,status:201,json:async()=>({ok:'true'})}));await send('non boolean ok');assert.equal(elements.heroBugModal.hidden,false,'NON_BOOLEAN_OK_TREATED_AS_SUCCESS');assert.match(elements.heroBugReportStatus.textContent,/자동 등록 실패.*저장되지 않았습니다/,'NON_BOOLEAN_OK_FAILURE_NOT_VISIBLE');
 responses.push(()=>Promise.resolve({ok:false,status:503,json:async()=>({ok:true})}));await send('http failure');assert.equal(elements.heroBugModal.hidden,false,'HTTP_FAILURE_TREATED_AS_SUCCESS');assert.match(elements.heroPlayback.textContent,/자동 등록 실패.*저장되지 않았습니다/,'HTTP_FAILURE_NOT_VISIBLE');
 responses.push(()=>Promise.resolve({ok:true,status:201,json:async()=>{throw new Error('bad json');}}));await send('invalid response');assert.equal(elements.heroBugModal.hidden,false,'UNPARSED_RESPONSE_TREATED_AS_SUCCESS');assert.match(elements.heroBugReportStatus.textContent,/자동 등록 실패.*저장되지 않았습니다/,'UNPARSED_RESPONSE_NOT_VISIBLE');
 const source=read('final_match_bug_report_ui.js');assert.equal((source.match(/submit\.onclick\s*=/g)||[]).length,1,'FINAL_SUBMIT_HANDLER_NOT_UNIQUE');assert(!/heroBugFallbackLink|github\.com\/1Lisam\/FLR_TEST\/issues\/new|GitHub 수동 등록/.test(source),'MANUAL_GITHUB_FALLBACK_REINTRODUCED');
 return{requests:calls.length,pending:'VISIBLE_AND_DUPLICATE_BLOCKED',success:'PARSED_OK_TRUE_ONLY',failures:['non-boolean ok','HTTP failure','unparsed response'],manualGitHubFallback:false};
}
async function run(){const result={schemaVersion:'V55_BUG_REPORTER_D1_FEEDBACK_REPAIR_1.0',verdict:'PASS',d1:binding(),ui:await feedback()};console.log(JSON.stringify(result,null,2));return result;}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
