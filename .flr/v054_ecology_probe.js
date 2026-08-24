'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]);
const E=require(path.join(root,'runtime/continuous_match_core.js'));
const seeds=['V054-SMOKE-02','DEV-RECENT-1787573272419-1'];
const rows=seeds.map(seed=>{const r=E.runToEnd(seed,{dt:.05}),s=r.snapshot;return{seed,score:s.score,shots:s.stats.shots,passes:s.stats.passes,offsides:s.stats.offsides,goals:s.stats.goals,completed:s.completed};});
console.log(JSON.stringify({schemaVersion:'FLR_V054_ECOLOGY_PROBE_1.0',rows}));
if(rows.some(r=>!r.completed))process.exitCode=1;
