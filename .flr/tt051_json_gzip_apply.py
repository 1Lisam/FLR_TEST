#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])
p=root/'bug-report-worker/worker.js'
s=p.read_text(encoding='utf-8')
needle="function chunkUtf8(text,maxBytes=1500000){const out=[];let pos=0;while(pos<text.length){let lo=1,hi=Math.min(text.length-pos,maxBytes),best=1;while(lo<=hi){const mid=(lo+hi)>>1,n=utf8Size(text.slice(pos,pos+mid));if(n<=maxBytes){best=mid;lo=mid+1}else hi=mid-1;}let end=pos+best;if(end<text.length){const c=text.charCodeAt(end-1);if(c>=0xD800&&c<=0xDBFF)end--;}if(end<=pos)throw new Error('D1_CHUNK_SPLIT_FAILED');out.push(text.slice(pos,end));pos=end;}return out;}\n"
insert=needle+"function bytesToBase64(bytes){let out='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+step)));return btoa(out);}\nfunction base64ToBytes(text){const bin=atob(text),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}\nasync function encodeStoredDebug(raw){if(!raw)return'';const source=new Response(enc.encode(raw)).body,buf=await new Response(source.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();return'gz64:'+bytesToBase64(new Uint8Array(buf));}\nasync function decodeStoredDebug(stored){if(!stored.startsWith('gz64:'))return stored;const bytes=base64ToBytes(stored.slice(5)),source=new Response(bytes).body;return await new Response(source.pipeThrough(new DecompressionStream('gzip'))).text();}\n"
if needle not in s: raise SystemExit('chunk helper anchor missing')
s=s.replace(needle,insert,1)
old="async function getDebug(db,reportId){const meta=await getMeta(db,reportId);if(!meta)return null;const count=Number(meta.chunk_count)||0;if(count===0)return{meta,debug:null};const rows=(await db.prepare('SELECT chunk_no,data FROM bug_report_chunks WHERE report_id=? ORDER BY chunk_no').bind(reportId).all()).results||[];if(rows.length!==count)throw new Error('D1_REPORT_CHUNK_COUNT_MISMATCH');return{meta,debug:JSON.parse(rows.map(r=>r.data).join(''))};}"
new="async function getDebug(db,reportId){const meta=await getMeta(db,reportId);if(!meta)return null;const count=Number(meta.chunk_count)||0;if(count===0)return{meta,debug:null};const rows=(await db.prepare('SELECT chunk_no,data FROM bug_report_chunks WHERE report_id=? ORDER BY chunk_no').bind(reportId).all()).results||[];if(rows.length!==count)throw new Error('D1_REPORT_CHUNK_COUNT_MISMATCH');const stored=rows.map(r=>r.data).join(''),raw=await decodeStoredDebug(stored);return{meta,debug:JSON.parse(raw)};}"
if old not in s: raise SystemExit('getDebug anchor missing')
s=s.replace(old,new,1)
old2="const chunks=hasDebug?chunkUtf8(raw):[],createdAt=new Date().toISOString(),category=cleanText(p.category,80),priority=Math.max(1,Math.min(5,Number(p.priority)||3)),description=String(p.description).trim().slice(0,4000),summaryJson=JSON.stringify(p.summary||null),schemaVersion=hasDebug?(cleanText(p.debug?.schemaVersion,80)||null):null;"
new2="const stored=hasDebug?await encodeStoredDebug(raw):'',chunks=hasDebug?chunkUtf8(stored):[],storedBytes=hasDebug?utf8Size(stored):0,createdAt=new Date().toISOString(),category=cleanText(p.category,80),priority=Math.max(1,Math.min(5,Number(p.priority)||3)),description=String(p.description).trim().slice(0,4000),summaryJson=JSON.stringify(p.summary||null),schemaVersion=hasDebug?(cleanText(p.debug?.schemaVersion,80)||null):null;"
if old2 not in s: raise SystemExit('chunks anchor missing')
s=s.replace(old2,new2,1)
old3="const jsonUrl=hasDebug?`${u.origin}/reports/${build}/${reportId}.json`:null,reportUrl=`${u.origin}/report-meta/${reportId}`,baseMeta={reportId,jsonUrl,reportUrl,sizeBytes,build,createdAt,category,priority,description,summary:p.summary||null,storage:'D1',chunkCount:chunks.length,hasDebug};"
new3="const jsonUrl=hasDebug?`${u.origin}/reports/${build}/${reportId}.json`:null,reportUrl=`${u.origin}/report-meta/${reportId}`,baseMeta={reportId,jsonUrl,reportUrl,sizeBytes,storedBytes,storageEncoding:hasDebug?'gzip-base64-v1':null,build,createdAt,category,priority,description,summary:p.summary||null,storage:'D1',chunkCount:chunks.length,hasDebug};"
if old3 not in s: raise SystemExit('baseMeta anchor missing')
s=s.replace(old3,new3,1)
p.write_text(s,encoding='utf-8')
print('TT-0.51 gzip D1 storage patch applied')
