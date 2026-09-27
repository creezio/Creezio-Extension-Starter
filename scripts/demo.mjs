#!/usr/bin/env node
/** Prepare one real Creezio application from a pinned public source archive. */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,statfsSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {tarFiles} from './package.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const demo=path.join(root,'demo');
const app=path.join(demo,'app');
const defaultSourceLockPath=path.join(demo,'source-lock.json');
const sourceStamp=path.join(app,'.creezio','demo-source.json');
const installStamp=path.join(app,'.creezio','demo-install.json');
const compositionPath='configuration/composition.t30-demo.json';
const inventoryPath='configuration/module-inventory.json';
const receiptPath='.creezio/packages/manifest.json';
const sdkSpec='file:.creezio/packages/creezio-sdk-1.0.0.tgz';
const moduleSpec='file:.creezio/packages/creezio-purchase-requests-0.1.0.tgz';
const moduleId='creezio.purchase-requests';
const moduleOrigin='https://github.com/creezio/Creezio-Extension-Starter';
const sha=bytes=>`sha256-${createHash('sha256').update(bytes).digest('hex')}`;
const fail=message=>{throw new Error(`Demo refused: ${message}`);};
const within=(base,target)=>target===base||target.startsWith(`${base}${path.sep}`);
const hex=/^sha256-[a-f0-9]{64}$/;
const revision=/^[a-f0-9]{40}$/;
const safeRelative=value=>typeof value==='string'&&value.length>0&&value.length<=1024
  &&!value.includes('\\')&&!value.includes(':')&&!value.startsWith('/')
  &&!/[\u0000-\u001f\u007f<>|?*]/.test(value)
  &&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)
    &&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));

function regular(base,relative){
  if(!safeRelative(relative))fail(`unsafe path: ${relative}`);
  let current=base;
  if(!existsSync(current)||!lstatSync(current).isDirectory()||lstatSync(current).isSymbolicLink())fail('unsafe root');
  for(const part of relative.split('/')){
    current=path.join(current,part);
    if(!existsSync(current)||lstatSync(current).isSymbolicLink())fail(`missing or linked: ${relative}`);
  }
  if(!lstatSync(current).isFile())fail(`not a regular file: ${relative}`);
  return current;
}
function directory(base,relative){
  if(!safeRelative(relative))fail('unsafe directory');
  let current=base;
  for(const part of relative.split('/')){
    current=path.join(current,part);
    if(existsSync(current)&&(!lstatSync(current).isDirectory()||lstatSync(current).isSymbolicLink()))fail(`linked or non-directory: ${relative}`);
    if(!existsSync(current))mkdirSync(current);
  }
  return current;
}
function json(file){return JSON.parse(readFileSync(file,'utf8'));}
function writeJson(file,value){writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,{flag:'wx'});}
function exact(file,digest){
  if(!hex.test(digest)||sha(readFileSync(file))!==digest)fail(`integrity differs: ${file}`);
}
function command(program,args,cwd,env=process.env){
  const result=spawnSync(program,args,{cwd,env,encoding:'utf8',windowsHide:true,stdio:'inherit'});
  if(result.status!==0)fail(`${program} ${args.join(' ')} failed (${result.status??result.error?.message})`);
}
function npm(args,cwd){
  const cli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  if(!existsSync(cli))fail('npm CLI unavailable');
  command(process.execPath,[cli,...args],cwd);
}
function disk(){
  const {bavail,bsize}=statfsSync(demo);
  if(BigInt(bavail)*BigInt(bsize)<20n*1024n**3n)fail('less than 20 GiB free before extraction or installation');
}
function externalFile(file){
  if(typeof file!=='string'||!path.isAbsolute(file))fail('archive or source lock path must be absolute');
  for(let cursor=path.resolve(file);;cursor=path.dirname(cursor)){
    if(existsSync(cursor)&&lstatSync(cursor).isSymbolicLink())fail('linked external path');
    if(cursor===path.dirname(cursor))break;
  }
  if(!existsSync(file)||!lstatSync(file).isFile())fail(`missing external file: ${file}`);
  return file;
}
function sourceLock(file,sdkArchive){
  if(!existsSync(file))fail('real demo source lock is required');
  const source=externalFile(file);
  if(lstatSync(source).size>16*1024)fail('source lock exceeds bound');
  const lock=json(source);
  if(lock.schemaVersion!==1||!revision.test(lock.core?.revision)
    ||lock.core.repository!=='https://github.com/creezio/Creezio-D1R2'
    ||lock.core.url!==`https://codeload.github.com/creezio/Creezio-D1R2/tar.gz/${lock.core.revision}`
    ||!hex.test(lock.core.integrity)||!hex.test(lock.sdk?.integrity)
    ||(lock.sdk.url!==undefined&&!/^https:\/\/github\.com\/creezio\/Creezio-D1R2\/releases\/download\/[^?#]+\/[^/?#]+\.tgz$/.test(lock.sdk.url))
    ||(!lock.sdk.url&&!sdkArchive)
    ||!hex.test(lock.module?.runtimeIntegrity)||!hex.test(lock.module?.validationIntegrity)
    ||!hex.test(lock.module?.receiptIntegrity))fail('invalid source lock');
  return lock;
}
export function sourceEntries(gzip,revision){
  if(!/^[a-f0-9]{40}$/.test(revision))fail('invalid source revision');
  const data=gunzipSync(gzip,{maxOutputLength:256*1024*1024});
  const entries=[],seen=new Set();let paxPath=null,top=null,globalSeen=false,terminated=false;
  for(let offset=0;offset+512<=data.length;){
    const header=data.subarray(offset,offset+512);
    if(header.every(byte=>byte===0)){
      if(data.subarray(offset).some(byte=>byte!==0))fail('source tar trailer');
      terminated=true;break;
    }
    const number=(start,length)=>parseInt(header.subarray(start,start+length).toString('ascii').replace(/\0.*$/,'').trim(),8);
    const expected=number(148,8),copy=Buffer.from(header);copy.fill(32,148,156);
    if(!Number.isSafeInteger(expected)||copy.reduce((sum,byte)=>sum+byte,0)!==expected)fail('source tar checksum');
    const length=number(124,12),type=String.fromCharCode(header[156]);
    if(!Number.isSafeInteger(length)||length<0||offset+512+length>data.length)fail('source tar size');
    const payload=data.subarray(offset+512,offset+512+length);
    const name=header.subarray(0,100).toString('utf8').replace(/\0.*$/,'');
    const prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/,'');
    const full=paxPath??(prefix?`${prefix}/${name}`:name);
    if(type==='g'){
      const record=payload.toString('utf8'),match=/^(\d+) comment=([a-f0-9]{40})\n$/.exec(record);
      if(globalSeen||offset!==0||!match||Number(match[1])!==payload.length||match[2]!==revision)
        fail('unexpected source global PAX header');
      globalSeen=true;
    }else if(type==='x'){
      const match=payload.toString('utf8').match(/(?:^|\n)\d+ path=([^\n]+)\n/);
      if(!match)fail('unsupported source PAX entry');
      paxPath=match[1];
    }else if(type==='0'||type==='\0'||type==='5'){
      paxPath=null;
      const parts=full.replace(/\/$/,'').split('/');
      if(!top)top=parts[0];
      if(parts[0]!==top||top!==`Creezio-D1R2-${revision}`)fail('unexpected source archive root');
      const relative=parts.slice(1).join('/');
      if(relative){
        const key=relative.toLowerCase();
        if(!safeRelative(relative)||seen.has(key))fail('unsafe or duplicate source path');
        seen.add(key);
        entries.push({path:relative,type:type==='5'?'directory':'file',bytes:Buffer.from(payload)});
      }
    }else fail('source archive contains link or unsupported entry');
    if(entries.length>20000)fail('source archive file count');
    offset+=512+Math.ceil(length/512)*512;
  }
  if(!terminated||paxPath!==null||!globalSeen||!top||!entries.some(entry=>entry.path==='package.json'))
    fail('source archive lacks complete Creezio application');
  return entries;
}
async function acquireSource(lock){
  if(existsSync(app)){
    if(lstatSync(app).isSymbolicLink()||!lstatSync(app).isDirectory())fail('demo/app is not a regular directory');
    if(!existsSync(sourceStamp))fail('existing demo/app has no source stamp; preserve and inspect it');
    const existing=json(regular(app,'.creezio/demo-source.json'));
    if(existing.revision!==lock.core.revision||existing.integrity!==lock.core.integrity)fail('existing app has different pinned source');
    return;
  }
  disk();
  const response=await fetch(lock.core.url,{redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length')||0)>128*1024*1024)fail('source archive download');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>128*1024*1024||sha(bytes)!==lock.core.integrity)fail('source archive integrity');
  const entries=sourceEntries(bytes,lock.core.revision);
  mkdirSync(app,{recursive:false});
  for(const entry of entries){
    const parts=entry.path.split('/');
    if(parts.length>1)directory(app,parts.slice(0,-1).join('/'));
    const target=path.join(app,...parts);
    if(!within(app,target))fail(`source path escape: ${entry.path}`);
    if(entry.type==='directory'){
      if(existsSync(target)){if(!lstatSync(target).isDirectory()||lstatSync(target).isSymbolicLink())fail(`source path collision: ${entry.path}`);}
      else mkdirSync(target);
    }else{
      if(existsSync(target))fail(`source path collision: ${entry.path}`);
      writeFileSync(target,entry.bytes,{flag:'wx'});
    }
  }
  directory(app,'.creezio');
  writeJson(sourceStamp,{repository:lock.core.repository,revision:lock.core.revision,integrity:lock.core.integrity});
}
function copyExact(from,to,digest){
  exact(from,digest);
  if(existsSync(to)){if(lstatSync(to).isSymbolicLink()||!lstatSync(to).isFile())fail('linked or non-file package destination');exact(to,digest);}
  else{copyFileSync(from,to);exact(to,digest);}
}
async function downloadExact(url,destination,digest){
  if(existsSync(destination)){exact(destination,digest);return;}
  const response=await fetch(url);
  if(!response.ok||Number(response.headers.get('content-length')||0)>128*1024*1024)fail('package download');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>128*1024*1024||sha(bytes)!==digest)fail('package archive integrity');
  writeFileSync(destination,bytes,{flag:'wx'});
}
async function placePackages(lock,sdkArchive){
  const packageDir=directory(app,'.creezio/packages');
  const rootPackages='.creezio/packages';
  const sdkTarget=path.join(packageDir,'creezio-sdk-1.0.0.tgz');
  if(sdkArchive)copyExact(externalFile(sdkArchive),sdkTarget,lock.sdk.integrity);
  else await downloadExact(lock.sdk.url,sdkTarget,lock.sdk.integrity);
  for(const [name,digest] of [
    ['creezio-purchase-requests-0.1.0.tgz',lock.module.runtimeIntegrity],
    ['creezio-purchase-requests-0.1.0-validation.tgz',lock.module.validationIntegrity],
    ['manifest.json',lock.module.receiptIntegrity]]){
    copyExact(regular(root,`${rootPackages}/${name}`),path.join(packageDir,name),digest);
  }
  const receipt=json(regular(app,receiptPath));
  if(receipt.module?.id!==moduleId||receipt.module?.version!=='0.1.0'
    ||receipt.runtime?.integrity!==lock.module.runtimeIntegrity
    ||receipt.validation?.integrity!==lock.module.validationIntegrity)fail('detached receipt disagrees with locked archives');
}
function verifyInstalled(name,archive){
  const bytes=readFileSync(archive);
  for(const entry of tarFiles(bytes)){
    if(!entry.path.startsWith('package/'))fail('npm archive layout');
    const relative=`node_modules/${name}/${entry.path.slice('package/'.length)}`;
    if(!entry.bytes.equals(readFileSync(regular(app,relative))))fail(`installed bytes differ from pinned ${name} archive`);
  }
}

function configurePackageDependencies(){
  const file=regular(app,'package.json'),pack=json(file);
  if(pack.name!=='creezio-d1r2'||pack.private!==true
    ||pack.workspaces&&JSON.stringify(pack.workspaces)!=='["sdk"]'
    ||pack.devDependencies?.['@creezio/sdk']&&pack.devDependencies['@creezio/sdk']!==sdkSpec
    ||pack.dependencies?.['@creezio/purchase-requests']&&pack.dependencies['@creezio/purchase-requests']!==moduleSpec)
    fail('unexpected demo package dependencies');
  // This application installs the verified SDK archive, not Core's local SDK workspace link.
  delete pack.workspaces;
  pack.devDependencies={...pack.devDependencies,'@creezio/sdk':sdkSpec};
  pack.dependencies={...pack.dependencies,'@creezio/purchase-requests':moduleSpec};
  const bytes=Buffer.from(`${JSON.stringify(pack,null,2)}\n`);
  if(!readFileSync(file).equals(bytes))writeFileSync(file,bytes);
}
function verifyDependencyLock(){
  const pack=json(regular(app,'package.json')),lock=json(regular(app,'package-lock.json'));
  if(pack.workspaces!==undefined||pack.devDependencies?.['@creezio/sdk']!==sdkSpec
    ||pack.dependencies?.['@creezio/purchase-requests']!==moduleSpec
    ||lock.packages?.['']?.workspaces!==undefined
    ||lock.packages[''].devDependencies?.['@creezio/sdk']!==sdkSpec
    ||lock.packages[''].dependencies?.['@creezio/purchase-requests']!==moduleSpec)
    fail('demo package lock does not select the archives');
  for(const [name,spec,version] of [
    ['@creezio/sdk',sdkSpec,'1.0.0'],
    ['@creezio/purchase-requests',moduleSpec,'0.1.0']]){
    const entry=lock.packages[`node_modules/${name}`];
    const archive=regular(app,spec.slice('file:'.length));
    const integrity=`sha512-${createHash('sha512').update(readFileSync(archive)).digest('base64')}`;
    if(!entry||entry.link===true||entry.version!==version||entry.resolved!==spec
      ||entry.integrity!==integrity)fail(`demo package lock differs from ${name} archive`);
  }
}

function configure(){
  const selected=json(regular(app,'configuration/composition.widgets-local.json'));
  const witness=selected.modules.findIndex(item=>item.moduleId==='example.widgets-witness');
  if(witness<0||selected.modules.some(item=>item.moduleId===moduleId))fail('unexpected base widget composition');
  selected.modules.splice(witness,1,{moduleId,origin:moduleOrigin,versionRange:'^0.1.0',
    source:{kind:'package',name:'@creezio/purchase-requests'},enabled:true,configuration:[],integrations:[]});
  for(const audience of ['admin','app']){
    const ids=selected.exposure?.[audience]?.moduleIds;
    if(!Array.isArray(ids)||!ids.includes('example.widgets-witness'))fail('widget exposure missing');
    selected.exposure[audience].moduleIds=ids.map(id=>id==='example.widgets-witness'?moduleId:id);
  }
  const inventory=json(regular(app,'configuration/module-inventory.json'));
  if(inventory.schemaVersion!==1||!Array.isArray(inventory.allowedOrigins)
    ||inventory.allowedOrigins.some(origin=>![moduleOrigin,'https://github.com/creezio/Creezio-D1R2'].includes(origin))
    ||!Array.isArray(inventory.available)||inventory.available.length!==0
    ||inventory.validationReceipts&&Object.keys(inventory.validationReceipts).some(id=>id!==moduleId
      ||inventory.validationReceipts[id]!==receiptPath))fail('module inventory differs from the pinned demo base');
  inventory.allowedOrigins=[...new Set([...inventory.allowedOrigins,moduleOrigin])];
  inventory.validationReceipts={[moduleId]:receiptPath};
  for(const [name,value] of [[compositionPath,selected],[inventoryPath,inventory]]){
    const target=path.join(app,...name.split('/'));
    const bytes=Buffer.from(`${JSON.stringify(value,null,2)}\n`);
    if(existsSync(target)){
      if(lstatSync(target).isSymbolicLink()||!lstatSync(target).isFile())fail(`unsafe demo configuration: ${name}`);
      if(!readFileSync(target).equals(bytes)){
        if(name!==inventoryPath)fail(`existing demo configuration differs: ${name}`);
        writeFileSync(target,bytes);
      }
    }else writeFileSync(target,bytes,{flag:'wx'});
  }
}

/** Install the exact archives without running the composed application build. */
export async function prepareDependencies(options){
  const lock=sourceLock(options.sourceLock,options.sdkArchive);
  await acquireSource(lock);
  if(existsSync(path.join(app,'.wrangler','creezio-local.lock')))fail('local application is in use');
  await placePackages(lock,options.sdkArchive);
  if(!existsSync(installStamp)){
    disk();
    const modules=path.join(app,'node_modules');
    if(existsSync(modules)){
      if(!lstatSync(modules).isDirectory()||lstatSync(modules).isSymbolicLink())fail('unsafe existing dependencies');
    }else npm(['ci'],app);
    configurePackageDependencies();
    // npm now resolves both tarballs from the demo's relative file dependencies.
    // An interrupted preparation reuses node_modules and repairs it incrementally.
    npm(['install','--workspaces=false'],app);
    verifyInstalled('@creezio/sdk',path.join(app,'.creezio/packages/creezio-sdk-1.0.0.tgz'));
    verifyInstalled('@creezio/purchase-requests',path.join(app,'.creezio/packages/creezio-purchase-requests-0.1.0.tgz'));
    directory(app,'.creezio');
    writeJson(installStamp,{sourceRevision:lock.core.revision,sdkIntegrity:lock.sdk.integrity,
      moduleIntegrity:lock.module.runtimeIntegrity});
  }else{
    const stamp=json(regular(app,'.creezio/demo-install.json'));
    if(stamp.sourceRevision!==lock.core.revision||stamp.sdkIntegrity!==lock.sdk.integrity
      ||stamp.moduleIntegrity!==lock.module.runtimeIntegrity)fail('installed app differs from pinned archives');
  }
  verifyDependencyLock();
  verifyInstalled('@creezio/sdk',path.join(app,'.creezio/packages/creezio-sdk-1.0.0.tgz'));
  verifyInstalled('@creezio/purchase-requests',path.join(app,'.creezio/packages/creezio-purchase-requests-0.1.0.tgz'));
  const installedModule=json(regular(app,'node_modules/@creezio/purchase-requests/package.json'));
  if(installedModule.name!=='@creezio/purchase-requests'||installedModule.version!=='0.1.0')fail('installed module identity');
  return lock;
}

async function prepare(options){
  const lock=await prepareDependencies(options);
  configure();
  command(process.execPath,['scripts/modules/lock.mjs','--composition',compositionPath,
    '--inventory',inventoryPath,'--validation-receipt',`${moduleId}=${receiptPath}`,'--write'],app);
  const env={...process.env,CREEZIO_COMPOSITION:compositionPath,
    CREEZIO_COMPOSITION_LOCK:compositionPath.replace(/\.json$/,'.lock.json')};
  command(process.execPath,['scripts/build/compose-runtime.mjs'],app,env);
  command(process.execPath,['scripts/run-framework.mjs','build'],app,env);
  console.log(JSON.stringify({app,sourceRevision:lock.core.revision,composition:compositionPath,
    status:'built; install the native account and run the local app with its persistent D1/R2 state'},null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [action,...rest]=process.argv.slice(2);
  const usage='Usage: node scripts/demo.mjs prepare [--source-lock ABSOLUTE_JSON] [--sdk-archive ABSOLUTE_TGZ]';
  if(action==='--help'&&rest.length===0)console.log(usage);
  else if(action==='prepare'){
    const options={sourceLock:defaultSourceLockPath,sdkArchive:process.env.CREEZIO_SDK_TARBALL};
    let valid=true;
    for(let i=0;i<rest.length;i+=2){
      if(!rest[i+1]||!['--source-lock','--sdk-archive'].includes(rest[i])){valid=false;break;}
      if(rest[i]==='--source-lock')options.sourceLock=rest[i+1];
      else options.sdkArchive=rest[i+1];
    }
    if(!valid){console.error(usage);process.exitCode=1;}
    else prepare(options).catch(error=>{console.error(error.message);process.exitCode=1;});
  }else{console.error(usage);process.exitCode=1;}
}
