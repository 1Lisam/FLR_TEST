// Realised 30 Hz snapshots only. This module never imports/steps the engine.
export const LEAD_FRAMES=241;
export function recordLeadIn(frames,frame){
  if(frames.at(-1)?.tick===frame.tick)frames[frames.length-1]=frame;
  else {frames.push(frame);if(frames.length>LEAD_FRAMES)frames.splice(0,frames.length-LEAD_FRAMES);}
}
export function leadInFrame(frames,time){
  let lo=0,hi=frames.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].time<=time+1e-8)lo=mid;else hi=mid-1;}
  return frames[lo];
}
