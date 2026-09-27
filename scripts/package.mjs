import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,renameSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {assertSupportedSdk} from './sdk-version.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output='.creezio/packages';
const sha256=bytes=>`sha256-${createHash('sha256').update(bytes).digest('hex')}`;
const sha512=bytes=>createHash('sha512').update(bytes).digest('hex');
const fail=message=>{throw new Error(`Package refused: ${message}`);};
const safePath=name=>typeof name==='string'&&name.length>0&&name.length<=1024
  && !name.startsWith('/')&&!name.includes('\\')&&!name.includes(':')
  && !name.split('/').some(part=>!part||part==='.'||part==='..');

export function canonicalJson(value){
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function exactInventory(actual,declared){
  if(!Array.isArray(actual)||!Array.isArray(declared)
    ||new Set(actual).size!==actual.length||new Set(declared).size!==declared.length
    ||[...actual,...declared].some(name=>!safePath(name)))fail('invalid file inventory');
  const missing=declared.filter(name=>!actual.includes(name));
  const extra=actual.filter(name=>!declared.includes(name));
  if(missing.length||extra.length)fail(`inventory mismatch; missing=${missing.join(',')}; extra=${extra.join(',')}`);
}

function confinedFile(base,name){
  if(!safePath(name))fail('unsafe file path');
  let cursor=base;
  if(lstatSync(cursor).isSymbolicLink())fail('linked package root');
  for(const part of name.split('/')){
    cursor=path.join(cursor,part);
    if(!existsSync(cursor)||lstatSync(cursor).isSymbolicLink())fail(`missing or linked ${name}`);
  }
  if(!lstatSync(cursor).isFile())fail(`not a regular file: ${name}`);
  return cursor;
}

function command(program,args,options={}){
  const result=spawnSync(program,args,{cwd:root,encoding:'utf8',timeout:120000,
    maxBuffer:16*1024*1024,windowsHide:true,...options});
  if(result.status!==0)fail(`${program} ${args.join(' ')} failed: ${result.stderr||result.stdout||result.error?.message}`);
  return result.stdout;
}

function sourceProof(manifest){
  const revision=command('git',['rev-parse','HEAD']).trim();
  if(manifest.identity?.source?.kind!=='git'||manifest.identity.source.revision!==revision)
    fail('module source revision differs from Git HEAD');
  if(command('git',['status','--porcelain=v1','--untracked-files=all']).trim())
    fail('source tree has tracked changes or untracked source files');
  const archive=spawnSync('git',['archive','--format=tar','HEAD'],{cwd:root,
    encoding:'buffer',timeout:120000,maxBuffer:256*1024*1024,windowsHide:true});
  if(archive.status!==0)fail(`git archive failed: ${archive.stderr?.toString()||archive.error?.message}`);
  if(sha256(archive.stdout)!==manifest.identity.source.integrity)
    fail('module source digest differs from exact git archive bytes');
  return revision;
}

function sdkProof(packageJson){
  const sdkPath=confinedFile(root,'node_modules/@creezio/sdk/package.json');
  const installed=JSON.parse(readFileSync(sdkPath,'utf8'));
  try{assertSupportedSdk(installed);}catch(error){fail(error.message);}
  if(packageJson.peerDependencies?.['@creezio/sdk']!=='^1.0.0')fail('SDK peer contract');
  const declared=process.env.CREEZIO_SDK_TARBALL;
  if(!declared||!declared.endsWith('.tgz'))fail('CREEZIO_SDK_TARBALL must identify the built SDK npm tarball');
  const tarball=path.resolve(root,declared);
  if(!existsSync(tarball)||lstatSync(tarball).isSymbolicLink()||!lstatSync(tarball).isFile())
    fail('SDK tarball missing or linked');
  const bytes=readFileSync(tarball);
  const entries=tarFiles(bytes);
  if(entries.length===0)fail('empty SDK tarball');
  const manifest=entries.find(entry=>entry.path==='package/package.json');
  if(!manifest)fail('SDK tarball lacks package.json');
  let archived;
  try{archived=JSON.parse(manifest.bytes.toString('utf8'));assertSupportedSdk(archived);}
  catch(error){fail(`SDK tarball identity: ${error.message}`);}
  if(archived.version!==installed.version)fail('SDK tarball version differs from installation');
  if(installed.version==='1.1.0'){
    for(const name of ['context','transport'])for(const file of [
      `package/dist/types/sdk/delivery/${name}.d.ts`,
      `package/dist/esm/delivery/${name}.js`]){
      if(!entries.some(entry=>entry.path===file))fail(`SDK tarball lacks ${file}`);
    }
  }
  const installedRoot=path.join(root,'node_modules/@creezio/sdk');
  for(const entry of entries){
    if(!entry.path.startsWith('package/'))fail('SDK tarball layout');
    const name=entry.path.slice('package/'.length);
    const installedBytes=readFileSync(confinedFile(installedRoot,name));
    if(!installedBytes.equals(entry.bytes))fail(`installed SDK differs from tarball: ${name}`);
  }
  return {version:installed.version,integrity:sha256(bytes)};
}

export function tarFiles(archive){
  const tar=gunzipSync(archive,{maxOutputLength:256*1024*1024});
  const entries=[];
  let extendedPath=null;
  for(let offset=0;offset+512<=tar.length;){
    const header=tar.subarray(offset,offset+512);
    if(header.every(byte=>byte===0)){
      if(tar.subarray(offset).some(byte=>byte!==0))fail('nonzero data after tar terminator');
      break;
    }
    const expected=parseInt(header.subarray(148,156).toString('ascii').replace(/\0.*$/,'').trim(),8);
    const copy=Buffer.from(header);copy.fill(32,148,156);
    if(!Number.isSafeInteger(expected)||expected!==copy.reduce((sum,byte)=>sum+byte,0))
      fail('tar header checksum');
    const rawName=header.subarray(0,100).toString('utf8').replace(/\0.*$/,'');
    const prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/,'');
    const name=prefix?`${prefix}/${rawName}`:rawName;
    const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,'').trim(),8);
    if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)fail('invalid tar entry size');
    const type=String.fromCharCode(header[156]);
    const data=tar.subarray(offset+512,offset+512+size);
    if(type==='x'){
      const record=data.toString('utf8').match(/(?:^|\n)\d+ path=([^\n]+)\n/);
      extendedPath=record?.[1]??null;
      if(!extendedPath)fail('unsupported SDK PAX entry');
    }else if(type==='0'||type==='\0'){
      const filePath=extendedPath??name;
      if(!safePath(filePath)||entries.some(entry=>entry.path===filePath))fail('unsafe or duplicate tar path');
      entries.push({path:filePath,bytes:Buffer.from(data)});
      extendedPath=null;
    }else if(type==='5'){
      extendedPath=null;
    }else fail('SDK tarball contains a linked or unsupported entry');
    offset+=512+Math.ceil(size/512)*512;
  }
  return entries;
}

export function verifyRuntimeArchive(bytes,names,sourceRoot){
  const entries=tarFiles(bytes);
  exactInventory(entries.map(entry=>entry.path),names.map(name=>`package/${name}`));
  for(const entry of entries){
    const name=entry.path.slice('package/'.length);
    if(!entry.bytes.equals(readFileSync(confinedFile(sourceRoot,name))))
      fail(`npm pack changed runtime file bytes: ${name}`);
  }
}

export function fileSnapshot(names,sourceRoot){
  return Object.fromEntries(names.map(name=>[name,sha256(readFileSync(confinedFile(sourceRoot,name)))]));
}

export function verifySnapshot(before,names,sourceRoot){
  if(canonicalJson(before)!==canonicalJson(fileSnapshot(names,sourceRoot)))
    fail('build files changed after validation');
}

function tarHeader(name,size){
  const raw=Buffer.from(name,'utf8');
  if(raw.length>100||raw.some(byte=>byte<32||byte>126))fail(`validation archive path: ${name}`);
  const out=Buffer.alloc(512);raw.copy(out);
  const octal=(offset,width,value)=>out.write(`${value.toString(8).padStart(width-1,'0')}\0`,offset,width,'ascii');
  octal(100,8,0o644);octal(108,8,0);octal(116,8,0);octal(124,12,size);octal(136,12,0);
  out.fill(32,148,156);out.write('0',156,1,'ascii');out.write('ustar\0',257,6,'ascii');
  out.write('00',263,2,'ascii');
  out.write(`${out.reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')}\0 `,148,8,'ascii');
  return out;
}

export function validationArchive(files){
  if(!Array.isArray(files)||files.length===0||files.length>4096)fail('validation file count');
  exactInventory(files.map(file=>file.path),files.map(file=>file.path));
  const sections=[];
  for(const file of [...files].sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)))){
    if(!(file.bytes instanceof Uint8Array))fail('validation file bytes');
    const bytes=Buffer.from(file.bytes);
    sections.push(tarHeader(file.path,bytes.length),bytes,Buffer.alloc((512-bytes.length%512)%512));
  }
  sections.push(Buffer.alloc(1024));
  const result=gzipSync(Buffer.concat(sections),{level:9});
  result.fill(0,4,8);result[9]=255;
  return result;
}

export function npmCommand(){
  if(process.env.npm_execpath&&existsSync(process.env.npm_execpath))
    return {program:process.execPath,prefix:[process.env.npm_execpath]};
  if(process.platform==='win32'){
    const cli=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
    if(!existsSync(cli))fail('npm CLI was not found alongside Node');
    return {program:process.execPath,prefix:[cli]};
  }
  return {program:'npm',prefix:[]};
}

function readManifest(){
  const manifest=JSON.parse(readFileSync(confinedFile(root,'module/manifest.json'),'utf8'));
  const pack=JSON.parse(readFileSync(confinedFile(root,'package.json'),'utf8'));
  if(pack.name!=='@creezio/purchase-requests'||pack.version!==manifest.identity?.version
    ||manifest.identity?.id!=='creezio.purchase-requests')fail('package and module identity differ');
  for(const kind of ['runtime','validation']){
    const names=manifest.packaging?.[kind]?.files;
    if(!Array.isArray(names)||names.length===0||names.length>4096)fail(`${kind} file list`);
    exactInventory(names,names);
    for(const name of names)confinedFile(root,name);
  }
  if(manifest.packaging.validationBinding?.moduleId!==manifest.identity.id
    ||manifest.packaging.validationBinding.moduleVersion!==manifest.identity.version
    ||manifest.packaging.validationBinding.sourceRevision!==manifest.identity.source.revision)
    fail('validation source binding');
  if(!Array.isArray(pack.files)||pack.files.length===0||pack.files.some(name=>
    typeof name!=='string'||name.startsWith('/')||name.includes('..')||name.includes('\\')))
    fail('package.json must declare a confined files allowlist');
  return {manifest,pack};
}

function receipt(manifest,runtime,validation){
  return {schemaVersion:'1.0.0',module:{id:manifest.identity.id,origin:manifest.identity.origin,
    version:manifest.identity.version,source:manifest.identity.source},
  contractIntegrity:sha256(Buffer.from(canonicalJson(manifest))),
  runtime:{integrity:sha256(runtime.bytes),location:{kind:'local',path:runtime.path}},
  validation:{integrity:sha256(validation.bytes),location:{kind:'local',path:validation.path}},
  policy:manifest.validation.policy};
}

function writeOnce(target,bytes){
  if(existsSync(target)){
    if(lstatSync(target).isSymbolicLink()||!lstatSync(target).isFile()
      ||!readFileSync(target).equals(bytes))fail(`existing output differs: ${target}`);
    return;
  }
  const temporary=`${target}.tmp-${process.pid}`;
  if(existsSync(temporary))fail(`temporary output exists: ${temporary}`);
  try{writeFileSync(temporary,bytes,{flag:'wx'});renameSync(temporary,target);}
  finally{if(existsSync(temporary))unlinkSync(temporary);}
}

export function packageRelease(){
  const pack=JSON.parse(readFileSync(confinedFile(root,'package.json'),'utf8'));
  const sdk=sdkProof(pack);
  // Build recompiles every generated runtime file and regenerates the descriptor from Git HEAD.
  command(process.execPath,['scripts/build.mjs']);
  const {manifest}=readManifest();
  const revision=sourceProof(manifest);
  const runtimeSnapshot=fileSnapshot(manifest.packaging.runtime.files,root);
  // Gate includes the package suite. That suite tests npm pack independently and never calls this function.
  command(process.execPath,['gate.mjs']);
  verifySnapshot(runtimeSnapshot,manifest.packaging.runtime.files,root);
  sourceProof(manifest);
  const outputParent=path.join(root,'.creezio');
  if(existsSync(outputParent)&&lstatSync(outputParent).isSymbolicLink())fail('linked output parent');
  const packageDir=path.join(root,output);
  if(existsSync(packageDir)&&lstatSync(packageDir).isSymbolicLink())fail('linked output directory');
  mkdirSync(packageDir,{recursive:true});
  const staging=path.join(packageDir,`.staging-${process.pid}`);
  mkdirSync(staging);
  const runtimeName='creezio-purchase-requests-0.1.0.tgz';
  const validationName='creezio-purchase-requests-0.1.0-validation.tgz';
  try{
    const npm=npmCommand();
    const outputJson=command(npm.program,[...npm.prefix,'pack','--json','--ignore-scripts','--offline',
      '--pack-destination',staging]);
    const packed=JSON.parse(outputJson);
    if(!Array.isArray(packed)||packed.length!==1||packed[0].name!==pack.name
      ||packed[0].version!==pack.version||packed[0].filename!==runtimeName)
      fail('unexpected npm pack result');
    exactInventory(packed[0].files.map(file=>file.path),manifest.packaging.runtime.files);
    const runtimeBytes=readFileSync(path.join(staging,runtimeName));
    verifyRuntimeArchive(runtimeBytes,manifest.packaging.runtime.files,root);
    if(packed[0].integrity!==`sha512-${createHash('sha512').update(runtimeBytes).digest('base64')}`)
      fail('npm pack integrity differs from archive bytes');
    const validationBytes=validationArchive(manifest.packaging.validation.files.map(name=>
      ({path:name,bytes:readFileSync(confinedFile(root,name))})));
    const runtime={path:`.creezio/packages/${runtimeName}`,bytes:runtimeBytes};
    const validation={path:`.creezio/packages/${validationName}`,bytes:validationBytes};
    const detached=receipt(manifest,runtime,validation);
    const checksums=`${sha512(runtimeBytes)}  ${runtimeName}\n${sha512(validationBytes)}  ${validationName}\n`;
    writeOnce(path.join(packageDir,runtimeName),runtimeBytes);
    writeOnce(path.join(packageDir,validationName),validationBytes);
    writeOnce(path.join(packageDir,'manifest.json'),Buffer.from(`${JSON.stringify(detached,null,2)}\n`));
    writeOnce(path.join(packageDir,'SHA512SUMS'),Buffer.from(checksums));
    return {receipt:detached,sha512:checksums.trim().split('\n'),revision,sdk};
  }finally{
    for(const name of readdirSync(staging)){
      const artifact=path.join(staging,name);
      if(name.endsWith('.tgz')&&lstatSync(artifact).isFile()&&!lstatSync(artifact).isSymbolicLink())
        unlinkSync(artifact);
    }
    rmdirSync(staging);
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(packageRelease(),null,2));}
  catch(error){console.error(error);process.exitCode=1;}
}
