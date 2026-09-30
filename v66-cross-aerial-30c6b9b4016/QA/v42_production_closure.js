#!/usr/bin/env node
'use strict';

/* QA-only.  The production identity is the ordered bytes reachable from the
 * actual index.html, never the mutable repository HEAD. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),child=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function gitBlob(commit,file){const r=child.spawnSync('git',['show',`${commit}:${file}`],{cwd:ROOT,encoding:null});if(r.status!==0)throw Error(`missing ${commit}:${file}`);return r.stdout;}
function parse(html){
  const text=html.toString('utf8');
  const css=[...text.matchAll(/<link\b[^>]*\brel=["'][^"']*\bstylesheet\b[^"']*["'][^>]*\bhref=["']([^"']+)["']/gi),...text.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*\bstylesheet\b[^"']*["']/gi)].map(m=>m[1]);
  const js=[...text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]);
  return {css,js};
}
function closure(commit=null){
  const get=file=>commit?gitBlob(commit,file):fs.readFileSync(path.join(ROOT,file));
  const html=get('index.html'), parsed=parse(html);
  const specs=[['index.html','HTML'],...parsed.css.map(x=>[x,'CSS']),...parsed.js.map(x=>[x,'JS'])];
  const files=specs.map(([file,kind],i)=>{const b=get(file);return{order:i+1,path:file,kind,bytes:b.length,sha256:sha(b),required:true,load:'static'};});
  const canonical=JSON.stringify(files.map(({path,kind,bytes,sha256,required,load})=>({path,kind,bytes,sha256,required,load})));
  const inlineStyle=(html.toString('utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/i)||['',''])[1];
  return{schemaVersion:'V42_FINAL_VISIBLE_CLOSURE_2.0',sourceHead:commit,entry:'index.html',counts:{total:files.length,HTML:files.filter(x=>x.kind==='HTML').length,CSS:files.filter(x=>x.kind==='CSS').length,JS:files.filter(x=>x.kind==='JS').length,assets:0,dynamic:0},inline:{styleBytes:Buffer.byteLength(inlineStyle),scriptBytes:0,notes:'Inline style markup is represented by index.html bytes.'},dynamicDependencies:[],files,closureFingerprint:sha(Buffer.from(canonical)),canonicalFields:['path','kind','bytes','sha256','required','load']};
}
function compare(a,b){const am=new Map(a.files.map(x=>[x.path,x])),bm=new Map(b.files.map(x=>[x.path,x]));const paths=[...new Set([...am.keys(),...bm.keys()])];return{equal:a.closureFingerprint===b.closureFingerprint&&paths.length===a.files.length&&paths.length===b.files.length&&paths.every(p=>am.get(p)?.sha256===bm.get(p)?.sha256),mismatches:paths.filter(p=>am.get(p)?.sha256!==bm.get(p)?.sha256).map(p=>({path:p,a:am.get(p)?.sha256||null,b:bm.get(p)?.sha256||null})),omissions:paths.filter(p=>!am.has(p)||!bm.has(p))};}
if(require.main===module){let commits=process.argv.slice(2);if(!commits.length)commits=[null];const out=commits.map(c=>closure(c));console.log(JSON.stringify({closures:out,comparisons:out.slice(1).map(x=>compare(out[0],x))},null,2));}
module.exports={closure,compare};
