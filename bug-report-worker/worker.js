const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}});
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
}};
