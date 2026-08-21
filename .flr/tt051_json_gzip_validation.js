'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||process.argv[1]||'.');
const worker=fs.readFileSync(path.join(root,'bug-report-worker/worker.js'),'utf8');
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
async function main(){
 add('gzip-helper-present',worker.includes("CompressionStream('gzip')")&&worker.includes("DecompressionStream('gzip')")&&worker.includes("'gz64:'"));
 add('legacy-read-compatible',worker.includes("if(!stored.startsWith('gz64:'))return stored"));
 add('metadata-only-preserved',worker.includes("hasDebug=p.debug!=null")&&worker.includes("storageEncoding:hasDebug?'gzip-base64-v1':null"));
 const b64=Buffer.from(worker,'utf8').toString('base64');const mod=await import('data:text/javascript;base64,'+b64),handler=mod.default;
 const reports=new Map(),chunks=new Map();
 class Stmt{constructor(sql){this.sql=sql;this.args=[]}bind(...a){this.args=a;return this}async first(){if(this.sql.startsWith('SELECT report_id'))return reports.get(this.args[0])||null;return null}async all(){if(this.sql.startsWith('SELECT chunk_no')){const arr=chunks.get(this.args[0])||[];return{results:arr.map((data,i)=>({chunk_no:i,data}))}}return{results:[]}}}
 const db={prepare(sql){return new Stmt(sql)},async batch(stmts){for(const st of stmts){if(st.sql.startsWith('INSERT INTO bug_reports')){const a=st.args;reports.set(a[0],{report_id:a[0],build:a[1],created_at:a[2],category:a[3],priority:a[4],description:a[5],size_bytes:a[6],chunk_count:a[7],summary_json:a[8],debug_schema_version:a[9]})}else if(st.sql.startsWith('INSERT INTO bug_report_chunks')){const [rid,no,data]=st.args,arr=chunks.get(rid)||[];arr[no]=data;chunks.set(rid,arr)}}}};
 const env={BUG_REPORT_DB:db,ALLOWED_ORIGIN:'https://1lisam.github.io'};
 const post=body=>handler.fetch(new Request('https://worker.test/report',{method:'POST',headers:{origin:'https://1lisam.github.io','content-type':'application/json'},body:JSON.stringify(body)}),env);
 const frames=Array.from({length:220},(_,i)=>({time:i/10,score:{HOME:1,AWAY:0},phase:'OPEN_PLAY',possession:'HOME',ball:{mode:'CONTROLLED',x:70+i*.01,y:34,z:0,ownerId:'H-ST'},players:Array.from({length:22},(_,j)=>({id:(j<11?'H-':'A-')+j,team:j<11?'HOME':'AWAY',role:j%5===0?'CM':'WF',slot:'S'+j,x:20+j*2+i*.001,y:5+j*2.5,vx:1.2,vy:.2,action:'MOVE_TO_RECEIVE',tacticalTask:'FAR_SIDE_RUN',markTargetId:null,hasBall:j===9}))}));
 const debug={schemaVersion:'FLR_BUG_REPORT_BUNDLE_0.3',scope:{currentSituation:true,previousSituation:true},currentSituation:{highResolution:{preActionFrames:frames.slice(0,110),postActionFrames:frames.slice(110),episodeFrames:frames}},previousSituation:{highResolution:{preActionFrames:frames.slice(0,100)}}};
 const rid='tt051-gzip-roundtrip-12345',res=await post({reportId:rid,build:'TT-0.51',category:'2D 움직임',priority:3,description:'gzip roundtrip',summary:{probe:true},debug}),j=await res.json();
 const stored=(chunks.get(rid)||[]).join(''),raw=JSON.stringify(debug);
 add('dynamic-post-201',res.status===201&&j.ok&&j.storageEncoding==='gzip-base64-v1',JSON.stringify(j));
 add('dynamic-stored-tagged',stored.startsWith('gz64:'),stored.slice(0,12));
 add('dynamic-storage-reduction',j.storedBytes<j.sizeBytes*.30,`raw=${j.sizeBytes} stored=${j.storedBytes}`);
 const get=await handler.fetch(new Request(`https://worker.test/reports/TT-0.51/${rid}.json`),env),got=await get.json();
 add('dynamic-roundtrip-exact-json',get.status===200&&JSON.stringify(got)===raw,`status=${get.status}`);
 const metaRid='tt051-gzip-metaonly-12345',mr=await post({reportId:metaRid,build:'TT-0.51',category:'UI/다시보기',priority:2,description:'metadata only',summary:{probe:'meta'},debug:null}),mj=await mr.json();
 add('dynamic-metadata-only',mr.status===201&&mj.hasDebug===false&&mj.storedBytes===0&&mj.jsonUrl===null,JSON.stringify(mj));
 const legacyRid='tt051-legacy-plain-12345',legacy={schemaVersion:'LEGACY',hello:'world'};reports.set(legacyRid,{report_id:legacyRid,build:'TT-0.51',created_at:new Date().toISOString(),category:'legacy',priority:1,description:'legacy',size_bytes:JSON.stringify(legacy).length,chunk_count:1,summary_json:'null'});chunks.set(legacyRid,[JSON.stringify(legacy)]);
 const lg=await handler.fetch(new Request(`https://worker.test/reports/TT-0.51/${legacyRid}.json`),env),lgj=await lg.json();
 add('dynamic-legacy-plain-read',lg.status===200&&lgj.hello==='world',`status=${lg.status}`);
 const failures=checks.filter(x=>!x.ok);console.log(JSON.stringify({schemaVersion:'FLR_TT051_JSON_GZIP_VALIDATION_1.0',pass:!failures.length,checks,failures},null,2));process.exit(failures.length?1:0)
}
main().catch(e=>{console.error(e);process.exit(2)});
