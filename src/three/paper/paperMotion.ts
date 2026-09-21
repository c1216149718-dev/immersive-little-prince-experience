export type PaperPiece = "wheatLeft" | "wheatRight" | "cloud" | "star";
export const PAPER_LAYOUT = [
  {kind:"wheatTall",x:-1.65,y:-.95,z:2.5,width:1.45,side:-1,delay:0},
  {kind:"wheatBase",x:1.85,y:-.65,z:2.35,width:1.85,side:1,delay:.045},
  {kind:"wheatBase",x:-2.5,y:-.60,z:.2,width:1.75,side:-1,delay:.09},
  {kind:"wheatTall",x:2.65,y:-.85,z:-.3,width:1.5,side:1,delay:.135},
  {kind:"wheatTall",x:-3.65,y:-.08,z:-3.1,width:1.15,side:-1,delay:.18},
  {kind:"wheatBase",x:3.9,y:-.05,z:-3.8,width:1.65,side:1,delay:.225},
  {kind:"cloud",x:-3.2,y:6.2,z:-24,width:4.2,side:0,delay:.02},
  {kind:"cloud",x:4.2,y:8,z:-28,width:5.4,side:0,delay:.10},
  {kind:"star",x:-4.5,y:6.8,z:-21,width:1.1,side:0,delay:.06},
  {kind:"star",x:8,y:7,z:-27,width:1,side:0,delay:.16},
  {kind:"star",x:-.8,y:7.4,z:-26,width:.72,side:0,delay:.09},
  {kind:"star",x:11.5,y:5.4,z:-25,width:1.05,side:0,delay:.21},
] as const;
export interface PaperPose { x:number;y:number;z:number;rotation:number;tilt:number }
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const p=clamp(v);return p*p*(3-2*p)};
export function paperSeed(i:number){const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v)}
export const paperWindStrength=(t:number)=>ease((t-9.52)/.65)*(1-ease((t-10.48)/.5));
function pull(v:number,reduced:boolean){const p=clamp(v);if(reduced||p===1)return ease(p);const n=p*8;return (Math.floor(n)+ease((n%1)/.42))/8}
export function paperStagePose(piece:PaperPiece|number,t:number,elapsed:number,reduced=false):PaperPose{
  const i=typeof piece==="number"?piece:({wheatLeft:0,wheatRight:1,cloud:6,star:8}[piece]);
  const card=PAPER_LAYOUT[i],hanging=card.side===0;
  const enter=pull((t-9-card.delay*.45)/.16,reduced);
  const exit=pull((t-(hanging?10.08:10.18)-card.delay)/.36,reduced);
  const wind=paperWindStrength(t),settled=enter*(1-exit);
  const clock=reduced?0:elapsed;
  const stepped=Math.floor(clock*11)/11;
  const sway=reduced?0:(Math.sin(clock*(.58+i*.057)+i*1.8)*.014+Math.sin(stepped*1.7+i)*wind*.045)*settled;
  const after=t-9-card.delay*.45-.16;
  const bounce=reduced||after<0?0:Math.sin(after*48)*Math.exp(-after*22)*.1*(1-exit);
  return {x:card.x+card.side*(1.3*(1-enter)+exit*11),y:card.y+(hanging?12*(1-enter)+exit*16:-3.5*(1-enter)-exit*2)+bounce,
    z:card.z,rotation:card.side*.045+sway+card.side*exit*.24,tilt:reduced||settled===0?0:Math.sin(clock*.43+i)*.018*settled};
}
export interface PaperChipPose {x:number;y:number;z:number;rx:number;ry:number;rz:number;scale:number;scaleY:number;sand:number}
export function paperDebrisPose(i:number,t:number,reduced=false):PaperChipPose|null{
  if(reduced||t<9.18||t>=11.03)return null;
  if(i<5){
    const p=(t-9.18)/.72,a=paperSeed(i+1),b=paperSeed(i+83);
    if(p>=1)return null;
    return {x:-9+a*7+p*(26-a*7),y:1.5+b*1.8+Math.sin(p*3+i)*.18,z:-5-a*8,rx:.1,ry:a+p,rz:-.8+a*1.5+p,scale:(.16+b*.17)*ease(p/.08),scaleY:1,sand:0};
  }
  const a=paperSeed(i+1),b=paperSeed(i+83),near=i>=24;
  // Six gentle leaves, then six more, then a short foreground curtain.
  const start=i<6?9.55+a*.12:i<12?9.83+a*.13:i<24?10.10+a*.15:10.26+a*.16;
  const duration=i<12?.48+b*.15:.38+b*.12;
  const p=(t-start)/duration;if(p<0||p>=1)return null;
  const sand=ease((t-10.34)/.47);
  return {x:(near?-5.5:-7)+p*(near?12:17),
    y:near?.15+b*1.5+Math.sin(p*Math.PI)*.35:.4+b*.7+Math.sin(p*Math.PI)*.8+p*.5,
    z:near?2.9+a*1.7:-4-b*7,
    rx:a*6+p*(1.5+sand*2),ry:b*5+p*3,rz:a*4+p*(2+sand*3),
    scale:(near?.09+b*.11:.13+b*.12)*(1-sand*.65),scaleY:1,sand};
}
export function paperWindRange(i:number,t:number,reduced=false,samples=128){
  if(reduced||t<9.18||t>=11.03||i>1&&t<9.86)return {start:0,count:0};
  const duration=.64-paperWindStrength(t)*.26,start=9.18+i*.08;
  const p=((t-start)/duration)%1;
  if(t<start)return {start:0,count:0};
  const head=Math.min(samples,Math.floor(p*1.5*samples)),tail=Math.max(0,Math.floor((p*1.5-.65)*samples));
  return {start:tail,count:Math.max(0,head-tail)};
}

