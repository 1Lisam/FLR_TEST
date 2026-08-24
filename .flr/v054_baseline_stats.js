'use strict';
const path=require('path');const root=path.resolve(process.argv[2]||'.');const E=require(path.join(root,'runtime/continuous_match_core.js'));
const seeds=['V054-SMOKE-01','V054-SMOKE-02','DEV-RECENT-1787573272419-1','DEV-RECENT-1787575663982-11'];
const rows=seeds.map(seed=>{const r=E.runToEnd(seed,{dt:.05}),s=r.snapshot;return{seed,score:s.score,shots:s.stats.shots,passes:s.stats.passes,offsides:s.stats.offsides,goals:s.stats.goals,completed:s.completed};});
console.log(JSON.stringify({schemaVersion:'FLR_V054_BASELINE_STATS_1.0',rows},null,2));
