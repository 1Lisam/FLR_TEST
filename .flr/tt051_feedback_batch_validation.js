'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||process.argv[1]||'.');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});

async function main(){
  const ui=read('step71_hybrid_v06_ui.js'),html=read('index.html'),worker=read('bug-report-worker/worker.js'),tactics=read('runtime/tactical_movement.js'),auth=read('live_v06_scene_authority_browser.js');
  add('history-goal-aware',ui.includes("function episodeHistoryHeadline")&&ui.includes("goal.team==='HOME'?'득점':'실점'")&&ui.includes('headline:episodeHistoryHeadline(events,session.lastResult)'));
  add('bug-json-checkbox-html',html.includes('id="heroBugAttachJson" checked')&&html.includes('경기 상황(JSON) 첨부'));
  add('bug-json-checkbox-reset',ui.includes("if(attach)attach.checked=true"));
  add('bug-modal-backdrop-does-not-close',!ui.includes("if(e.target===$('heroBugModal'))closeBugModal()")&&ui.includes("if(e.target===$('heroBugModal'))e.stopPropagation()"));
  add('bug-submit-json-optional',ui.includes("attachJson=$('heroBugAttachJson')?.checked!==false")&&ui.includes('debug:reportBundle')&&ui.includes("if(!r.ok||!j.ok)"));
  add('bug-submit-does-not-require-json-url',!ui.includes('!j.jsonUrl'));
  add('worker-allows-metadata-only',!worker.includes('||!p.debug||')&&worker.includes("hasDebug=p.debug!=null")&&worker.includes("const chunks=hasDebug?chunkUtf8(raw):[]"));
  add('worker-no-json-url-for-metadata',worker.includes("jsonUrl=hasDebug?")&&worker.includes("hasDebug:existingHasDebug")&&worker.includes("got.debug==null"));
  add('far-side-recovery-task',tactics.includes("task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':'FAR_SIDE_HOLD'"));
  add('far-side-recovery-targets-onside',tactics.includes('recover=local.x>safeX+.18')&&tactics.includes('runAlive?x:recover?safeX:Math.max(local.x,x)'));
  add('far-side-hold-stable-timing',tactics.includes("'FAR_SIDE_RUN','FAR_SIDE_HOLD','FAR_SIDE_RECOVER'"));
  add('old-offside-freeze-pattern-removed',!tactics.includes("return{lx:runAlive?x:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':'FAR_SIDE_HOLD'"));
  add('live-entry-contextual-preserved',auth.includes('function contextualEntry')&&auth.includes("tacticalTask='HYBRID_ENTRY_LIVE'"));
  add('one-touch-context-lead-preserved',auth.includes('contextLead=clamp(Number(opts.contextLeadSeconds)||1.6,1.2,2.4)'));
  add('future-precompute-contract-preserved',auth.includes('futureOutcomePrecomputed:false'));

  try{
    const b64=Buffer.from(worker,'utf8').toString('base64');
    const mod=await import('data:text/javascript;base64,'+b64); const handler=mod.default;
    const reports=new Map(),chunks=new Map();
    class Stmt{constructor(sql){this.sql=sql;this.args=[];}bind(...a){this.args=a;return this;}async first(){if(this.sql.startsWith('SELECT report_id'))return reports.get(this.args[0])||null;return null;}async all(){if(this.sql.startsWith('SELECT chunk_no')){const rid=this.args[0],a=chunks.get(rid)||[];return{results:a.map((data,i)=>({chunk_no:i,data}))};}return{results:[]};}}
    const db={prepare(sql){return new Stmt(sql)},async batch(stmts){for(const st of stmts){if(st.sql.startsWith('INSERT INTO bug_reports')){const a=st.args;reports.set(a[0],{report_id:a[0],build:a[1],created_at:a[2],category:a[3],priority:a[4],description:a[5],size_bytes:a[6],chunk_count:a[7],summary_json:a[8],debug_schema_version:a[9]});}else if(st.sql.startsWith('INSERT INTO bug_report_chunks')){const [rid,no,data]=st.args,arr=chunks.get(rid)||[];arr[no]=data;chunks.set(rid,arr);}}}};
    const env={BUG_REPORT_DB:db,ALLOWED_ORIGIN:'https://1lisam.github.io'};
    const post=async body=>handler.fetch(new Request('https://worker.test/report',{method:'POST',headers:{origin:'https://1lisam.github.io','content-type':'application/json'},body:JSON.stringify(body)}),env);
    const metaBody={reportId:'tt051-meta-only-12345',build:'TT-0.51',category:'UI/다시보기',priority:2,description:'UI only',summary:{x:1},debug:null};
    const mr=await post(metaBody),mj=await mr.json();
    add('dynamic-metadata-only-post',mr.status===201&&mj.ok&&mj.hasDebug===false&&mj.jsonUrl===null,JSON.stringify(mj));
    const mm=await handler.fetch(new Request('https://worker.test/report-meta/tt051-meta-only-12345'),env),mmj=await mm.json();
    add('dynamic-metadata-only-meta',mm.status===200&&mmj.hasDebug===false&&mmj.jsonUrl===null,JSON.stringify(mmj));
    const mg=await handler.fetch(new Request('https://worker.test/reports/TT-0.51/tt051-meta-only-12345.json'),env);
    add('dynamic-metadata-only-json-404',mg.status===404,`status=${mg.status}`);
    const fullDebug={schemaVersion:'FLR_BUG_REPORT_BUNDLE_0.3',scope:{currentSituation:true},currentSituation:{probe:true}};
    const fr=await post({...metaBody,reportId:'tt051-full-json-12345',description:'gameplay issue',debug:fullDebug}),fj=await fr.json();
    const fg=await handler.fetch(new Request('https://worker.test/reports/TT-0.51/tt051-full-json-12345.json'),env),fgj=await fg.json();
    add('dynamic-full-json-roundtrip',fr.status===201&&fj.hasDebug===true&&!!fj.jsonUrl&&fg.status===200&&JSON.stringify(fgj)===JSON.stringify(fullDebug),`post=${fr.status} get=${fg.status}`);
  }catch(e){add('dynamic-worker-mock',false,String(e&&e.stack||e));}

  let dynamic={};
  try{
    const A=require(path.join(root,'live_v06_scene_authority_browser.js'));
    const b={sceneId:'QA-FEEDBACK-LIVE',id:'QA-FEEDBACK-LIVE',type:'PROTAGONIST_2D_WINDOW',atSecond:600,reason:'ATTACKING_INVOLVEMENT',heroPlayerId:'H-ST',heroRole:'ST',heroTeam:'HOME',stateSnapshot:{second:600,score:{HOME:0,AWAY:0},possession:'HOME',zone:'FINAL_THIRD',phase:'FINAL_THIRD',danger:.62,ball:{team:'HOME',lane:'CENTER',progress:.72,ownerId:'H-CM'},structure:{HOME:{midfieldOccupancy:3,backLineOccupancy:4,width:56,lineHeight:55,transitionDebt:.18},AWAY:{midfieldOccupancy:3,backLineOccupancy:4,width:47,lineHeight:45,transitionDebt:.12}}},preContext:[{detail:{actorId:'H-RCM',targetId:'H-ST'}},{detail:{actorId:'H-CM',targetId:'H-ST'}}],futureOutcomePrecomputed:false,choicePrecomputed:false};
    const r=A.runToChoice(b,{runtimeDir:path.join(root,'runtime'),minPreSeconds:5,maxSearchSeconds:35,contextLeadSeconds:1.6}),ps=r.entrySnapshot?.players||[],moving=ps.filter(p=>Math.hypot(Number(p.vx)||0,Number(p.vy)||0)>.05).length;
    dynamic={moving,hadChoice:r.hadChoice,preSpan:r.preSpan,searchSeconds:r.searchSeconds,futureOutcomePrecomputed:r.futureOutcomePrecomputed};
    add('dynamic-live-entry-moving',moving>=12,`moving=${moving}`);
    add('dynamic-no-future-precompute',r.futureOutcomePrecomputed===false);
    add('dynamic-choice-visible-context',!r.hadChoice||(r.searchSeconds>=1.19&&r.preSpan>=1.0),JSON.stringify(dynamic));
  }catch(e){add('dynamic-live-entry-regression',false,String(e&&e.stack||e));}

  // Recreate the reported geometry: both wingers are ~0.7m beyond the current legal line and stationary.
  // A tactical update must give them a backward/on-side recovery target, not freeze them offside.
  try{
    const E=require(path.join(root,'runtime/continuous_match_core.js'));
    const m=E.createMatch('QA-WINGER-ONSIDE-RECOVERY');m.time=772.9;m.possession='HOME';m.phase='OPEN_PLAY';m.transitionUntil=0;m.nextShape=0;
    for(const p of m.players){p.hasBall=false;p.runUntil=0;p.releaseRunBiasAt=770;p.releaseRunTimingBias=-0.02;}
    const st=m.playersById['H-ST'];st.x=76.51;st.y=30.62;st.hasBall=true;st.controlledSince=772.1;
    const lw=m.playersById['H-LW'],rw=m.playersById['H-RW'];lw.x=78.94;lw.y=18;lw.tx=78.94;lw.ty=18;lw.vx=lw.vy=0;lw.tacticalTask=lw.action='FAR_SIDE_HOLD';rw.x=78.91;rw.y=50;rw.tx=78.91;rw.ty=50;rw.vx=rw.vy=0;rw.tacticalTask=rw.action='FAR_SIDE_HOLD';
    // Put second-last opponent near the reported 77.93 line.
    const xs={'A-LB':82,'A-LCB':79.2,'A-RCB':77.93,'A-RB':76.5,'A-LCM':68,'A-CM':66,'A-RCM':67,'A-LW':62,'A-ST':60,'A-RW':61};for(const [id,x] of Object.entries(xs)){m.playersById[id].x=x;}
    m.ball.mode='CONTROLLED';m.ball.ownerId='H-ST';m.ball.x=76.93;m.ball.y=30.63;m.ball.z=0;m.ball.vx=m.ball.vy=m.ball.vz=0;m.ball.lastTouchTeam='HOME';m.ball.lastTouchPlayer='H-ST';m.ballOwner='H-ST';m.lastTouchTeam='HOME';m.lastTouchPlayer='H-ST';
    const before={lw:lw.x,rw:rw.x};
    for(let i=0;i<4;i++)E.step(m,.1);
    const after={lw:{x:lw.x,tx:lw.tx,task:lw.tacticalTask},rw:{x:rw.x,tx:rw.tx,task:rw.tacticalTask}};
    const recovering=[lw,rw].every(p=>p.tacticalTask==='FAR_SIDE_RECOVER'&&p.tx<p.x-.1);
    add('dynamic-wingers-recover-onside',recovering,JSON.stringify({before,after}));
  }catch(e){add('dynamic-winger-recovery-run',false,String(e&&e.stack||e));}

  const failures=checks.filter(x=>!x.ok),out={schemaVersion:'FLR_TT051_FEEDBACK_BATCH_VALIDATION_1.1',pass:!failures.length,checks,dynamic,failures};
  console.log(JSON.stringify(out,null,2)); process.exit(failures.length?1:0);
}
main().catch(e=>{console.error(e);process.exit(2)});
