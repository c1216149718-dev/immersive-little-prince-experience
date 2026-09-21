import { smooth } from "../state";
export const STAGE = {
  curtainStart: 5.18, curtainEnd: 5.38,
  firstEntrance: 5.50, spacing: .46, passage: .60,
  cloudFloat: .035, propEnter: .19, propHold: .72, propExit: .85,
  starStart: 8.46, pushStart: 8.64, pushEnd: 9.0,
} as const;
export function stagePhase(t:number,index:number){return (t-STAGE.firstEntrance-index*STAGE.spacing)/STAGE.passage}
export function stageX(p:number){
  return -12+13.1*smooth(0,.25,p)+1.25*smooth(.25,.72,p)+11*smooth(.72,1,p);
}
export function stageIndex(t:number){return Math.min(5,Math.max(0,Math.floor((t-STAGE.firstEntrance-.08*STAGE.passage)/STAGE.spacing)))}

