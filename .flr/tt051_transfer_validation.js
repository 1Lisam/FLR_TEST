#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(process.argv[2]||'.');
const expected={
  'CHANGELOG.md':'d2c0558072d994b9a7a105ef57cf64b64614c377bdaa8ee94c6edc9f1557d357',
  'index.html':'22ebc7fa862f478a5042bd3845d98602e8ed5c4ba71b41ff6c4ff6365f0bf87e',
  'live_hybrid_session_v02.js':'e1abd5bf72bd2fb1f0fe70a50e956cf9ea0c99f0c34d8625072d4b174221e6e4',
  'runtime/ball_strike_model.js':'0869abab667661d30957e2baf04487f4cdb22f4658eadb3b34389476f7097594',
  'runtime/continuous_match_core.js':'e8ab4c9dfcd0b11507d4dc6d540063df4f9132344fe4d809b0b279a824a2b239',
  'runtime/protagonist_match_controller.js':'ed355522fac60b96d0060d53f77b176ab431a2a8ed9b4262ca7352c7a1853e51',
  'runtime/tactical_movement.js':'8ed7b1ccd471e7fef04ee7556af438c24ca2519e1ebdd1c4a837f81c4a5a598b',
  'step71_hybrid_v06_ui.js':'da5d6a79a398dd60fbbde2232265440aa514512296bef3aa02a9c3dcbd3b4949'
};
const rows=[];let ok=true;
for(const [rel,want] of Object.entries(expected)){
  const p=path.join(root,rel),got=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),pass=got===want;
  rows.push({path:rel,status:pass?'PASS':'FAIL',sha256:got}); if(!pass) ok=false;
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'step71_hybrid_v06_ui.js'),'utf8');
const semantic=html.includes('TT-0.51')&&ui.includes("build:'TT-0.51'")&&ui.includes('j.jsonUrl')&&ui.includes('debug:d');
rows.push({path:'semantic-transfer-guard',status:semantic?'PASS':'FAIL'});ok=ok&&semantic;
console.log(JSON.stringify({schemaVersion:'FLR_TT051_TRANSFER_VALIDATION_1.0',version:'TT-0.51',status:ok?'PASS':'FAIL',checks:rows},null,2));
process.exit(ok?0:1);
