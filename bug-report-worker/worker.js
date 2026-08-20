const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}});
function cors(origin,env){const allowed=(env.ALLOWED_ORIGIN||'https://1lisam.github.io').split(',').map(x=>x.trim());return allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'}:{};}
function validId(v){return typeof v==='string'&&/^[a-zA-Z0-9-]{12,80}$/.test(v)}
async function githubIssue(env,title,body){const r=await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`,{method:'POST',headers:{'authorization':`Bearer ${env.GITHUB_TOKEN}`,'accept':'application/vnd.github+json','user-agent':'FLR-Bug-Reporter','x-github-api-version':'2022-11-28','content-type':'application/json'},body:JSON.stringify({title,body})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`GitHub ${r.status}: ${j.message||'issue create failed'}`);return j;}
export default {async fetch(request,env){const u=new URL(request.url),origin=request.headers.get('origin')||'',ch=cors(origin,env);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:ch});
  if(request.method==='GET'&&u.pathname.startsWith('/reports/')){const key=u.pathname.slice(1);const obj=await env.BUG_REPORTS.get(key);if(!obj)return new Response('Not found',{status:404});return new Response(obj.body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=31536000, immutable'}});}
  if(request.method!=='POST'||u.pathname!=='/report')return json({ok:false,error:'not found'},404,ch);
  if(!ch['access-control-allow-origin'])return json({ok:false,error:'origin not allowed'},403,ch);
  const len=Number(request.headers.get('content-length')||0);if(len>8_000_000)return json({ok:false,error:'report too large'},413,ch);
  let p;try{p=await request.json()}catch{return json({ok:false,error:'invalid json'},400,ch)}
  if(!validId(p.reportId)||!p.debug||typeof p.description!=='string'||!p.description.trim())return json({ok:false,error:'invalid report'},400,ch);
  const reportId=p.reportId,build=String(p.build||'UNKNOWN').replace(/[^A-Za-z0-9._-]+/g,'_'),key=`reports/${build}/${reportId}.json`,metaKey=`meta/${reportId}.json`;
  const existingMeta=await env.BUG_REPORTS.get(metaKey);if(existingMeta){const m=await existingMeta.json();return json({ok:true,deduplicated:true,...m},200,ch);}
  const stored={schemaVersion:'FLR_REMOTE_BUG_REPORT_0.1',reportId,createdAt:new Date().toISOString(),build:p.build,step:p.step,category:p.category,priority:p.priority,description:p.description,summary:p.summary,debug:p.debug,client:p.client||null};
  await env.BUG_REPORTS.put(key,JSON.stringify(stored),{httpMetadata:{contentType:'application/json'}});
  const publicUrl=`${u.origin}/${key}`,short=String(p.description).replace(/\s+/g,' ').slice(0,72),title=`[${p.build||'FLR'}][P${p.priority||3}][${p.category||'기타'}] ${short}`,choice=p.summary?.c||[null,null],minute=Number.isFinite(p.summary?.s?.[0])?Math.floor(p.summary.s[0]/60)+1:'?';
  const body=`### 사용자 설명\n${p.description}\n\n### 자동 첨부\n- Report ID: \`${reportId}\`\n- 버전: ${p.build||'-'}\n- 경기 시각: ${minute}분\n- 분류: ${p.category||'-'}\n- 중요도: P${p.priority||3}\n- 선택: ${choice[0]||'-'} → ${choice[1]||'-'}\n- 전체 장면 JSON: ${publicUrl}\n\n> JSON은 사용자가 등록 버튼을 누른 시점에만 생성되며, Issue 생성 실패 시 자동 삭제됩니다.`;
  let issue;try{issue=await githubIssue(env,title,body)}catch(e){await env.BUG_REPORTS.delete(key);return json({ok:false,error:String(e.message||e)},502,ch)}
  const meta={reportId,issueNumber:issue.number,issueUrl:issue.html_url,jsonUrl:publicUrl};try{await env.BUG_REPORTS.put(metaKey,JSON.stringify(meta),{httpMetadata:{contentType:'application/json'}})}catch(_e){}
  return json({ok:true,...meta},201,ch);
}}};
