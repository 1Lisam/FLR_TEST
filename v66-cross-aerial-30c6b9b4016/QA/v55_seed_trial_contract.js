#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const ui=fs.readFileSync(path.join(__dirname,'..','step71_hybrid_v06_ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert(ui.includes("function seed(){return`LIVE-V03-${trial}-${$('heroPlayer').value}`}"),'SEED_FORMAT_DRIFT');
assert(ui.includes("$('heroReset').onclick=setup"),'SAME_SEED_RESET_DRIFT');
assert(ui.includes("$('heroNewSeed').onclick=()=>{trial++;setup()}"),'NEW_SEED_INCREMENT_DRIFT');
assert(ui.includes('let trial=1'),'RELOAD_TRIAL_ONE_DRIFT');
assert(html.includes('id="heroSeedInfo"'),'SEED_UI_MISSING');
assert(ui.includes('현재 SEED:'),'SEED_UI_NOT_UPDATED');
console.log(JSON.stringify({module:'V55_SEED_TRIAL_CONTRACT',verdict:'PASS',checks:{seedFormat:true,sameSeedPreservesTrial:true,newSeedIncrementsTrial:true,reloadStartsTrialOne:true,uiExplainsContract:true}},null,2));
