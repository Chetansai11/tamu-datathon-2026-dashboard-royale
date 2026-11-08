/** Resource-lifecycle regression: GPU work must not restart on reveal or pause. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM, VirtualConsole} from 'jsdom';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compiled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import ParticleAce from './src/ParticleAce';
let root=createRoot(document.getElementById('root'));window.time={current:0};window.renderParticle=(enabled,cinema=true)=>root.render(<ParticleAce motionEnabled={enabled} cinematicTime={cinema?window.time:undefined}/>);window.unmountParticle=()=>root.unmount();window.newRoot=()=>{root=createRoot(document.getElementById('root'));};`,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const errors=[], vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window, frames=new Map(), stats={programs:0,deleted:0,draws:0,buffers:[]}, uniforms={};
let clock=0,id=0,hidden=false,lost=false;
w.setImmediate=(...a)=>setImmediate(...a); w.clearImmediate=v=>clearImmediate(v);
w.requestAnimationFrame=cb=>{frames.set(++id,cb);return id;};w.cancelAnimationFrame=id=>frames.delete(id);
Object.defineProperty(w.document,'hidden',{get:()=>hidden});
w.ResizeObserver=class {constructor(cb){this.cb=cb;}observe(){this.cb([]);}disconnect(){}};
w.HTMLElement.prototype.getBoundingClientRect=()=>({width:1440,height:1000,left:0,top:0});
w.WebGLRenderingContext=function(){};
const gpu={createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,
  createProgram:()=>{stats.programs++;return{};},attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},
  createBuffer:()=>({}),bindBuffer(){},bufferData:(_target,data)=>stats.buffers.push(data),getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},getUniformLocation:(_p,name)=>name,
  clearColor(){},enable(){},blendFuncSeparate(){},disable(){},clear(){},isContextLost:()=>lost,
  uniform1f:(key,value)=>uniforms[key]=value,uniform2f(){},uniform4fv(){},drawArrays:()=>stats.draws++,viewport(){},deleteBuffer(){},deleteProgram:()=>stats.deleted++,deleteShader(){}};
w.HTMLCanvasElement.prototype.getContext=()=>gpu;
const settle=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
async function advance(ms){for(let t=0;t<ms;t+=16){clock+=16;const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(clock));await settle();}}
async function render(enabled,cinema=true){w.renderParticle(enabled,cinema);await settle();}
w.eval(compiled.outputFiles[0].text);
await render(true);
assert.equal(stats.programs,1);
assert.equal(stats.buffers.length,1);
await advance(200);
assert.equal(stats.draws,0,'Invisible particles do not compete with the falling cards');
assert.equal(w.document.querySelector('svg'),null,'Working WebGL does not construct an SVG fallback');
w.time.current=2800;await advance(32);
assert.ok(stats.draws>0,'Visible particles render');
assert.equal(uniforms.uTime,2.8);
await render(false);const drawAtPause=stats.draws;
await advance(100);
assert.equal(stats.draws,drawAtPause,'Paused renderer schedules no additional draws');
assert.equal(stats.programs,1,'Pause does not compile new shaders');
await render(true);await advance(32);
assert.equal(stats.programs,1,'Resume reuses the existing GPU program');
assert.equal(stats.buffers.length,1,'Resume does not regenerate or upload geometry');
assert.equal(uniforms.uTime,2.8,'Frozen cinematic pose stays unchanged across pause');
hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));const hiddenDraws=stats.draws;await advance(100);
assert.equal(stats.draws,hiddenDraws,'Hidden tabs suspend GPU rendering');
hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));await advance(32);
assert.equal(stats.programs,1,'Visibility restoration preserves GPU resources');
w.time.current=0;const replayDraws=stats.draws;await advance(32);
assert.equal(stats.draws,replayDraws,'Replaying the card phase stops invisible particle draws');
const initialBuffer=stats.buffers[0];
lost=true;w.document.querySelector('canvas').dispatchEvent(new w.Event('webglcontextlost',{cancelable:true}));await settle();
assert.ok(w.document.querySelector('svg'),'Context loss displays native particle fallback');
lost=false;w.document.querySelector('canvas').dispatchEvent(new w.Event('webglcontextrestored'));await settle();
assert.equal(stats.programs,2,'Context restoration alone rebuilds the program');
assert.ok(stats.buffers[1]===initialBuffer,'Restoration reuses cached geometry');
w.unmountParticle();await settle();assert.equal(frames.size,0,'Unmount cancels all frame loops');
assert.equal(stats.deleted,2,'Both program lifetimes are cleaned up');
w.newRoot();await render(false,false);const heroPrograms=stats.programs;
assert.equal(uniforms.uFormation,1.15,'Covered hero is already formed');
await render(true,false);await advance(32);
assert.equal(stats.programs,heroPrograms,'Hero reveal keeps the prepared GPU resources');
assert.equal(uniforms.uFormation,1.15,'Hero reveal does not reassemble its particles');
w.unmountParticle();await settle();
assert.equal(frames.size,0);assert.deepEqual(errors,[]);dom.window.close();
console.log('PASS: persistent GPU resources, cached geometry, transparent-frame suppression, pause/visibility/replay, context recovery, formed hero handoff and cleanup.');
