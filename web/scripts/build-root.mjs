import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.dirname(web);
for(const args of [['node_modules/typescript/bin/tsc','--build'],['node_modules/vite/bin/vite.js','build'],['scripts/package-offline.mjs']]){
  const result=spawnSync(process.execPath,args,{cwd:web,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
fs.cpSync(path.join(web,'dist'),path.join(root,'dist'),{recursive:true});
// Remove only obsolete generated JS/CSS assets after a successful copy.
const targetAssets=path.join(root,'dist','assets');
for(const name of fs.readdirSync(targetAssets)) {
  const target=path.resolve(targetAssets,name);
  if(!target.startsWith(path.resolve(root,'dist')+path.sep))throw Error('Generated asset escaped dist');
  if(/^[\w-]+\.(?:js|css)$/.test(name)&&!fs.existsSync(path.join(web,'dist','assets',name))) fs.unlinkSync(target);
}
console.log('Static deployment copied to repository dist/.');
