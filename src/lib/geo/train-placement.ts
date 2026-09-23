import { Vector2 } from 'three'

/** Fit a bounded consist within a mapped way; bogie chord defines each car's yaw. */
export function trainPlacements(line: Vector2[], unit: number, fraction: number, maxCars=4) {
  const distances=[0]
  for(let i=1;i<line.length;i++) distances.push(distances[i-1]+line[i].distanceTo(line[i-1]))
  const length=distances[distances.length-1] ?? 0, pitch=20*unit, half=9.5*unit
  const count=Math.min(maxCars,Math.floor((length-2*unit)/pitch))
  if(count<1) return []
  const start=half+unit+Math.max(0,length-count*pitch-2*unit)*Math.max(0,Math.min(1,fraction))
  const at=(s:number)=>{
    let i=1
    while(i<distances.length-1 && distances[i]<s) i++
    return line[i-1].clone().lerp(line[i],(s-distances[i-1])/Math.max(1e-15,distances[i]-distances[i-1]))
  }
  return Array.from({length:count},(_,i)=>{
    const s=start+i*pitch,p=at(s),a=at(s-7*unit),b=at(s+7*unit)
    return {x:p.x,y:p.y,yaw:Math.atan2(b.y-a.y,b.x-a.x)}
  })
}
