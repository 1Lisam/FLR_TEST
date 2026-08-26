const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.argv[1];
function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
function need(cond,msg){if(!cond){console.error(msg);process.exit(2)}}
const index=read('index.html');
const ui=read('step71_hybrid_v06_ui.js');
const core=read('runtime/continuous_match_core.js');
const def=read('runtime/defensive_responsibility_core.js');
need(index.includes('V0.5.4 R26 TEST'),'R26_INDEX_MARKER_MISSING');
need(ui.includes('USER-MATCH-TEST-V0.5.4-R26'),'R26_REPORT_BUILD_MISSING');
need(ui.includes('umt054r26'),'R26_REPORT_PREFIX_MISSING');
need(core.includes('pendingCompressedDeadClock'),'R26_GOAL_DEADCLOCK_MARKER_MISSING');
need(def.includes('sideCM'),'R26_SIDE_CM_HANDOFF_MISSING');
need(!core.includes("kind:'KICKOFF,team"),'R26_CORRUPT_KICKOFF_LITERAL');
need(!def.includes('sideWf*&'),'R26_CORRUPT_SIDEWF_OPERATOR');
console.log(JSON.stringify({status:'PASS',build:'R26',markers:true}));
