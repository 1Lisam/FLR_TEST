const W=1150,H=800,S=10,OX=50,OY=60;
export function pointOnPitch(canvas,clientX,clientY){const r=canvas.getBoundingClientRect();return{x:((clientX-r.left)*W/r.width-OX)/S,y:((clientY-r.top)*H/r.height-OY)/S};}
export function draw(canvas,state,{selected=null,seed=1,speed=1,replay=false,playerScale=1,targets=[]}={}){
 const c=canvas.getContext('2d');c.clearRect(0,0,W,H);c.fillStyle='#152b1c';c.fillRect(0,0,W,H);
 for(let i=0;i<10;i++){c.fillStyle=i%2?'#2b5835':'#285331';c.fillRect(OX+i*105,OY,105,680);}
 c.strokeStyle='#b4c6a3';c.lineWidth=1.5;
 const rect=(x,y,w,h)=>c.strokeRect(OX+x*S,OY+y*S,w*S,h*S);
 const line=(x1,y1,x2,y2)=>{c.beginPath();c.moveTo(OX+x1*S,OY+y1*S);c.lineTo(OX+x2*S,OY+y2*S);c.stroke();};
 const circle=(x,y,r)=>{c.beginPath();c.arc(OX+x*S,OY+y*S,r*S,0,2*Math.PI);c.stroke();};
 rect(0,0,105,68);line(52.5,0,52.5,68);circle(52.5,34,9.15);
 rect(0,13.84,16.5,40.32);rect(88.5,13.84,16.5,40.32);rect(0,24.84,5.5,18.32);rect(99.5,24.84,5.5,18.32);
 rect(-1.6,30.34,1.6,7.32);rect(105,30.34,1.6,7.32);circle(11,34,.15);circle(94,34,.15);
 c.save();c.beginPath();c.rect(OX+16.5*S,OY,72*S,68*S);c.clip();circle(11,34,9.15);circle(94,34,9.15);c.restore();
 if(selected){const p=state.players.find(p=>p.id===selected);if(p){c.strokeStyle='#e8edb077';c.setLineDash([3,5]);line(p.x,p.y,p.intention.x,p.intention.y);c.setLineDash([]);circle(p.intention.x,p.intention.y,.45);}}
 for(const p of state.players){
   const x=OX+p.x*S,y=OY+p.y*S;c.fillStyle='#0005';c.beginPath();c.ellipse(x+1,y+3,9*playerScale,6*playerScale,0,0,Math.PI*2);c.fill();
   if(targets.includes(p.id)){c.strokeStyle='#9cd7ff88';c.lineWidth=1.5;circle(p.x,p.y,1.15*playerScale);}
   if(p.id===selected){c.strokeStyle='#fff2b5';c.lineWidth=2;circle(p.x,p.y,1.3*playerScale);}
   c.fillStyle=p.role==='GK'?(p.team===0?'#bce7d9':'#e7cbbc'):(p.team===0?'#4d9ce8':'#e36157');
   c.beginPath();c.arc(x,y,8*playerScale,0,Math.PI*2);c.fill();c.strokeStyle=p.team===0?'#bde1ff':'#ffc9be';c.lineWidth=1;c.stroke();
   const facing=p.lookFacing??p.facing;
   c.strokeStyle='#f0f6de';c.lineWidth=2;c.beginPath();c.moveTo(x+Math.cos(facing)*7*playerScale,y+Math.sin(facing)*7*playerScale);c.lineTo(x+Math.cos(facing)*12*playerScale,y+Math.sin(facing)*12*playerScale);c.stroke();
   c.fillStyle='#fff';c.font=`bold ${9*playerScale}px sans-serif`;c.textAlign='center';c.strokeStyle='#102218';c.lineWidth=3;c.strokeText(p.role,x,y-13*playerScale);c.fillText(p.role,x,y-13*playerScale);
 }
 const b=state.ball,x=OX+b.x*S,y=OY+b.y*S;
 const z=Math.max(0,b.z),lift=z*S,ballY=y-lift;
 c.fillStyle=`rgba(0,0,0,${.45/(1+z*.3)})`;c.beginPath();c.ellipse(x+2,y+3,4+z*.35,2.5+z*.15,0,0,Math.PI*2);c.fill();
 if(z>.25){c.strokeStyle='#e6e9bd66';c.lineWidth=1;c.setLineDash([2,3]);c.beginPath();c.moveTo(x,y);c.lineTo(x,ballY);c.stroke();c.setLineDash([]);}
 c.fillStyle='#fffbe3';c.strokeStyle='#18231d';c.lineWidth=1.5;c.beginPath();c.arc(x,ballY,4+Math.min(1.5,z*.25),0,Math.PI*2);c.fill();c.stroke();
 if(z>.25){c.font='bold 11px sans-serif';c.textAlign='left';c.lineWidth=3;c.strokeText(z.toFixed(1)+'m',x+8,ballY-5);c.fillText(z.toFixed(1)+'m',x+8,ballY-5);}
 c.fillStyle='#afc9af';c.font='13px sans-serif';c.textAlign='left';c.fillText(`NE1 · 경기 ${seed} · ${replay?'지난 장면':speed+'배속'}`,OX,30);
 const end=state.endAt??180;
 c.textAlign='right';c.fillText(`${Math.floor(state.time/60).toString().padStart(2,'0')}:${Math.floor(state.time%60).toString().padStart(2,'0')} / ${Math.floor(end/60).toString().padStart(2,'0')}:00`,W-OX,30);
 const second=(state.period??state.match?.period)===2;
 c.textAlign='left';c.font='12px sans-serif';c.fillStyle='#90b194';c.fillText(second?'← 블루                                      후반 · 실제 경기 진행 · 22명                                      레드 →':'블루 →                                      실제 경기 진행 · 22명                                      ← 레드',OX,H-24);
}
