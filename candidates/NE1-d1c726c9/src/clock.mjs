// A slow render is not a shorter wall-clock interval. Keep accumulated fixed
// ticks, but yield regularly so input/pause/choice guards remain responsive.
export function frameBudget(elapsed,speed){
  const seconds=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
  return {credit:seconds*speed,milliseconds:Math.min(60,Math.max(10,seconds*150))};
}
