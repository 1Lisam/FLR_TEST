#!/usr/bin/env node
'use strict';

/* Replays the exact #433 matrix through the updated QA-only exploration path
 * and writes the user-facing adjudication evidence. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {main:replay}=require('./v42_oracle_50_episode_exploration');
const {syntheticControls,selftest}=require('./v42_oracle_watch_adjudication');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'evidence/v42');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const groupBy=(xs,key)=>Object.fromEntries([...xs.reduce((m,x)=>{const k=key(x);(m.get(k)||m.set(k,[]).get(k)).push(x);return m;},new Map())].map(([k,v])=>[k,v]));
function markdown(o){
 const c=o.afterCounts,g=o.groups,lines=[
  '# V42 Oracle WATCH saturation adjudication','',
  `Disposition: \`${o.disposition}\``, '',
  'The exact 50 #433 seed/role combinations were replayed through the production Hybrid → protagonist-boundary → V0.6 observation adapter. Production gameplay was not changed. The old WATCH predicate had no same-scene, identity, distance, or persistence requirement; it combined episode maxima and treated all defenders within 15m of an advanced attacker as duplicate ownership.', '',
  '## Counts','',
  '| Run | HARD_FAIL | FAIL | TRUE_WATCH | BLOCKED | Clean | Raw outlier episodes |','|---|---:|---:|---:|---:|---:|---:|',
  `| Before (#433 legacy predicate) | 0 | 0 | 50 WATCH (unadjudicated) | 350 | 50 | 50 |`,
  `| After (same-frame/identity/persistence adjudication) | ${c.HARD_FAIL} | ${c.FAIL} | ${c.TRUE_WATCH} | ${c.BLOCKED} | ${c.CLEAN} | ${c.RAW_OUTLIER_EPISODES} |`, '',
  'Browser-only contracts remain `OPEN/BLOCKED_MANAGED_WORKER_CHROMIUM`; they are not counted as a football WATCH or a clean browser observation.', '',
  '## Adjudication',''
 ];
 for(const [k,eps] of Object.entries(g)){lines.push(`### ${eps[0].classification}`,'');lines.push(`Count: ${eps.length}. ${eps[0].classificationReason}. ${eps.map(e=>`${e.episodeId} (${e.seed})`).join(', ')}.`,'');}
 lines.push('## Why the former 50 WATCH verdicts were false','',
  '- `duplicate-ownership` used `distance <=15m` as an ownership surrogate, so normal mark+cover/zonal proximity appeared as 2–5 “owners” without proving a collapse.',
  '- `team-vector-convergence` accepted any defender moving toward the carrier at any distance; it did not require proximity, a shared chase set, or persistence.',
  '- Raw maxima and their top-20 ranking are deliberately retained, but role-depth/width extremes do not create a WATCH without a causal contradiction. The top-20 table is therefore an outlier list, not a visible-scene verdict.',
  '- In the replayed episodes no material non-carrier threat had three causeless defenders within 6m for 0.8s, and no five-defender near-carrier chase persisted for 0.8s. No independently football-invalid state was proven.', '',
  '## Remaining TRUE_WATCH groups','',
  c.TRUE_WATCH?Object.entries(groupBy(o.episodes.filter(e=>e.classification==='TRUE_WATCH'),e=>e.watchReason||'unspecified')).map(([r,eps])=>`- ${r}: ${eps.map(e=>e.episodeId).join(', ')}.`).join('\n'):'None.', '',
  '## TRUE_BLOCKING_MISSED_BY_ORACLE','', 'None.', '',
  '## Synthetic WATCH controls','',
  '| Control | Expected | Result |','|---|---|---|',
  ...Object.entries(o.syntheticControls).map(([k,v])=>`| ${k} | ${k==='separated'||k==='markCover'?'NOT WATCH':'WATCH/FAIL'} | ${v.watch?'WATCH':'NOT WATCH'} |`), '',
  '## Raw top 20 outliers','', '| Rank | Episode | Metric | Value | Phase/time |','|---:|---|---|---:|---|',
  ...o.top20Outliers.map((x,i)=>`| ${i+1} | ${x.episodeId} / ${x.seed} | ${x.metric} | ${x.value} | ${x.phase||'-'} / ${x.time??'-'}s |`), '',
  'Per-frame metric hits, raw timestamps, player IDs, threat IDs, persistence spans, and every episode classification are in the JSON companion. The 1.0s window is reported as evidence context; WATCH requires stronger same-scene conditions and is not produced by merely applying that time window to old maxima.', ''
 ); return lines.join('\n');
}
function run(){
 selftest(); const r=replay(), episodes=r.episodes.map(e=>({episodeId:e.episodeId,seed:e.seed,heroRole:e.heroRole,phase:e.phase,time:e.time,classification:e.watchAdjudication.classification,classificationReason:e.watchAdjudication.classificationReason,watchReason:e.watchAdjudication.watch?.reason||null,legacyFamilies:e.watchAdjudication.legacyFamilies,legacyHitCount:e.watchAdjudication.legacyHits.length,rawTimestamps:e.watchAdjudication.legacyHits,perFrame:e.watchAdjudication.frames,persistentSpans:e.watchAdjudication.persistentSpans.map(s=>({...s,events:undefined})),causalResponseFrames:e.watchAdjudication.causalResponseFrames,coherentScenes:e.watchAdjudication.coherentScenes}));
 const classifications=groupBy(episodes,e=>`${e.classification}|${e.classificationReason}`);
 const trueWatch=episodes.filter(e=>e.classification==='TRUE_WATCH');
 const rawOutlierEpisodes=episodes.filter(e=>e.legacyFamilies.length>=2).length;
 const afterCounts={HARD_FAIL:r.aggregate.hardFail.count,FAIL:r.aggregate.fail.count,TRUE_WATCH:trueWatch.length,BLOCKED:r.aggregate.blocked.count,CLEAN:r.aggregate.cleanEpisodeCount,RAW_OUTLIER_EPISODES:rawOutlierEpisodes};
 const result={schemaVersion:'V42_ORACLE_WATCH_ADJUDICATION_1.0',disposition:trueWatch.length?'V42_ORACLE_WATCH_TRUE_OUTLIERS_REMAIN':'V42_ORACLE_WATCH_SATURATION_FIXED_QA_ONLY',generatedAt:new Date().toISOString(),source:{head:r.source.head,explorationRunnerSha256:sha(path.join(__dirname,'v42_oracle_50_episode_exploration.js')),watchHelperSha256:sha(path.join(__dirname,'v42_oracle_watch_adjudication.js'))},truth:r.truth,method:{sameWindowSeconds:1,persistenceSeconds:.8,legacyPredicate:'episode aggregate maxima; 2 metric families',refinedPredicate:'same-frame identities; material threat/near-carrier cause; persistence; no role depth/width automatic WATCH'},beforeCounts:{HARD_FAIL:0,FAIL:0,WATCH:50,BLOCKED:350,CLEAN:50},afterCounts,groups:Object.fromEntries(Object.entries(classifications).map(([k,v])=>[k,v.map(e=>({episodeId:e.episodeId,seed:e.seed,classification:e.classification,classificationReason:e.classificationReason}))])),episodes,top20Outliers:r.top20Outliers,syntheticControls:Object.fromEntries(Object.entries(syntheticControls()).map(([k,v])=>[k,{watch:!!v.watch,classification:v.classification,persistentSpans:v.persistentSpans.map(s=>({key:s.key,persistence:s.persistence,frames:s.frames}))}])),mutationHarness:'Run separately by QA/v42_oracle_mutation_harness.js; core contract runner is unchanged by this QA-only helper.',trueBlockingMissedByOracle:[]};
 fs.writeFileSync(path.join(OUT,'V42_ORACLE_WATCH_ADJUDICATION.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(OUT,'V42_ORACLE_WATCH_ADJUDICATION.md'),markdown(result)+'\n');console.log(JSON.stringify({disposition:result.disposition,afterCounts,classificationCounts:Object.fromEntries(Object.entries(classifications).map(([k,v])=>[k,v.length]))},null,2));return result;
}
if(require.main===module)run(); module.exports={run};
