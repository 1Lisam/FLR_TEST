(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_AERIAL_CONTEST=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='STEP39-AERIAL-CONTEST-0.1';
const val=(m,p,k)=>{const q=m?.playerAbilityProfiles?.[p?.id];return q&&Number.isFinite(q[k])?q[k]:60};
function score(m,p,side='NEUTRAL',distance=0,intended=false){if(!p)return-999;let s=val(m,p,'jumping')*.27+val(m,p,'heading')*.25+val(m,p,'strength')*.17+val(m,p,'anticipation')*.15+val(m,p,side==='DEF'?'defensive_positioning':'off_ball')*.11+val(m,p,'reaction')*.05;s-=distance*3.1;if(intended)s+=3.0;if(p.role==='CB')s+=side==='DEF'?2.4:1.0;if(p.role==='ST')s+=side==='ATK'?2.1:.3;return s;}
function resolve(m,{attacker,defender,attackerDistance=9,defenderDistance=9,intendedId=null,roll=0.5}){const a=attacker?score(m,attacker,'ATK',attackerDistance,attacker.id===intendedId):-999,d=defender?score(m,defender,'DEF',defenderDistance,false):-999;if(!attacker&&!defender)return{outcome:'LOOSE',attackerScore:a,defenderScore:d};if(attacker&&!defender)return{outcome:roll<.82?'ATK':'LOOSE',attackerScore:a,defenderScore:d};if(defender&&!attacker)return{outcome:roll<.88?'DEF':'LOOSE',attackerScore:a,defenderScore:d};const diff=a-d;let atkP=Math.max(.12,Math.min(.68,.34+diff/90)),defP=Math.max(.16,Math.min(.72,.43-diff/100));const total=atkP+defP;if(total>.88){const scale=.88/total;atkP*=scale;defP*=scale;}const outcome=roll<atkP?'ATK':roll<atkP+defP?'DEF':'LOOSE';return{outcome,attackerScore:Number(a.toFixed(2)),defenderScore:Number(d.toFixed(2)),atkP:Number(atkP.toFixed(3)),defP:Number(defP.toFixed(3))};}
return{VERSION,score,resolve};
});
