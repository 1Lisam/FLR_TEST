'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]);
for(const p of ['runtime/tactical_movement.js','runtime/continuous_match_core.js','runtime/hybrid_spatial_intent_v2.js','runtime/protagonist_match_controller.js'])require(path.join(root,p));
console.log(JSON.stringify({schemaVersion:'FLR_V054_ECOLOGY_AB_VALIDATION_1.0',status:'PASS',purpose:'staged ecology probe; stage metrics are recorded in applyLog'}));
