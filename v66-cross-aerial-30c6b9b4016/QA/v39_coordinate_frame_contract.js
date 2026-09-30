'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function run(){
  const fk=read('runtime/v39_free_kick_defensive_layers_patch.js'),corner=read('runtime/corner_templates.js'),channel=read('runtime/v39_free_kick_channel_owner_patch.js'),templates=read('runtime/free_kick_templates.js');
  const violations=[];
  if(/const q=laneBySlot\[p\.slot\][^;]*,w=world\(defTeam,/.test(fk))violations.push({id:'FK_CM_SECOND_BALL_WRONG_FRAME',file:'runtime/v39_free_kick_defensive_layers_patch.js'});
  if(!/restartXDefenderY\(r\.team,defTeam,q\.x,q\.y\)/.test(fk))violations.push({id:'FK_CM_SECOND_BALL_NOT_RESTART_FRAME',file:'runtime/v39_free_kick_defensive_layers_patch.js'});
  if(!/world\(defTeam,63,34\)/.test(fk))violations.push({id:'FK_ST_OUTLET_EXCEPTION_UNDOCUMENTED',file:'runtime/v39_free_kick_defensive_layers_patch.js'});
  for(const [id,source,needle] of [['CORNER_RESTART_HELPER',corner,'restartFrameWorld'],['FK_CHANNEL_RESTART_FRAME',channel,'world(m.restart.team'],['FK_TEMPLATE_RESTART_FRAME',templates,'world(team,spot.x,spot.y)']])if(!source.includes(needle))violations.push({id,file:'semantic frame contract'});
  const contracts=[
    {id:'SET_PIECE_BOX_MARK_CLEARANCE_RESTART_FRAME',ok:!violations.some(v=>v.id==='FK_CM_SECOND_BALL_WRONG_FRAME'),required:'Box/wall/mark/clearance targets use restart-team frame.'},
    {id:'DEFENDER_IDENTITY_NOT_FRAME_OWNER',ok:/restartXDefenderY\(r\.team,defTeam,q\.x,q\.y\)/.test(fk),required:'Defender identity must not select longitudinal frame.'},
    {id:'DEFENDER_ATTACK_LOCAL_OUTLET_EXPLICIT',ok:/defender attack-local escape slot/.test(fk)&&/world\(defTeam,63,34\)/.test(fk),required:'Only the explicit ST outlet uses defender frame.'}
  ];
  return{module:'V39_COORDINATE_FRAME_CONTRACT',verdict:violations.length?'BLOCKED':'PASS',violations,contracts,rationale:'Semantic responsibility owns the frame: restart-relative set-piece danger uses restart team; genuine defender transition outlets use defender frame.'};
}
if(require.main===module){const out=run();console.log(JSON.stringify(out,null,2));if(out.verdict!=='PASS')process.exitCode=8;}
module.exports={run};
