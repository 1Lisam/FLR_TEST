// Keep only realised recent motion. Full match storage is event/aggregate sized,
// not 27,000 copies of all players, intentions and old records.
export function retainFrame(history,frame,limit){history.push(frame);if(history.length>limit)history.splice(0,history.length-limit);}
export const historyLimit=duration=>duration>180?301:901;
