import { useEffect, useRef, useState, type MutableRefObject } from 'react';

type Props = { motionEnabled: boolean; className?: string; cinematicTime?: MutableRefObject<number> };
const smooth = (start: number, end: number, time: number) => {
  const value = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return value * value * (3 - 2 * value);
};
function cinematicFrame(time: number, height: number) {
  // Start at the printed ace's physical size, then move through the same
  // sculptural particles used on the dashboard. Projection happens on the GPU.
  const initialScale = 180 / (Math.max(320, height) * .81);
  const approach = smooth(2100, 3000, time);
  return {
    scale: initialScale * Math.pow(1.05 / initialScale, approach) * (1 + 4.5 * smooth(2950, 4400, time)),
    formation: 1.15 * smooth(2050, 2730, time),
    opacity: smooth(2090, 2440, time) * (1 - .45 * smooth(3700, 4700, time)),
  };
}

// Original geometry: a rounded, inflated spade, sampled deterministically.
// Cursor motion uses decaying local vortices in the vertex shader, not a fluid solver.
const vertex = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aScatter;
attribute vec4 aSeed;
uniform float uTime;
uniform float uFormation;
uniform float uMotion;
uniform float uAspect;
uniform float uDpr;
uniform float uHeight;
uniform float uScale;
uniform float uOpacity;
uniform float uCinema;
uniform float uTrailsActive;
uniform vec2 uGaze;
uniform vec4 uTrails[8];
varying vec3 vColor;
varying float vAlpha;

mat3 rotateY(float a) { float c=cos(a),s=sin(a); return mat3(c,0.,-s,0.,1.,0.,s,0.,c); }
mat3 rotateX(float a) { float c=cos(a),s=sin(a); return mat3(1.,0.,0.,0.,c,s,0.,-s,c); }
void main() {
  float assemble=smoothstep(0.,1.,clamp(uFormation-aSeed.w*.13,0.,1.));
  vec3 p=mix(mix(aScatter,aPosition+aScatter*.09,uCinema),aPosition,assemble);
  float t=uTime*uMotion;
  p += vec3(sin(t*.27+p.y*4.+aSeed.x*6.),cos(t*.24+p.x*3.+aSeed.y*6.),sin(t*.21+aSeed.z*6.))*.009*uMotion;
  p=rotateY(.23+sin(t*.12)*.27+uGaze.x*.12)*rotateX(-.13+uGaze.y*.055)*p;
  float angle=-.075+sin(t*.085)*.025;
  p.xy=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*p.xy;
  float viewDistance=3.25-p.z;
  vec2 screen=vec2(p.x/uAspect,p.y)*2.8/viewDistance;
  if(uTrailsActive>.5) for(int i=0;i<8;i++) {
    vec4 trail=uTrails[i];
    float age=max(0.,uTime-trail.z);
    vec2 delta=vec2((screen.x-trail.x)*uAspect,screen.y-trail.y);
    float radius=dot(delta,delta);
    float force=exp(-radius*18.)*exp(-age*2.15)*trail.w*uMotion;
    vec2 swirl=vec2(-delta.y,delta.x)*(.9+sin(age*3.));
    p.xy += (swirl+delta*.46)*force*.32;
    p.z += sin(age*4.+aSeed.x*4.)*force*.035;
  }
  viewDistance=3.25-p.z;
  gl_Position=vec4(p.x*2.8*uScale/uAspect,p.y*2.8*uScale,0.,viewDistance);
  float glimmer=pow(aSeed.z,18.);
  float rim=1.-step(.14,aSeed.w);
  float size=mix(1.5,2.85,aSeed.y)+glimmer*.55+rim*.3;
  gl_PointSize=clamp(size*uDpr*(uHeight/760.)*(3.25/viewDistance)*sqrt(uScale),.8,7.0*uDpr);
  float front=smoothstep(-.24,.27,aPosition.z);
  vec3 silver=mix(vec3(.79,.80,.81),vec3(1.,1.,.99),aSeed.y);
  vec3 gold=mix(vec3(.78,.52,.18),vec3(1.,.86,.46),aSeed.y);
  vColor=mix(silver,gold,step(.30,aSeed.x));
  float shimmer=1.+sin(t*.65+aSeed.y*30.)*.12*glimmer;
  vColor*=mix(.68,1.16,front)*shimmer+rim*.13;
  vAlpha=mix(.56,.94,aSeed.y)*mix(.6,1.,front)*mix(.3,1.,assemble);
  vAlpha=min(1.,vAlpha+rim*.2);
  vAlpha*=mix(1.,.32,step(.95,aSeed.w));
  vAlpha*=uOpacity;
}`;

const fragment = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 point=gl_PointCoord*2.-1.;
  float r=dot(point,point);
  if(r>1.) discard;
  float soft=pow(1.-r,.65);
  float sphere=.72+.28*max(0.,1.-length(point-vec2(-.22,.25)));
  gl_FragColor=vec4(vColor*sphere,vAlpha*soft);
}`;

type Point = [number, number];
function spadeContour(): Point[] {
  const result: Point[] = [];
  const curves = [
    [100,12,84,35,35,63,35,99], [35,99,35,134,74,146,94,118],
    [94,118,93,142,85,158,71,174], [71,174,90,174,110,174,129,174],
    [129,174,115,158,107,142,106,118], [106,118,126,146,165,134,165,99],
    [165,99,165,63,116,35,100,12],
  ];
  for (const c of curves) for (let i = 0; i < 40; i++) {
    const t = i / 40, k = 1 - t;
    const x = k*k*k*c[0] + 3*k*k*t*c[2] + 3*k*t*t*c[4] + t*t*t*c[6];
    const y = k*k*k*c[1] + 3*k*k*t*c[3] + 3*k*t*t*c[5] + t*t*t*c[7];
    result.push([(x - 100) / 86, (93 - y) / 86]);
  }
  return result;
}

const geometryCache = new Map<number, Float32Array>();
function makeGeometry(count: number) {
  const cached = geometryCache.get(count);
  if (cached) return cached;
  const contour = spadeContour();
  let seed = 691017;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const inside = (x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const a = contour[i], b = contour[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  const data = new Float32Array(count * 10);
  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, z = 0;
    const rim = i < count * .19;
    const dust = i >= count * .95;
    if (dust) {
      const theta = random() * Math.PI * 2, radius = .5 + random() * .9;
      x = Math.cos(theta) * radius; y = Math.sin(theta) * radius; z = (random() - .5) * .8;
    } else if (rim) {
      const at = random() * contour.length, index = Math.floor(at), fraction = at - index;
      const a = contour[index], b = contour[(index+1)%contour.length];
      x = a[0] + (b[0]-a[0])*fraction; y = a[1] + (b[1]-a[1])*fraction;
      // A narrow scattered rim keeps the silhouette luminous without a solid stroke.
      x += (random()-.5)*.026; y += (random()-.5)*.026; z=(random()-.5)*.055;
    } else {
      do { x = (random() - .5) * 1.54; y = (random() - .5) * 1.9; } while (!inside(x, y));
      let distanceSquared = 25;
      for (const p of contour) { const dx=x-p[0],dy=y-p[1];distanceSquared=Math.min(distanceSquared,dx*dx+dy*dy); }
      const bulge = .28 * Math.sqrt(Math.min(1, Math.sqrt(distanceSquared) / .32));
      z = bulge * (random() > .5 ? 1 : -1) + Math.sin(y * 2.3) * .035;
      z += (random() - .5) * .018;
    }
    const offset = i * 10;
    data.set([x,y,z,(random()-.5)*4.4,(random()-.5)*3.2,(random()-.5)*2.8,random(),random(),random(),dust ? .95+random()*.05 : rim ? .02+random()*.1 : .2+random()*.74], offset);
  }
  geometryCache.set(count, data);
  return data;
}

// The CPU fallback is real point geometry, not a filled substitute silhouette.
// Three batched paths keep it light even on machines without a WebGL context.
let cachedFallbackPaths: string[] | undefined;
function makeFallbackPaths() {
  if (cachedFallbackPaths) return cachedFallbackPaths;
  const geometry = makeGeometry(1700), paths = ['', '', ''];
  for (let i = 0; i < geometry.length; i += 10) {
    const x = 200 + geometry[i] * 165, y = 200 - geometry[i + 1] * 165;
    const radius = .55 + geometry[i + 7] * .65;
    const color = geometry[i + 6] >= .3 ? 2 : geometry[i + 7] > .4 ? 0 : 1;
    paths[color] += `M${(x-radius).toFixed(2)} ${y.toFixed(2)}a${radius.toFixed(2)} ${radius.toFixed(2)} 0 1 0 ${(2*radius).toFixed(2)} 0a${radius.toFixed(2)} ${radius.toFixed(2)} 0 1 0 ${(-2*radius).toFixed(2)} 0`;
  }
  cachedFallbackPaths = paths;
  return paths;
}

export default function ParticleAce({ motionEnabled, className = '', cinematicTime }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallbackSvg = useRef<SVGSVGElement>(null);
  const fallbackArt = useRef<SVGGElement>(null);
  const heroHasFormed = useRef(false);
  const motion = useRef(motionEnabled);
  motion.current = motionEnabled;
  const synchronizeGpu = useRef<() => void>(() => {});
  // Do not construct a second SVG particle tree while a WebGL context starts.
  // Its geometry is generated once, only if this device actually needs it.
  const [fallback, setFallback] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);
  const fallbackPaths = fallback ? makeFallbackPaths() : [];

  useEffect(() => {
    if (!fallback || !cinematicTime || !fallbackArt.current) return;
    let frame = 0, width = 1100, height = 760, previousTime = -1;
    const paint = () => {
      frame = 0;
      const node = fallbackArt.current;
      if (!node || document.hidden) return;
      const time = cinematicTime.current;
      if (time !== previousTime) {
        const state = cinematicFrame(time, height);
        node.setAttribute('transform', `translate(${width / 2} ${height / 2}) scale(${state.scale * height / 400}) rotate(-4) translate(-200 -200)`);
        node.setAttribute('opacity', String(state.opacity));
        previousTime = time;
      }
      if (motion.current) frame = requestAnimationFrame(paint);
    };
    const visibility = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!document.hidden) paint();
    };
    const resize = () => {
      const bounds = host.current?.getBoundingClientRect();
      height = bounds?.height || 760; width = bounds?.width || 1100;
      fallbackSvg.current?.setAttribute('viewBox', `0 0 ${width} ${height}`);
      previousTime = -1;
      visibility();
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (host.current) observer?.observe(host.current);
    resize();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', resize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
    };
  }, [fallback, cinematicTime, motionEnabled]);

  useEffect(() => {
    const element = canvas.current, wrapper = host.current;
    if (!element || !wrapper) return;
    if (typeof window.WebGLRenderingContext === 'undefined') { setFallback(true); return; }
    let gl: WebGLRenderingContext | null = null;
    try { gl = element.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power', premultipliedAlpha: false }); } catch { setFallback(true); return; }
    if (!gl) { setFallback(true); return; }
    const gpu = gl;
    let frame = 0, disposed = false, visible = true, elapsed = 0, previous = 0, width = 1, height = 1, dpr = 1, hasPixels = false;
    let lastSplat = -1, lastPointer: Point | null = null;
    const gaze = [0,0], targetGaze = [0,0];
    const trails = new Float32Array(32);
    for (let i=0;i<8;i++) trails[i*4+2]=-100;
    let trailIndex = 0;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
    const compile = (type: number, source: string) => {
      const shader = gpu.createShader(type);
      if (!shader) throw new Error('Shader allocation unavailable');
      shaders.push(shader); gpu.shaderSource(shader, source); gpu.compileShader(shader);
      if (!gpu.getShaderParameter(shader, gpu.COMPILE_STATUS)) throw new Error('Particle shader unavailable');
      return shader;
    };
    try {
      program = gpu.createProgram();
      if (!program) throw new Error('Program allocation unavailable');
      gpu.attachShader(program, compile(gpu.VERTEX_SHADER, vertex));
      gpu.attachShader(program, compile(gpu.FRAGMENT_SHADER, fragment));
      gpu.linkProgram(program);
      if (!gpu.getProgramParameter(program, gpu.LINK_STATUS)) throw new Error('Particle program unavailable');
      gpu.useProgram(program);
      const count = window.innerWidth <= 760 ? 8000 : cinematicTime ? 20000 : 32000;
      buffer = gpu.createBuffer();
      if (!buffer) throw new Error('Buffer allocation unavailable');
      gpu.bindBuffer(gpu.ARRAY_BUFFER, buffer);
      gpu.bufferData(gpu.ARRAY_BUFFER, makeGeometry(count), gpu.STATIC_DRAW);
      for (const [name, size, offset] of [['aPosition',3,0],['aScatter',3,12],['aSeed',4,24]] as const) {
        const location = gpu.getAttribLocation(program, name);
        if (location >= 0) { gpu.enableVertexAttribArray(location); gpu.vertexAttribPointer(location, size, gpu.FLOAT, false, 40, offset); }
      }
      const uniforms = Object.fromEntries(['uTime','uFormation','uMotion','uAspect','uDpr','uHeight','uScale','uOpacity','uCinema','uTrailsActive','uGaze','uTrails[0]'].map(name => [name,gpu.getUniformLocation(program!,name)]));
      gpu.clearColor(0,0,0,0); gpu.enable(gpu.BLEND); gpu.blendFuncSeparate(gpu.SRC_ALPHA,gpu.ONE,gpu.ONE,gpu.ONE_MINUS_SRC_ALPHA);
      gpu.disable(gpu.DEPTH_TEST);
      const draw = () => {
        if (disposed || gpu.isContextLost()) return;
        const state = cinematicTime ? cinematicFrame(cinematicTime.current, height) : null;
        // The deck occupies the first 2.09s. Drawing invisible points then only
        // competes with its card layers; clear once on replay and wait for light.
        if (state && state.opacity <= 0) {
          if (hasPixels) gpu.clear(gpu.COLOR_BUFFER_BIT);
          hasPixels = false;
          return;
        }
        gpu.clear(gpu.COLOR_BUFFER_BIT);
        const formation = state ? state.formation : motion.current && !heroHasFormed.current ? Math.min(1.15,elapsed / 2.45) : 1.15;
        if (!cinematicTime && formation >= 1.15) heroHasFormed.current = true;
        gpu.uniform1f(uniforms.uTime, cinematicTime ? cinematicTime.current / 1000 : elapsed);
        gpu.uniform1f(uniforms.uFormation, formation);
        // Active time freezes on pause. Keep deformation enabled so the frozen
        // pose stays unchanged, rather than snapping to a zero-time orientation.
        gpu.uniform1f(uniforms.uMotion, 1);
        gpu.uniform1f(uniforms.uScale, state?.scale ?? 1);
        gpu.uniform1f(uniforms.uOpacity, state?.opacity ?? 1);
        gpu.uniform1f(uniforms.uCinema, cinematicTime ? 1 : 0);
        gpu.uniform1f(uniforms.uTrailsActive, !cinematicTime && lastSplat >= 0 && elapsed - lastSplat < 5 ? 1 : 0);
        gpu.uniform1f(uniforms.uAspect, width / height);
        gpu.uniform1f(uniforms.uDpr, dpr);
        gpu.uniform1f(uniforms.uHeight, height);
        gpu.uniform2f(uniforms.uGaze, gaze[0], gaze[1]);
        gpu.uniform4fv(uniforms['uTrails[0]'], trails);
        gpu.drawArrays(gpu.POINTS, 0, count);
        hasPixels = true;
      };
      const tick = (now: number) => {
        frame = 0;
        if (disposed || !visible || document.hidden || !motion.current) return;
        if (!cinematicTime && previous) elapsed += Math.min((now - previous) / 1000, .05);
        previous = now;
        gaze[0] += (targetGaze[0] - gaze[0]) * .04; gaze[1] += (targetGaze[1] - gaze[1]) * .04;
        draw(); frame = requestAnimationFrame(tick);
      };
      const synchronize = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0; previous = 0;
        if (!disposed && visible && !document.hidden) {
          if (motion.current) frame = requestAnimationFrame(tick); else draw();
        }
      };
      const resize = () => {
        const rect = wrapper.getBoundingClientRect(); width = Math.max(1,rect.width); height = Math.max(1,rect.height);
        dpr = Math.min(window.devicePixelRatio || 1,1.5);
        const pixelWidth = Math.round(width*dpr), pixelHeight = Math.round(height*dpr);
        if (element.width !== pixelWidth || element.height !== pixelHeight) {
          element.width = pixelWidth; element.height = pixelHeight;
          gpu.viewport(0,0,pixelWidth,pixelHeight); hasPixels = false;
        }
        if (visible && !document.hidden) draw();
      };
      const pointer = (event: PointerEvent) => {
        if (cinematicTime || !motion.current || !visible || document.hidden) return;
        const rect = wrapper.getBoundingClientRect();
        const nx=(event.clientX-rect.left)/rect.width*2-1, ny=1-(event.clientY-rect.top)/rect.height*2;
        if (Math.abs(nx)>1 || Math.abs(ny)>1) { targetGaze[0]=0;targetGaze[1]=0;lastPointer=null;return; }
        targetGaze[0]=nx; targetGaze[1]=ny;
        const movement=lastPointer ? Math.hypot(nx-lastPointer[0],ny-lastPointer[1]) : .02;
        lastPointer=[nx,ny];
        if (elapsed-lastSplat<.055 || movement<.001) return;
        lastSplat=elapsed;
        trails.set([nx,ny,elapsed,Math.min(1.5,movement*40+.15)],trailIndex*4);
        trailIndex=(trailIndex+1)%8;
      };
      const lost = (event: Event) => { event.preventDefault(); if(frame)cancelAnimationFrame(frame); frame=0;setFallback(true); };
      const restored = () => setContextVersion(value=>value+1);
      const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
      const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);synchronize();},{threshold:.01}) : null;
      resizeObserver?.observe(wrapper); observer?.observe(wrapper);
      window.addEventListener('resize',resize);
      if (!cinematicTime) window.addEventListener('pointermove',pointer,{passive:true});
      document.addEventListener('visibilitychange',synchronize);
      element.addEventListener('webglcontextlost',lost);element.addEventListener('webglcontextrestored',restored);
      synchronizeGpu.current = synchronize;
      resize(); setFallback(false); synchronize();
      return () => {
        disposed=true;if(frame)cancelAnimationFrame(frame);
        synchronizeGpu.current = () => {};
        observer?.disconnect();resizeObserver?.disconnect();
        window.removeEventListener('resize',resize);window.removeEventListener('pointermove',pointer);
        document.removeEventListener('visibilitychange',synchronize);
        element.removeEventListener('webglcontextlost',lost);element.removeEventListener('webglcontextrestored',restored);
        if(buffer)gpu.deleteBuffer(buffer);if(program)gpu.deleteProgram(program);shaders.forEach(shader=>gpu.deleteShader(shader));
      };
    } catch {
      if(buffer)gpu.deleteBuffer(buffer);if(program)gpu.deleteProgram(program);shaders.forEach(shader=>gpu.deleteShader(shader));
      setFallback(true);
    }
  }, [contextVersion, cinematicTime]);

  // Motion changes only suspend/resume the existing renderer. In particular,
  // the dashboard reveal must not rebuild 32k vertices and compile shaders.
  useEffect(() => { synchronizeGpu.current(); }, [motionEnabled]);

  return <div ref={host} className={`particle-ace ${className}`} aria-hidden="true" style={{width:'100%',height:'100%',pointerEvents:'none'}}>
    <canvas ref={canvas} style={{display:fallback?'none':'block',width:'100%',height:'100%'}}/>
    {fallback && <svg ref={fallbackSvg} viewBox="0 0 400 400" style={{display:'block',width:'100%',height:'100%',overflow:'visible'}}>
      <g ref={fallbackArt} opacity={cinematicTime ? 0 : .85}>
        <path d={fallbackPaths[0]} fill="#fafbf8"/>
        <path d={fallbackPaths[1]} fill="#c6c9ca"/>
        <path d={fallbackPaths[2]} fill="#eac16b"/>
      </g>
    </svg>}
  </div>;
}
