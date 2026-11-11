// The sphere: one triangle and a ray-sphere shader sampling an equirectangular
// land mask drawn at runtime. No three.js, no tiles, no images.
const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FS = `precision highp float;
uniform vec2 c;uniform float R,lat0,lng0,dots;uniform vec3 ocean,land,glow;uniform sampler2D mask;
const float PI=3.14159265;
void main(){
  vec2 q=(gl_FragCoord.xy-c)/R;float r=length(q);
  if(r>1.){float g=pow(max(0.,1.-(r-1.)/.09),3.)*.32;gl_FragColor=vec4(glow*g,g);return;}
  vec3 n=vec3(q,sqrt(max(0.,1.-r*r)));
  float s0=sin(lat0),c0=cos(lat0);
  float phi=asin(clamp(n.y*c0+n.z*s0,-1.,1.));
  float lam=lng0+atan(n.x,n.z*c0-n.y*s0);
  float u=fract((lam+PI)/(2.*PI)),v=(PI/2.-phi)/PI;
  float m;
  if(dots>.5){
    float rows=110.;float y=v*rows;float row=floor(y);
    float la=PI/2.-(row+.5)/rows*PI;float cols=max(1.,floor(rows*2.*cos(la)));
    float x=u*cols;float cl=floor(x);
    vec2 d=vec2((x-cl-.5)*2.*cos(la)*rows/cols,y-row-.5);
    float on=step(.5,texture2D(mask,vec2((cl+.5)/cols,(row+.5)/rows)).r);
    m=on*(1.-smoothstep(.27,.40,length(d)));
  } else m=smoothstep(.38,.62,texture2D(mask,vec2(u,v)).r);
  vec3 col=mix(ocean,land,m);
  col=mix(col,glow,pow(r,3.5)*.28);
  col*=.86+.14*n.z;
  float a=clamp((1.-r)*R/1.5,0.,1.);
  float e=.32*(1.-a);
  gl_FragColor=vec4(col*a+glow*e,a+e);
}`

export interface GlobeUniforms { R: number; cx: number; cy: number; lat: number; lng: number; dots: boolean; ocean: number[]; land: number[]; glow: number[] }

export class GlobeGL {
  readonly gl: WebGLRenderingContext
  private u: Record<string, WebGLUniformLocation | null> = {}
  constructor(readonly canvas: HTMLCanvasElement, mask: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: true })
    if (!gl) throw new Error('no webgl')
    this.gl = gl
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('shader')
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const at = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
    for (const n of ['c', 'R', 'lat0', 'lng0', 'dots', 'ocean', 'land', 'glow', 'mask']) this.u[n] = gl.getUniformLocation(prog, n)
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.clearColor(0, 0, 0, 0)
  }
  draw(v: GlobeUniforms): void {
    const { gl, u } = this
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(u.c, v.cx, this.canvas.height - v.cy); gl.uniform1f(u.R, v.R)
    gl.uniform1f(u.lat0, v.lat * Math.PI / 180); gl.uniform1f(u.lng0, v.lng * Math.PI / 180); gl.uniform1f(u.dots, v.dots ? 1 : 0)
    gl.uniform3fv(u.ocean, v.ocean); gl.uniform3fv(u.land, v.land); gl.uniform3fv(u.glow, v.glow)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
