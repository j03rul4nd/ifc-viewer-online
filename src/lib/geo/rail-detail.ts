import { Vector2 } from 'three'
import type { NumberSink } from './growable-array'

type Tone = [number, number, number]
/** Batched engineering-scale detail; all inputs and output are in the map frame. */
export function appendRailDetail(positions: NumberSink, colors: NumberSink, line: Vector2[], unit: number,
  height: (x: number, y: number) => number, gauge = 1.435, detailed = true, focus?: Vector2, overhead=false): void {
  const near=(p:Vector2)=>!focus || p.distanceTo(focus)<450*unit
  const box = (a: Vector2, b: Vector2, width: number, bottom: number, top: number, tone: Tone) => {
    const d = b.clone().sub(a), length = d.length()
    if (length < unit * .001) return
    const n = new Vector2(-d.y, d.x).multiplyScalar(width * unit / length / 2)
    const xy = [a.clone().sub(n), b.clone().sub(n), b.clone().add(n), a.clone().add(n)]
    const vertices = [bottom, top].flatMap(z => xy.map(p => [p.x, p.y, height(p.x, p.y) + z * unit]))
    for (const face of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]) {
      for (const i of [face[0],face[1],face[2],face[0],face[2],face[3]]) {
        positions.push(...vertices[i]); colors.push(...tone)
      }
    }
  }
  // Mitred offsets preserve both running rails through mapped curves.
  const offsets = [-1,1].map(side => line.map((p,i) => {
    const before = line[Math.max(0,i-1)], after = line[Math.min(line.length-1,i+1)]
    const u = p.clone().sub(before).normalize(), v = after.clone().sub(p).normalize()
    if (i===0) u.copy(v)
    if (i===line.length-1) v.copy(u)
    const n = new Vector2(-u.y-v.y,u.x+v.x).normalize()
    const scale = Math.min(2, 1 / Math.max(.5,n.dot(new Vector2(-u.y,u.x))))
    return p.clone().addScaledVector(n, side*(gauge/2+.035)*unit*scale)
  }))
  for (const rail of offsets) for(let i=1;i<rail.length;i++) {
    if(detailed && near(rail[i-1].clone().lerp(rail[i],.5))) {
      box(rail[i-1],rail[i],.15,.15,.18,[.24,.25,.26])
      box(rail[i-1],rail[i],.025,.18,.29,[.29,.30,.32])
    }
    box(rail[i-1],rail[i],.07,.29,.33,[.57,.60,.64])
  }
  if (!detailed) return
  if(overhead) for(let i=1;i<line.length;i++) {
    box(line[i-1],line[i],.035,5.6,5.635,[.19,.21,.23])
    box(line[i-1],line[i],.035,6.15,6.185,[.22,.24,.26])
  }
  let carried=.3*unit, count=0
  for(let i=1;i<line.length;i++) {
    const a=line[i-1],d=line[i].clone().sub(a),length=d.length()
    if(length<unit*.001) continue
    const n=new Vector2(-d.y,d.x).multiplyScalar((gauge+.95)*unit/length/2)
    let s=carried
    for(;s<length && count<6000;s+=.6*unit) {
      const p=a.clone().addScaledVector(d,s/length)
      if(!near(p)) continue
      count++
      box(p.clone().sub(n),p.clone().add(n),.24,.015,.15,[.54,.52,.47])
    }
    carried=s-length
  }
}
