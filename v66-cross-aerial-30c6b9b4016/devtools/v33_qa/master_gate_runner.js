'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const target=process.argv[2]; if(!target){console.error('usage: node master_gate_runner.js TARGET_ROOT');process.exit(2)}
const gateRoot=__dirname,temp=fs.mkdtempSync(path.join(os.tmpdir(),'flr-master-gate-'));fs.mkdirSync(path.join(temp,'qa'));
for(const rel of ['runtime','live_hybrid_session_v02.js']){const src=path.join(target,rel);if(fs.existsSync(src))fs.symlinkSync(src,path.join(temp,rel),'junction');}
const gates=[
 ['G1_USER_AUTHORITY','g1_choice_authority_gate.js','canonical'],
 ['G2_ENTRY_CONTINUITY','r20_entry_continuity_gate.js','canonical'],
 ['G3_ST_RUNNING_SHOT','g3_st_running_shot_gate.js','canonical'],
 ['G5_USER_CARRY','g5_r20_user_carry_continuity_gate.js','canonical'],
 ['G7_G8_DEFENSIVE_BEHAVIOR','g7_g8_r23_defence_gate.js','canonical'],
 ['G8_ACTUAL_BODY_LAYER','g8_severe_body_recovery_gate.js','canonical'],
 ['G10_R24_CORE6','g10_r24_core6_negative_gate.js','canonical'],
 ['G10_SEED_DIVERSITY','g10_seed_diversity_infra_gate.js','qa-infra']
];
const results=[];
for(const [id,file,kind] of gates){fs.copyFileSync(path.join(gateRoot,'qa',file),path.join(temp,'qa',file));const r=cp.spawnSync(process.execPath,[path.join(temp,'qa',file)],{encoding:'utf8',maxBuffer:4*1024*1024});let parsed=null;try{parsed=JSON.parse(r.stdout)}catch{}results.push({id,file,kind,pass:r.status===0,exitCode:r.status,output:parsed||r.stdout.trim(),stderr:r.stderr.trim()});}
const canonicalPass=results.filter(x=>x.kind==='canonical').every(x=>x.pass),qaInfraPass=results.filter(x=>x.kind==='qa-infra').every(x=>x.pass),releasePass=canonicalPass&&qaInfraPass;
console.log(JSON.stringify({schema:'FLR_MASTER_GATE_V1_1',target,canonicalPass,qaInfraPass,releasePass,policy:'Canonical failure rejects gameplay candidate. QA-infra failure is repaired without gameplay changes before release.',results},null,2));fs.rmSync(temp,{recursive:true,force:true});if(!canonicalPass)process.exit(1);
