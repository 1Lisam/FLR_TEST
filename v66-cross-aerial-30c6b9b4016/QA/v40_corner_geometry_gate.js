'use strict';

/* Corner geometry is evaluated in two causal phases.  DEAD setup travel is
 * allowed, but assigned setup targets must describe separate responsibilities;
 * live target/cluster detectors are evaluated only after the kick. */
const assert=require('assert');
const causal=require('./v39_causal_detector_overrides.js').DETECTORS;
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(num(a?.x)-num(b?.x),num(a?.y)-num(b?.y));
const isCornerFrame=f=>String(f?.ball?.kind||'').toUpperCase()==='CORNER'||String(f?.phase||'').toUpperCase().includes('CORNER');
const isDead=f=>String(f?.ball?.mode||'').toUpperCase()==='DEAD';

const TARGET_OBSERVABLES=Object.freeze({
  SETUP_RESPONSIBILITY_GEOMETRY:{phase:'SETUP_DEAD',detector:'CORNER_SETUP_RESPONSIBILITY_GEOMETRY'},
  LIVE_TARGET_CONVERGENCE:{phase:'LIVE',detector:'SET_PIECE_TARGET_CONVERGENCE'},
  LIVE_ACTUAL_CLUSTER:{phase:'LIVE',detector:'SET_PIECE_ACTUAL_CLUSTER'}
});

// Validator-side mapping only.  It does not contain or derive human oracle
// judgments; the completed #292 session remains frozen and unscored.
const CASE_TARGETS=Object.freeze({
  'CORNER_ATTACK_RIGHT|FINAL-MATCH-TEST-13':['SETUP_RESPONSIBILITY_GEOMETRY','LIVE_TARGET_CONVERGENCE','LIVE_ACTUAL_CLUSTER'],
  'CORNER_ATTACK_LEFT|FINAL-MATCH-TEST-4':['SETUP_RESPONSIBILITY_GEOMETRY','LIVE_TARGET_CONVERGENCE','LIVE_ACTUAL_CLUSTER'],
  'CORNER_DEFEND_LEFT|FINAL-MATCH-TEST-15':['SETUP_RESPONSIBILITY_GEOMETRY','LIVE_TARGET_CONVERGENCE','LIVE_ACTUAL_CLUSTER'],
  'CORNER_ATTACK_RIGHT|FINAL-MATCH-TEST-8':['SETUP_RESPONSIBILITY_GEOMETRY','LIVE_TARGET_CONVERGENCE','LIVE_ACTUAL_CLUSTER'],
  'CORNER_DEFEND_RIGHT|FINAL-MATCH-TEST-6':['SETUP_RESPONSIBILITY_GEOMETRY','LIVE_TARGET_CONVERGENCE','LIVE_ACTUAL_CLUSTER'],
  'CORNER_ATTACK_LEFT|FINAL-MATCH-TEST-1':['SETUP_RESPONSIBILITY_GEOMETRY','LIVE_TARGET_CONVERGENCE','LIVE_ACTUAL_CLUSTER']
});

function setupGeometry(r){
  for(const f of r.frames||[]){
    if(!isCornerFrame(f)||!isDead(f))continue;
    const all=(f.players||[]).filter(p=>p.role!=='GK');
    const ps=all.filter(p=>/^CORNER_/.test(task(p)));
    const missing=all.filter(p=>!/^CORNER_/.test(task(p))||!Number.isFinite(Number(p.tx))||!Number.isFinite(Number(p.ty)));
    if(missing.length)return{detected:true,phase:'SETUP_DEAD',reason:'MISSING_ROLE_OWNER',players:missing.map(p=>p.id)};
    const groups=new Map();
    for(const p of ps){if(!/CORNER_(ZONE_HOLD|CLEARANCE_EDGE_HOLD|REST_DEFENCE.*HOLD)/.test(task(p)))continue;const k=`${Math.round(num(p.tx)*2)/2},${Math.round(num(p.ty)*2)/2}`;(groups.get(k)||groups.set(k,[]).get(k)).push(p);}
    for(const [target,g] of groups){if(g.length>=2)return{detected:true,phase:'SETUP_DEAD',reason:'DUPLICATE_SETUP_RESPONSIBILITY',target,count:g.length,players:g.map(p=>p.id)};}
    const passive=ps.filter(p=>/ZONE_HOLD|CLEARANCE_EDGE_HOLD|REST_DEFENCE.*HOLD/.test(task(p)));
    for(let i=0;i<passive.length;i++)for(let j=i+1;j<passive.length;j++){
      // Physical proximity during travel is valid. This is target spacing,
      // not player spacing, and only applies to unrelated passive roles.
      const targetDistance=dist({x:passive[i].tx,y:passive[i].ty},{x:passive[j].tx,y:passive[j].ty});
      if(targetDistance<3)return{detected:true,phase:'SETUP_DEAD',reason:'COLLAPSED_ZONE_HOLD_SPACING',players:[passive[i].id,passive[j].id],targetDistance:+targetDistance.toFixed(3)};
    }
  }
  return{detected:false,phase:'SETUP_DEAD'};
}

function detectorFor(id){return id==='SETUP_RESPONSIBILITY_GEOMETRY'?setupGeometry:causal[TARGET_OBSERVABLES[id]?.detector];}
function coverageFor(scenario,seed){const ids=CASE_TARGETS[`${scenario}|${seed}`];if(!ids)return{status:'QA_INFRA_BLOCKED',missing:['CASE_MAPPING']};return{status:ids.every(id=>TARGET_OBSERVABLES[id]&&typeof detectorFor(id)==='function')?'COVERED':'QA_INFRA_BLOCKED',missing:ids.filter(id=>!TARGET_OBSERVABLES[id]||typeof detectorFor(id)!=='function'),observables:ids};}
function runCase(scenario,seed,r){const coverage=coverageFor(scenario,seed);if(coverage.status!=='COVERED')return{verdict:'QA_INFRA_BLOCKED',coverage};const results={};for(const id of coverage.observables){const d=detectorFor(id),raw=d(r);results[id]=raw&&Object.prototype.hasOwnProperty.call(raw,'detected')?raw:{detected:false};}return{verdict:Object.values(results).every(x=>!x.detected)?'PASS':'RED',coverage,results};}

function fixtures(){
  const f=(mode,players)=>({phase:'CORNER_SETUP',ball:{kind:'CORNER',mode},players});
  const p=(id,taskName,tx,ty,extra={})=>({id,role:'CB',tacticalTask:taskName,tx,ty,x:tx,y:ty,...extra});
  return{
    duplicate:{frames:[f('DEAD',[p('a','CORNER_ZONE_HOLD',94,34),p('b','CORNER_ZONE_HOLD',94,34),p('c','CORNER_ZONE_HOLD',94,34)])]},
    spacing:{frames:[f('DEAD',[p('a','CORNER_ZONE_HOLD',94,34),p('b','CORNER_ZONE_HOLD',95,34),p('c','CORNER_CLEARANCE_EDGE_HOLD',90,40)])]},
    missing:{frames:[f('DEAD',[p('a','CORNER_ZONE_HOLD',94,34),p('b','CORNER_ZONE_HOLD',undefined,undefined)])]},
    wrongPhase:{frames:[f('LOOSE',[p('a','CORNER_ZONE_HOLD',94,34),p('b','CORNER_ZONE_HOLD',94,34),p('c','CORNER_ZONE_HOLD',94,34)])]}
  };
}
function selftest(){const x=fixtures();assert(setupGeometry(x.duplicate).detected);assert(setupGeometry(x.spacing).detected);assert(setupGeometry(x.missing).detected);assert(!setupGeometry(x.wrongPhase).detected);assert.equal(coverageFor('CORNER_ATTACK_RIGHT','UNKNOWN').status,'QA_INFRA_BLOCKED');return{module:'V40_CORNER_GEOMETRY_GATE',selftest:'PASS',mutationFixtures:['duplicate corner target','collapsed ZONE_HOLD spacing','missing role owner','wrong phase detector binding'],caseCount:Object.keys(CASE_TARGETS).length};}
if(require.main===module)console.log(JSON.stringify(selftest(),null,2));
module.exports={TARGET_OBSERVABLES,CASE_TARGETS,setupGeometry,coverageFor,runCase,fixtures,selftest};
