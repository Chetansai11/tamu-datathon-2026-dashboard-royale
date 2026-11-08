import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
function inlineCss(css) {
  css=css.replace(/@import\s+url\(['"]?(\/fonts\/[^)'"\s]+)['"]?\)\s*;/g,(_,src)=>inlineCss(fs.readFileSync(path.join(dist,src.slice(1)),'utf8')));
  return css.replace(/url\(['"]?(\/fonts\/[^)'"\s]+\.(?:ttf|woff2?))['"]?\)/g,(_,src)=>{
    const mime=src.endsWith('.ttf')?'font/ttf':src.endsWith('.woff2')?'font/woff2':'font/woff';
    return `url(data:${mime};base64,${fs.readFileSync(path.join(dist,src.slice(1))).toString('base64')})`;
  });
}
let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
html=html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,(_,src)=>{
  const asset=path.join(dist,src.replace(/^\.?\//,''));
  if(!asset.startsWith(dist+path.sep))throw Error('Invalid script asset path');
  return `<script type="module">${fs.readFileSync(asset,'utf8').replace(/<\/script/gi,'<\\/script')}</script>`;
});
html=html.replace(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g,(_,src)=>`<style>${inlineCss(fs.readFileSync(path.join(dist,src.replace(/^\.?\//,'')),'utf8'))}</style>`);
const data=fs.readFileSync(path.join(dist,'data','dashboard.json'),'utf8').replace(/</g,'\\u003c');
const placement=fs.readFileSync(path.join(dist,'data','placement_model.json'),'utf8').replace(/</g,'\\u003c');
html=html.replace('</head>',`<script id="dashboard-payload" type="application/json">${data}</script><script id="placement-payload" type="application/json">${placement}</script></head>`);
fs.writeFileSync(path.join(dist,'offline.html'),html);
if(/(?:src|href)="\/?assets\//.test(html))throw Error('Offline document still references build assets');
console.log(`Offline dashboard packaged: ${(Buffer.byteLength(html)/1e6).toFixed(1)} MB. Open dist/offline.html directly.`);
