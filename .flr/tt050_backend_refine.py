#!/usr/bin/env python3
import re,sys
from pathlib import Path
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

worker="""const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}});
function cors(origin,env){const allowed=(env.ALLOWED_ORIGIN||'https://1lisam.github.io').split(',').map(x=>x.trim());return allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'}:{};}
function validId(v){return typeof v==='string'&&/^[a-zA-Z0-9-]{12,80}$/.test(v)}
export default {async fetch(request,env){const u=new URL(request.url),origin=request.headers.get('origin')||'',ch=cors(origin,env);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:ch});
  if(request.method==='GET'&&u.pathname.startsWith('/reports/')){const key=u.pathname.slice(1),obj=await env.BUG_REPORTS.get(key);if(!obj)return new Response('Not found',{status:404});return new Response(obj.body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=31536000, immutable','content-disposition':`inline; filename="${key.split('/').at(-1)||'FLR_BUG_REPORT.json'}"`}});}
  if(request.method!=='POST'||u.pathname!=='/report')return json({ok:false,error:'not found'},404,ch);
  if(!ch['access-control-allow-origin'])return json({ok:false,error:'origin not allowed'},403,ch);
  const len=Number(request.headers.get('content-length')||0);if(len>8_000_000)return json({ok:false,error:'report too large'},413,ch);
  let p;try{p=await request.json()}catch{return json({ok:false,error:'invalid json'},400,ch)}
  if(!validId(p.reportId)||!p.debug||typeof p.description!=='string'||!p.description.trim())return json({ok:false,error:'invalid report'},400,ch);
  const reportId=p.reportId,build=String(p.build||'UNKNOWN').replace(/[^A-Za-z0-9._-]+/g,'_'),key=`reports/${build}/${reportId}.json`,metaKey=`meta/${reportId}.json`,raw=JSON.stringify(p.debug),sizeBytes=new TextEncoder().encode(raw).byteLength;
  if(sizeBytes>7_500_000)return json({ok:false,error:'debug json too large',sizeBytes},413,ch);
  const existing=await env.BUG_REPORTS.get(metaKey);if(existing){const meta=await existing.json();return json({ok:true,deduplicated:true,...meta},200,ch);}
  await env.BUG_REPORTS.put(key,raw,{httpMetadata:{contentType:'application/json'},customMetadata:{reportId,build,sizeBytes:String(sizeBytes)}});
  const publicUrl=`${u.origin}/${key}`,meta={reportId,jsonUrl:publicUrl,sizeBytes,build,createdAt:new Date().toISOString()};await env.BUG_REPORTS.put(metaKey,JSON.stringify(meta),{httpMetadata:{contentType:'application/json'}});
  return json({ok:true,...meta},201,ch);
}}};
"""
(ROOT/'bug-report-worker/worker.js').write_text(worker,encoding='utf-8')

p=ROOT/'step71_hybrid_v06_ui.js';t=p.read_text(encoding='utf-8')
old=r"if\(endpoint\)\{const rid=.*?closeBugModal\(\);return;\}"
new="""if(endpoint){const rid=`tt050-${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}`,payload={reportId:rid,build:'TT-0.50',step:78,category:cat,priority:Number(prio),description:desc,summary:snap,debug:d,client:{userAgent:navigator.userAgent,href:location.href}},r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok||!j.jsonUrl)throw new Error(j.error||`HTTP ${r.status}`);const sec=snap?.s?.[0],minute=Number.isFinite(sec)?Math.floor(sec/60)+1:'?',choiceId=snap?.c?.[0]||'-',targetId=snap?.c?.[1]||'-',short=desc.replace(/\\s+/g,' ').slice(0,64),title=`[TT-0.50][P${prio}][${cat}] ${short}`,body=`### 사용자 설명\\n${desc}\\n\\n### 자동 첨부\\n- 버전: TT-0.50 USER_VISUAL_RETEST\\n- 경기 시각: ${minute}분\\n- 분류: ${cat}\\n- 중요도: P${prio}\\n- 선택: ${choiceId} → ${targetId}\\n- **전체 통합 JSON 원본:** ${j.jsonUrl}\\n- JSON 크기: ${(Number(j.sizeBytes||0)/1024).toFixed(1)} KiB\\n\\n> 위 링크는 개발자 메뉴의 '전체 JSON 저장'으로 내려받는 통합 디버그 객체와 같은 원본 JSON입니다.`,u=`https://github.com/1Lisam/FLR_TEST/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;if(popup)popup.location.href=u;else window.open(u,'_blank','noopener');closeBugModal();return;}"""
t2,n=re.subn(old,new,t,count=1,flags=re.S)
if n!=1: raise SystemExit(f'TT050_BACKEND_UI_REPLACE expected=1 actual={n}')
p.write_text(t2,encoding='utf-8')
print('TT050_BACKEND_REFINE_OK')
