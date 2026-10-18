export type HighlightRect={x:number;y:number;width:number;height:number};
export type SpringAxis={value:number;velocity:number};
/** A near-critically damped spring with restrained overshoot. New targets retain current position/velocity; no queue. */
export function stepSpring(axis:SpringAxis,target:number,seconds:number):SpringAxis{let {value,velocity}=axis;const steps=Math.max(1,Math.ceil(Math.min(seconds,.04)/.006));const dt=Math.min(seconds,.04)/steps;for(let i=0;i<steps;i++){velocity+=(1000*(target-value)-56*velocity)*dt;value+=velocity*dt}if(Math.abs(target-value)<.04&&Math.abs(velocity)<.6)return {value:target,velocity:0};return {value,velocity}}
export function transferKind(previous:HighlightRect|null,next:HighlightRect,previousIndex:number,nextIndex:number,seekChanged:boolean,reducedMotion:boolean):'snap'|'spring'|'row-hop'{if(!previous||seekChanged||reducedMotion)return 'snap';if(Math.abs(previousIndex-nextIndex)>2)return 'snap';if(Math.abs(previous.y-next.y)>Math.min(previous.height,next.height)*.45)return 'row-hop';if(Math.abs(previous.x-next.x)>320)return 'snap';return 'spring'}
export class HighlightSpring{
 x:SpringAxis; width:SpringAxis; target:HighlightRect; y:number;height:number;
 constructor(rect:HighlightRect){this.x={value:rect.x,velocity:0};this.width={value:rect.width,velocity:0};this.target=rect;this.y=rect.y;this.height=rect.height}
 retarget(rect:HighlightRect,snap=false){this.target=rect;this.y=rect.y;this.height=rect.height;if(snap){this.x={value:rect.x,velocity:0};this.width={value:rect.width,velocity:0}}}
 step(seconds:number){this.x=stepSpring(this.x,this.target.x,seconds);this.width=stepSpring(this.width,this.target.width,seconds);return {x:this.x.value,y:this.y,width:Math.max(1,this.width.value),height:this.height}}
 get settled(){return this.x.velocity===0&&this.width.velocity===0&&this.x.value===this.target.x&&this.width.value===this.target.width}
}
