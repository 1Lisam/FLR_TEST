(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_ATTRIBUTE_MATCH_ADAPTER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const VERSION='STEP38-ATTRIBUTE-MATCH-ADAPTER-0.1';
const CORE_ATTRIBUTES=[
  'pace','acceleration','reaction','balance','stamina','strength','jumping','agility',
  'finishing','long_shots','heading','flair','dribbling','off_ball',
  'vision','short_pass','long_pass','crossing','ball_control',
  'defensive_positioning','anticipation','tackling','one_v_one_marking',
  'diving','gk_positioning','aerial','handling'
];
const DEFAULT=60;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function baseProfile(value=DEFAULT){const o={};for(const k of CORE_ATTRIBUTES)o[k]=clamp(Math.round(value),1,100);return o;}
function validateProfile(p){return !!p&&CORE_ATTRIBUTES.every(k=>Number.isFinite(p[k])&&p[k]>=1&&p[k]<=100)&&Object.keys(p).filter(k=>CORE_ATTRIBUTES.includes(k)).length===27;}
function withOverrides(base,overrides={}){const out={...base};for(const [k,v] of Object.entries(overrides)){if(CORE_ATTRIBUTES.includes(k))out[k]=clamp(Math.round(v),1,100);}if(!validateProfile(out))throw new Error('Invalid 27-attribute profile');return out;}
function assign(m,playerId,profile){if(!validateProfile(profile))throw new Error('Invalid ability profile');m.playerAbilityProfiles=m.playerAbilityProfiles||{};m.playerAbilityProfiles[playerId]={...profile};return m.playerAbilityProfiles[playerId];}
function get(m,playerId){return m?.playerAbilityProfiles?.[playerId]||baseProfile(DEFAULT);}
function weighted(m,playerId,weights){const p=get(m,playerId);let sum=0,w=0;for(const [k,ww] of Object.entries(weights)){sum+=(p[k]??DEFAULT)*ww;w+=ww;}return w?sum/w:DEFAULT;}
function relevant(action){switch(String(action||'').toUpperCase()){
  case'SHOT':return['finishing','reaction','balance','ball_control'];
  case'LONG_SHOT':return['long_shots','reaction','balance','ball_control'];
  case'PASS':return['short_pass','vision','ball_control','reaction'];
  case'THROUGH':return['vision','short_pass','long_pass','ball_control','reaction'];
  case'LONG_DISTRIBUTION':return['long_pass','vision','ball_control'];
  case'SHORT_DISTRIBUTION':return['short_pass','vision','ball_control'];
  case'CARRY':case'DRIBBLE':return['dribbling','ball_control','agility','acceleration','balance'];
  case'TACKLE':return['tackling','anticipation','defensive_positioning','reaction','agility'];
  case'DELAY':case'BLOCK_LANE':return['defensive_positioning','anticipation','reaction','one_v_one_marking'];
  default:return[];
}}
function composite(m,playerId,action){switch(String(action||'').toUpperCase()){
  case'SHOT':return weighted(m,playerId,{finishing:.45,reaction:.18,balance:.12,ball_control:.15,agility:.10});
  case'LONG_SHOT':return weighted(m,playerId,{long_shots:.48,reaction:.16,balance:.12,ball_control:.14,finishing:.10});
  case'PASS':return weighted(m,playerId,{short_pass:.48,vision:.22,ball_control:.16,reaction:.09,balance:.05});
  case'THROUGH':return weighted(m,playerId,{vision:.34,short_pass:.26,long_pass:.18,ball_control:.14,reaction:.08});
  case'LONG_DISTRIBUTION':return weighted(m,playerId,{long_pass:.48,vision:.22,ball_control:.16,reaction:.08,balance:.06});
  case'SHORT_DISTRIBUTION':return weighted(m,playerId,{short_pass:.50,vision:.20,ball_control:.18,reaction:.07,balance:.05});
  case'CARRY':case'DRIBBLE':return weighted(m,playerId,{dribbling:.34,ball_control:.25,agility:.17,acceleration:.12,balance:.12});
  case'TACKLE':return weighted(m,playerId,{tackling:.42,anticipation:.22,defensive_positioning:.18,reaction:.10,agility:.08});
  case'DELAY':case'BLOCK_LANE':return weighted(m,playerId,{defensive_positioning:.36,anticipation:.30,reaction:.16,one_v_one_marking:.12,agility:.06});
  default:return DEFAULT;
}}
function testProfiles(role){
  const low=baseProfile(58),base=baseProfile(60),high=baseProfile(62);
  const map={
    ST:{low:{finishing:35,reaction:45,balance:48,ball_control:45,dribbling:42,agility:48,acceleration:52,short_pass:45,vision:45},high:{finishing:86,reaction:82,balance:78,ball_control:82,dribbling:84,agility:82,acceleration:84,short_pass:78,vision:76}},
    CM:{low:{long_shots:35,short_pass:42,long_pass:43,vision:40,ball_control:45,reaction:46,dribbling:43,agility:48},high:{long_shots:84,short_pass:86,long_pass:82,vision:88,ball_control:84,reaction:80,dribbling:78,agility:79}},
    CB:{low:{tackling:34,anticipation:40,defensive_positioning:42,reaction:44,one_v_one_marking:40,agility:46,strength:55},high:{tackling:88,anticipation:86,defensive_positioning:88,reaction:82,one_v_one_marking:87,agility:76,strength:82}},
    GK:{low:{short_pass:38,long_pass:36,vision:40,ball_control:42,reaction:48,handling:55,gk_positioning:55},high:{short_pass:78,long_pass:84,vision:77,ball_control:76,reaction:80,handling:84,gk_positioning:84}}
  }[role]||{low:{},high:{}};
  return{LOW:withOverrides(low,map.low),BASE:base,HIGH:withOverrides(high,map.high)};
}
return{VERSION,CORE_ATTRIBUTES,baseProfile,validateProfile,withOverrides,assign,get,relevant,composite,testProfiles};
});
