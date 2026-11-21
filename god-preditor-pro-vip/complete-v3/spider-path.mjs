// Pure 20-second Hermite trajectory from the supplied Premium client.
export function spiderPath(seconds,width,height){
  const points=[{at:0,x:-.37,y:.36,z:300},{at:1.3,x:-.08,y:.27,z:270},{at:3.1,x:.22,y:.12,z:270},{at:4.2,x:.02,y:.12,z:-55},{at:5.5,x:-.25,y:-.24,z:280},{at:6.7,x:.08,y:-.34,z:280},{at:8.1,x:-.65,y:-.46,z:280},{at:19,x:-.65,y:.42,z:300},{at:20,x:-.37,y:.36,z:300}];
  const sec=seconds%20;let ix=points.findIndex((p,i)=>i<points.length-1&&sec<points[i+1].at);ix=Math.max(0,ix);
  const a=points[ix],b=points[ix+1],prev=points[Math.max(0,ix-1)],next=points[Math.min(points.length-1,ix+2)],f=(sec-a.at)/(b.at-a.at);
  const hermite=k=>ix===6?a[k]+(b[k]-a[k])*f:(2*f**3-3*f**2+1)*a[k]+(f**3-2*f**2+f)*((b[k]-prev[k])*.35)+(-2*f**3+3*f**2)*b[k]+(f**3-f**2)*((next[k]-a[k])*.35);
  return{x:hermite('x')*width,y:hermite('y')*height,z:hermite('z'),size:Math.max(76,Math.min(width*.34,240)*.56)/38};
}
