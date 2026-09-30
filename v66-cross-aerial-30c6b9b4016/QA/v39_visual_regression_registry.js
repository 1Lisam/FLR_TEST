'use strict';

/* V39 user-visual truth registry. USER_FAIL_OPEN always outranks internal PASS. */
const USER_PASS_CONTROLS=Object.freeze([
  {id:'V39-PASS-ST-BREAKAWAY-12',scenario:'ST_BREAKAWAY',seed:'FINAL-MATCH-TEST-12',status:'USER_PASS_CONTROL',truth:'PASS',note:'Choice continuation no longer replays the whole pre-choice sequence.'}
]);

const USER_FAIL_REPORTS=Object.freeze([
  {id:'V39-FAIL-GK-CLOSE-30',scenario:'GK_SHOT_CLOSE',seed:'FINAL-MATCH-TEST-30',status:'USER_FAIL_OPEN',symptoms:[
    {id:'GK_MEANINGFUL_REACTION',text:'GK movement is too small to read as a real dive/reaction.',detector:'GK_MEANINGFUL_REACTION',coverage:'DETECTOR_READY'}]},
  {id:'V39-FAIL-GK-BOX-12',scenario:'GK_SHOT_BOX',seed:'FINAL-MATCH-TEST-12',status:'USER_FAIL_OPEN',symptoms:[
    {id:'GK_LATE_VISIBLE_REACTION',text:'The visible/main part of the GK dive happens so late that it reads as occurring after the goal.',detector:'GK_LATE_VISIBLE_REACTION',coverage:'DETECTOR_READY',note:'Engine evidence has no post-GOAL snapshot; validate visible-reaction lead time.'}]},
  {id:'V39-FAIL-CROSS-RIGHT-12',scenario:'CROSS_RIGHT',seed:'FINAL-MATCH-TEST-12',status:'USER_FAIL_OPEN',symptoms:[
    {id:'OPEN_PLAY_WIDE_OWNER',text:'Defending LB abandons the dangerous RW without a credible compensating owner.',detector:'OPEN_PLAY_WIDE_OWNER',coverage:'DETECTOR_READY'}]},
  {id:'V39-FAIL-CROSS-LEFT-12',scenario:'CROSS_LEFT',seed:'FINAL-MATCH-TEST-12',status:'USER_FAIL_OPEN',symptoms:[
    {id:'ST_DEFENSIVE_DEPTH_RATIONALE',text:'ST drops too deep toward halfway without a persuasive defensive reason.',detector:'ST_DEFENSIVE_DEPTH_RATIONALE',coverage:'DETECTOR_READY'}]},
  {id:'V39-FAIL-FK-DEFEND-L-10',scenario:'FREE_KICK_DEFEND_LEFT',seed:'FINAL-MATCH-TEST-10',status:'USER_FAIL_OPEN',symptoms:[
    {id:'SET_PIECE_MIDFIELD_COLLAPSE',text:'LCM/CM/RCM gather around one point instead of preserving differentiated lanes/depth.',detector:'SET_PIECE_MIDFIELD_COLLAPSE',coverage:'DETECTOR_READY'}]},
  {id:'V39-FAIL-FK-ATTACK-L-10',scenario:'FREE_KICK_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-10',status:'USER_FAIL_OPEN',symptoms:[
    {id:'FK_ATTACK_SHARED_THREAT_COLLAPSE',text:'Defending RCM/CM/LCM/ST all attach toward one attacker while RCM/CM are left-biased.',detector:'FK_ATTACK_SHARED_THREAT_COLLAPSE',coverage:'DETECTOR_READY',note:'At the kick boundary all four defenders share H-LCM as their nearest attacker at about 6.37m average distance. Targeted truth detector; not a universal formation rule.'}]},
  {id:'V39-FAIL-FK-ATTACK-L-6',scenario:'FREE_KICK_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-6',status:'USER_FAIL_OPEN',symptoms:[
    {id:'FK_WIDE_THREAT_OWNER',text:'RB ignores the wide LW and occupies an unexplained location.',detector:'FK_WIDE_THREAT_OWNER',coverage:'DETECTOR_READY',note:'Physical channel and explicit marker are spatially inverted.'}]},
  {id:'V39-FAIL-CORNER-DEF-R-6',scenario:'CORNER_DEFEND_RIGHT',seed:'FINAL-MATCH-TEST-6',status:'USER_FAIL_OPEN',symptoms:[
    {id:'SET_PIECE_TARGET_CONVERGENCE',text:'Several defenders are driven toward one target/point and the outlet structure disappears.',detector:'SET_PIECE_TARGET_CONVERGENCE',coverage:'DETECTOR_READY',note:'Same coordinate alone is not failure. Distinct markers following attackers that genuinely converge are allowed; duplicated/missing ownership is not.'}]},
  {id:'V39-FAIL-CORNER-ATT-R-6',scenario:'CORNER_ATTACK_RIGHT',seed:'FINAL-MATCH-TEST-6',status:'USER_FAIL_OPEN',symptoms:[
    {id:'SET_PIECE_SAME_TEAM_LAYER_COLLISION',text:'Wide/fullback layers collapse onto each other.',detector:'SET_PIECE_SAME_TEAM_LAYER_COLLISION',coverage:'DETECTOR_READY'},
    {id:'CORNER_KICKER_DIRECTION',text:'Kicker run-up/direction looks unnatural.',detector:'CORNER_KICKER_PATH_DIRECTION',coverage:'DETECTOR_READY',note:'Validate the live run-up vector toward the dead ball; starting far away during setup is not itself a failure.'},
    {id:'CORNER_WINGER_CROSSOVER',text:'LW and RW cross over and exchange natural wide channels during setup.',detector:null,coverage:'CONTEXT_RETEST',note:'Set-piece crossover can be football-plausible. Do not block on crossover alone; retain for user visual retest.'},
    {id:'CORNER_DEFENDING_FORWARD_OVERCOMMIT',text:'Defending forward is dragged into near-post protection, destroying the forward/outlet layer.',detector:null,coverage:'CONTEXT_RETEST',note:'A forward defending a post can occur in real football. The blocking defect is duplicated responsibility / destroyed outlet, represented separately by causal detectors.'},
    {id:'CORNER_CENTRAL_CROWD_RELATION',text:'A forward and another defensive layer receive the same central post-protection responsibility, creating deterministic convergence.',detector:'CORNER_CENTRAL_CROWD_RELATION',coverage:'DETECTOR_READY',note:'Targeted responsibility-duplication detector; not a generic ban on forwards defending corners.'}]},
  {id:'V39-FAIL-CORNER-ATT-R-4',scenario:'CORNER_ATTACK_RIGHT',seed:'FINAL-MATCH-TEST-4',status:'USER_FAIL_OPEN',symptoms:[
    {id:'SET_PIECE_ACTUAL_CLUSTER',text:'CM/LCM/defensive roles physically crowd despite different responsibilities.',detector:'SET_PIECE_ACTUAL_CLUSTER',coverage:'DETECTOR_READY',note:'Proximity only blocks when paired with duplicated passive/off-ball responsibility. A live local contest may legitimately cluster.'},
    {id:'CORNER_GK_POST_RESPONSIBILITY',text:'GK leaves the goal / ice-slides in an implausible way.',detector:'CORNER_GK_POST_RESPONSIBILITY',coverage:'DETECTOR_READY'}]},
  {id:'V39-FAIL-CORNER-ATT-L-4',scenario:'CORNER_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-4',status:'USER_FAIL_OPEN',symptoms:[
    {id:'SET_PIECE_ACTUAL_CLUSTER',text:'Multiple defensive roles physically converge without a live-contest reason.',detector:'SET_PIECE_ACTUAL_CLUSTER',coverage:'DETECTOR_READY'},
    {id:'CORNER_KICKER_START_DIRECTION',text:'Kicker start point/direction is unnatural.',detector:'CORNER_KICKER_PATH_DIRECTION',coverage:'DETECTOR_READY',note:'Long setup travel is allowed; only a live run-up vector that does not approach the dead ball is an automated failure.'}]},
  {id:'V39-FAIL-CORNER-ATT-L-1',scenario:'CORNER_ATTACK_LEFT',seed:'FINAL-MATCH-TEST-1',status:'USER_FAIL_OPEN',symptoms:[
    {id:'SET_PIECE_ACTUAL_CLUSTER',text:'CM/RCM/RW/RB and defensive layers collapse into unexplained proximity.',detector:'SET_PIECE_ACTUAL_CLUSTER',coverage:'DETECTOR_READY'},
    {id:'CORNER_LW_DEPTH_CB_RELATION',text:'LW depth and its relationship to the CB line remains unexplained.',detector:null,coverage:'CONTEXT_RETEST',note:'A deep set-piece run can be football-plausible. Preserve for visual retest rather than inventing an absolute depth rule.'}]}
]);

module.exports=Object.freeze({
  version:'V39-USER-VISUAL-TRUTH-0.7',
  policy:Object.freeze({
    userFailOverridesInternalPass:true,
    openUserFailureBlocksRelease:true,
    calibrationPendingIsNotPass:true,
    contextRetestDoesNotAutoBlock:true,
    detectorCleanNeedsUserRetest:true,
    pairedControlRequiredBeforeUniversalPromotion:true,
    absolutePositionDeviationAloneIsNotFailure:true,
    rareButFootballPlausibleIsAllowed:true,
    frequencyTuningIsSeparateFromExistenceValidity:true,
    unexplainedRoleAbandonmentIsFailureCandidate:true,
    tacticalOrCausalExplanationRequiredForOutOfRoleState:true,
    spatialThresholdsAreTriggersNotVerdicts:true,
    predeployVisualQueueRequiresDetectorClean:true,
    automatedFailScenesMustNotBeSentForUserVisualRetest:true
  }),
  USER_PASS_CONTROLS,USER_FAIL_REPORTS
});
