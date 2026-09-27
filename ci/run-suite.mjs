import {spawnSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
export const SUITES=Object.freeze(['backend','ui','api-mcp','widgets','package','docs']);

// Same complete-TAP rule as the Creezio module gate; no skipped family is a success.
export function runSuite(name){
  if(!SUITES.includes(name))throw new Error('Unknown module suite.');
  const manifest=JSON.parse(readFileSync(path.join(root,'module/manifest.json'),'utf8'));
  const suite=manifest.validation.suites[name];
  if(suite?.mode!=='required'||!Array.isArray(suite.tests)||suite.tests.length===0)
    throw new Error(`Missing required ${name} tests.`);
  const files=suite.tests.map(relative=>{
    if(typeof relative!=='string'||!relative.startsWith(`tests/${name}/`)
      ||relative.split('/').some(part=>!part||part==='.'||part==='..')||relative.includes('\\'))
      throw new Error('Test path outside its declared suite.');
    let absolute=root;
    for(const part of relative.split('/')){
      absolute=path.join(absolute,part);
      if(lstatSync(absolute).isSymbolicLink())throw new Error('Linked test path.');
    }
    if(!lstatSync(absolute).isFile())throw new Error('Missing test file.');
    return absolute;
  });
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...files],
    {cwd:root,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,windowsHide:true});
  const counts={};
  for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
    const matches=[...(result.stdout??'').matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`,'gm'))];
    counts[key]=matches.length===1?Number(matches[0][1]):null;
  }
  const passed=result.status===0&&counts.tests>0&&counts.pass===counts.tests
    &&['fail','cancelled','skipped','todo'].every(key=>counts[key]===0);
  if(!passed)throw new Error(`Suite ${name} failed or incomplete.\n${result.stdout??''}\n${result.stderr??''}\n${result.error?.message??''}`);
  return {suite:name,status:'passed',counts};
}
