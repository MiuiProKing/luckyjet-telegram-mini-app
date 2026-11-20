// Reviewed Canvas fallback from the supplied Premium renderer. No network or prediction logic.
export function spiderPath(seconds,width,height){
  const points=[{at:0,x:-.37,y:.36,z:300},{at:1.3,x:-.08,y:.27,z:270},{at:3.1,x:.22,y:.12,z:270},{at:4.2,x:.02,y:.12,z:-55},{at:5.5,x:-.25,y:-.24,z:280},{at:6.7,x:.08,y:-.34,z:280},{at:8.1,x:-.65,y:-.46,z:280},{at:19,x:-.65,y:.42,z:300},{at:20,x:-.37,y:.36,z:300}];
  const sec=seconds%20;let ix=points.findIndex((p,i)=>i<points.length-1&&sec<points[i+1].at);ix=Math.max(0,ix);
  const a=points[ix],b=points[ix+1],prev=points[Math.max(0,ix-1)],next=points[Math.min(points.length-1,ix+2)],f=(sec-a.at)/(b.at-a.at);
  const hermite=k=>ix===6?a[k]+(b[k]-a[k])*f:(2*f**3-3*f**2+1)*a[k]+(f**3-2*f**2+f)*((b[k]-prev[k])*.35)+(-2*f**3+3*f**2)*b[k]+(f**3-f**2)*((next[k]-a[k])*.35);
  return{x:hermite('x')*width,y:hermite('y')*height,z:hermite('z'),size:Math.max(76,Math.min(width*.34,240)*.56)/38};
}
export function mountScene(base,spider,preferences=()=>({}),pulse=()=>0){
 const ctx=base.getContext('2d'),robot=spider.getContext('2d'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let w=0,h=0,time=0,last=0,request=0,lastDraw=0,distance=0,lastX,lastY,angle=0,active=true;
 const particles=Array.from({length:1100},()=>({theta:Math.random()*Math.PI*2,phi:Math.random()*Math.PI*2,speed:.2+Math.random()*.8,alpha:.25+Math.random()*.5}));
 function size(){const box=base.getBoundingClientRect();w=box.width;h=box.height;const dpr=Math.min(preferences().economy?1:2,devicePixelRatio||1);for(const c of [base,spider]){c.width=w*dpr;c.height=h*dpr;c.getContext('2d').setTransform(dpr,0,0,dpr,0,0)}}
 const observer=new ResizeObserver(size);observer.observe(base);size();
 function draw(stamp){if(!active)return;request=requestAnimationFrame(draw);if(document.hidden){last=0;return}const pref=preferences();if(stamp-lastDraw<(pref.economy?1000/30:1000/60)-1)return;lastDraw=stamp;const dt=last?Math.min((stamp-last)/1000,.05):0;last=stamp;if(!reduce.matches)time+=dt;
 ctx.clearRect(0,0,w,h);robot.clearRect(0,0,w,h);const cx=w/2,cy=h*(w<641?.48:.46),radius=Math.min(w*.34,240),tube=radius*.52,speed=1+pulse()*.25;
 ctx.globalCompositeOperation='lighter';const count=pref.economy?400:1100;
 for(let ix=0;ix<count;ix++){const p=particles[ix];if(!reduce.matches){p.theta+=dt*1.2*p.speed*speed;p.phi+=dt*.24*p.speed}const shade=(Math.sin(p.phi+time*.12)+1)/2;ctx.strokeStyle=`rgba(${Math.round(130+shade*85)},${Math.round(74+shade*60)},255,${p.alpha*.75})`;ctx.lineWidth=.8;ctx.beginPath();for(let z=0;z<=5;z++){const theta=p.theta+z*.07,x=(radius+tube*Math.cos(theta))*Math.cos(p.phi),y=tube*Math.sin(theta),zz=(radius+tube*Math.cos(theta))*Math.sin(p.phi),yy=y*Math.cos(.45)-zz*Math.sin(.45),perspective=700/(700+(y*Math.sin(.45)+zz*Math.cos(.45)));z?ctx.lineTo(cx+x*perspective,cy+yy*perspective):ctx.moveTo(cx+x*perspective,cy+yy*perspective)}ctx.stroke()}
 ctx.globalCompositeOperation='source-over';ctx.strokeStyle='rgba(170,110,240,.15)';ctx.lineWidth=.9;ctx.beginPath();for(let z=0;z<=100;z++){const theta=z/100*Math.PI*2+time*.04,x=cx+Math.cos(theta)*radius*1.5,y=cy+Math.sin(theta)*radius;z?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();
 if(pref.spider===false)return;const p=spiderPath(time,w,h),p2=spiderPath(time+.01,w,h),scale=p.size*38/50,x=cx+p.x,y=h/2-p.y,heading=Math.atan2(-(p2.y-p.y),p2.x-p.x);if(lastX===undefined)angle=heading;else{angle+=Math.atan2(Math.sin(heading-angle),Math.cos(heading-angle))*(1-Math.exp(-12*dt));distance+=Math.hypot(x-lastX,y-lastY)}lastX=x;lastY=y;const steps=distance/(14*p.size);
 robot.save();robot.translate(x,y+Math.sin(steps*Math.PI*4)*scale*.45);robot.rotate(angle+Math.PI/2);robot.globalAlpha=p.z<0?.45:1;robot.lineCap='round';robot.lineJoin='round';
 for(let leg=0;leg<8;leg++){const sign=leg<4?-1:1,group=leg%4,phase=(steps+(group+(sign>0?1:0))%2*.5)%1,swing=phase>=.62,part=swing?(phase-.62)/.38:phase/.62,joint=(swing?1-part*2:-1+part*2)*6*scale,lift=swing?Math.sin(part*Math.PI):0,rootX=sign*4.8*scale,rootY=(group-1.5)*3*scale,footX=sign*(25-lift*3)*scale,footY=(group-1.5)*12*scale+joint,kneeX=sign*(14+lift*2)*scale,kneeY=rootY+(group-1.5)*6*scale-lift*4*scale,tipX=sign*(21-lift)*scale,tipY=footY-2.5*scale-lift*3*scale;
 robot.strokeStyle='rgba(218,206,255,.94)';robot.lineWidth=1.05;robot.beginPath();robot.moveTo(rootX,rootY);robot.lineTo(kneeX,kneeY);robot.lineTo(tipX,tipY);robot.lineTo(footX,footY);robot.stroke();for(const [ax,ay]of[[rootX,rootY],[kneeX,kneeY],[tipX,tipY],[footX,footY]]){robot.beginPath();robot.arc(ax,ay,.7*scale,0,Math.PI*2);robot.fillStyle=leg%2?'#e870ba':'#b0a7ff';robot.fill()}}
 robot.strokeStyle='#e4d7ff';robot.lineWidth=.8;for(const [ax,ay,ar]of[[6,5,7],[-4,3,3]]){robot.beginPath();robot.ellipse(0,ax*scale,ay*scale,ar*scale,0,0,Math.PI*2);robot.stroke()}robot.restore();
 }
 request=requestAnimationFrame(draw);return{resize:size,stop(){active=false;cancelAnimationFrame(request);observer.disconnect()}};
}
