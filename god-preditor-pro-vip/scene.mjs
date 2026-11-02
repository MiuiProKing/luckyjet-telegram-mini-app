// Authored Canvas brain and courier spider. Tentacle IK is adapted from the
// user's Monster Electrico reference; bounded to one RAF loop and resize observer.
export function mountScene(canvas,{onDelivery=()=>{},compact=false}={}){
 const c=canvas.getContext('2d');let W=0,H=0,dpr=1,raf=0,clock=0,last=0,deliveries=0,flash=0,paused=false,mouse=null,job=null,queue=[];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const random=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n)};
 let strands=[],core={x:0,y:0};
 const resize=()=>{delete canvas.dataset.sceneReady;const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=W*dpr;canvas.height=H*dpr;core={x:W/2,y:H*.45};strands=Array.from({length:compact?80:W<800?340:500},(_,i)=>({x:random(i+1)*W,y:random(i+6)*H,length:compact?25+random(i+19)*Math.min(110,W*.5):50+random(i+19)*250,phase:random(i+45)*6.28,points:Array.from({length:30},()=>({x:random(i+1)*W,y:random(i+6)*H,a:0}))}))};
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 const brain=()=>{const a=clock*.34,span=compact?Math.min(W*.18,H*.2):Math.min(W*.26,H*.29),target=mouse??{x:W/2+span*Math.sqrt(2)*Math.cos(a)/(1+Math.sin(a)**2),y:H*.52+span*.65*Math.cos(a)*Math.sin(a)/(1+Math.sin(a)**2)};core.x+=(Math.max(compact?30:65,Math.min(W-(compact?30:65),target.x))-core.x)*.08;core.y+=(Math.max(compact?30:W<800?290:270,Math.min(H-(compact?25:W<800?250:230),target.y))-core.y)*.08;return {x:core.x,y:core.y,scale:(compact?.22:W<800?.47:.58)*(1+Math.min(deliveries,30)/30*.24)}};
 const pointer=e=>{const r=canvas.getBoundingClientRect();mouse={x:e.clientX-r.left,y:e.clientY-r.top}};const leave=()=>mouse=null;
 canvas.addEventListener('pointermove',pointer);canvas.addEventListener('pointerleave',leave);
 let previous={x:W/2,y:H*.43};
 function field(b){
  const moved=Math.hypot(b.x-previous.x,b.y-previous.y)+5;
  for(const [i,s] of strands.entries()){
   const distance=Math.hypot(b.x-s.x,b.y-s.y),active=distance<=s.length;
   c.fillStyle=active?'rgba(220,250,255,.7)':'rgba(0,95,100,.6)';c.beginPath();c.arc(s.x,s.y,active?1+random(i+100)*2:random(i+100)*1.6,0,Math.PI*2);c.fill();
   if(!active)continue;
   const angle=Math.atan2(b.y-s.y,b.x-s.x),len=s.length/s.points.length;
   let tx=b.x-.8*moved*Math.cos(angle),ty=b.y-.8*moved*Math.sin(angle);
   for(let j=s.points.length-1;j>=0;j--){const p=s.points[j];p.a=Math.atan2(ty-p.y,tx-p.x);p.x=tx-len*Math.cos(p.a);p.y=ty-len*Math.sin(p.a);tx=p.x;ty=p.y}
   let x=s.x,y=s.y;c.beginPath();c.moveTo(x,y);
   for(const p of s.points){p.x=x;p.y=y;x+=len*Math.cos(p.a);y+=len*Math.sin(p.a);c.lineTo(x,y)}
   c.globalCompositeOperation='lighter';c.strokeStyle=`hsla(${180+random(i+34)*60},100%,${25+random(i+67)*60}%,.75)`;c.lineWidth=.2+random(i+96)*1.6;c.lineCap='round';c.lineJoin='round';c.stroke();c.globalCompositeOperation='source-over';
  }previous={x:b.x,y:b.y};
 }
 const hemisphere=new Path2D('M -4 -89 C -15 -112 -44 -115 -57 -93 C -84 -103 -107 -79 -100 -56 C -128 -46 -129 -15 -111 -2 C -130 24 -111 53 -91 53 C -95 80 -63 99 -43 83 C -27 104 -4 86 -4 65 Z');
 const folds=[[-8,-73,-45,-97,-67,-74,-51,-55],[-51,-55,-24,-48,-19,-69,-7,-59],[-92,-51,-65,-68,-72,-24,-46,-24],[-8,-37,-40,-49,-27,-8,-55,-5],[-106,-10,-85,-29,-66,8,-83,23],[-8,1,-34,-20,-30,26,-57,22],[-74,49,-58,24,-28,61,-7,39],[-85,66,-51,86,-52,48,-34,50],[-16,76,-28,54,-15,60,-9,55],[-93,11,-103,34,-74,41,-64,27]];
 function drawBrain(b){
  c.save();c.translate(b.x,b.y);const breath=1+.012*Math.sin(clock*1.8)+flash*.035;c.scale(b.scale*breath,b.scale*breath);
  const glow=c.createRadialGradient(0,0,5,0,0,160);glow.addColorStop(0,'#20f0be12');glow.addColorStop(.5,'#1cdabc09');glow.addColorStop(1,'transparent');c.fillStyle=glow;c.fillRect(-170,-170,340,340);
  for(const side of [1,-1]){c.save();c.scale(side,1);c.fillStyle='#041b1de8';c.shadowColor='#59fbd6';c.shadowBlur=17+flash*20;c.strokeStyle='#71f4d9cc';c.lineWidth=1.2;c.fill(hemisphere);c.stroke(hemisphere);c.shadowBlur=5;c.lineWidth=.8;
   for(const [i,f] of folds.entries()){c.strokeStyle=i%3===0?'#aca5fd99':'#66d7ca99';c.beginPath();c.moveTo(f[0],f[1]);c.bezierCurveTo(...f.slice(2));c.stroke()}
   c.clip(hemisphere);c.globalCompositeOperation='lighter';
   for(let i=0;i<48;i++){const x=-10-random(i+21)*98,y=-100+random(i+74)*200,alpha=.15+.5*Math.max(0,Math.sin(clock*1.1+i));c.fillStyle=`rgba(125,255,225,${alpha})`;c.beginPath();c.arc(x,y,.7+flash,0,Math.PI*2);c.fill();if(i%3===0){c.strokeStyle='#73ddca18';c.beginPath();c.moveTo(x,y);c.lineTo(x+15*Math.sin(i),y+22*Math.cos(i));c.stroke()}}
   c.restore();
  }
  c.shadowColor='#7bf9eb';c.shadowBlur=7;c.strokeStyle='#76eedac0';c.lineWidth=1;c.beginPath();c.moveTo(-4,67);c.bezierCurveTo(-8,96,-13,99,-9,113);c.moveTo(4,67);c.bezierCurveTo(8,96,13,99,9,113);c.stroke();c.restore();
 }
 function drawSpider(x,y,angle,carry){
  c.save();c.translate(x,y);c.rotate(angle);const scale=compact?.45:W<800?.8:1;c.scale(scale,scale);c.lineCap='round';c.shadowColor='#84cce5';c.shadowBlur=3;
  for(let side of [-1,1])for(let i=0;i<4;i++){const a=side*(.65+i*.62),walk=Math.sin(clock*12+i*Math.PI+side)*4;const hx=Math.cos(a)*5,hy=Math.sin(a)*5,fx=Math.cos(a)*(31+walk),fy=Math.sin(a)*(31+walk);const kx=(hx+fx)*.5-side*(fy-hy)*.45,ky=(hy+fy)*.5+side*(fx-hx)*.45;c.strokeStyle='#b8dbedbb';c.lineWidth=.9;c.beginPath();c.moveTo(hx,hy);c.lineTo(kx,ky);c.lineTo(fx,fy);c.stroke();c.fillStyle='#93f7dc';c.beginPath();c.arc(kx,ky,1,0,7);c.fill()}
  c.strokeStyle='#ddf7fc';c.fillStyle='#0c2532';c.beginPath();c.ellipse(-5,0,7,5,0,0,7);c.fill();c.stroke();c.beginPath();c.ellipse(5,0,4,3,0,0,7);c.stroke();c.fillStyle='#ef95d1';c.beginPath();c.arc(7,0,1.3,0,7);c.fill();c.restore();
  if(carry){const text=Number(carry.coefficient).toFixed(2)+'×';c.font='11px monospace';const w=c.measureText(text).width;c.fillStyle='#05191ee8';c.strokeStyle='#63c9c36b';c.lineWidth=1;c.beginPath();c.roundRect(x-w/2-8,y-37,w+16,23,5);c.fill();c.stroke();c.fillStyle='#b9ffec';c.textAlign='center';c.fillText(text,x,y-21)}
 }
 function frame(ms){raf=requestAnimationFrame(frame);const dt=Math.min(.04,last?(ms-last)/1000:.016);last=ms;if(paused&&canvas.dataset.sceneReady==='true')return;clock+=dt;flash=Math.max(0,flash-dt*1.7);c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);const b=brain();
  field(b);drawBrain(b);
  if(!job&&queue.length){const data=queue.shift();job={data,t:0,side:deliveries%2?1:-1,delivered:false}}
  let x,y,a=0,carry=null;
  if(job){job.t+=dt;const u=Math.min(1,job.t/3.0),e=u*u*(3-2*u),start={x:job.side>0?W-35:35,y:H*(W<800?.78:.79)};x=start.x+(b.x-start.x)*e;y=start.y+(b.y-start.y)*e-Math.sin(u*Math.PI)*50;a=Math.atan2(b.y-start.y,b.x-start.x);carry=job.data;if(u>=1){deliveries++;flash=1;onDelivery(deliveries,job.data);job=null;carry=null}}
  else{x=b.x+Math.cos(clock*.44)*Math.min(compact?55:180,W*(compact?.22:.32));y=b.y+Math.sin(clock*.66)*(compact?Math.min(32,H*.25):116);a=Math.atan2(Math.cos(clock*.66)*.66,-Math.sin(clock*.44)*.44)}
  drawSpider(x,y,a,carry);canvas.dataset.sceneReady='true';
 }
 raf=requestAnimationFrame(frame);
 return {push(rows,{initial=false}={}){const picked=initial?rows.slice(-4):rows.slice(-12);queue.push(...picked);if(queue.length>16)queue=queue.slice(-16)},setPaused(value){paused=value;if(reduced.matches&&!value)flash=0},destroy(){cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('pointermove',pointer);canvas.removeEventListener('pointerleave',leave)}};
}
