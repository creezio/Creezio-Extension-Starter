import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const pinPath=path.join(root,'ci/sdk-pin.json');
const targetDirectory=path.join(root,'.creezio/ci');
const target=path.join(targetDirectory,'creezio-sdk-1.0.0.tgz');
const maxBytes=8*1024*1024;
const sha256=bytes=>`sha256-${createHash('sha256').update(bytes).digest('hex')}`;
const fail=message=>{throw new Error(`SDK bootstrap refused: ${message}`);};

function directory(name){
  if(existsSync(name)){
    const stat=lstatSync(name);
    if(!stat.isDirectory()||stat.isSymbolicLink())fail('unsafe output directory');
  }else mkdirSync(name);
}

export function validatePin(pin){
  if(!pin||typeof pin!=='object'||Array.isArray(pin)
    ||Object.keys(pin).sort().join(',')!=='integrity,schemaVersion,url'
    ||pin.schemaVersion!==1
    ||pin.url!=='https://github.com/creezio/Creezio-D1R2/releases/download/sdk-v1.0.0/creezio-sdk-1.0.0.tgz'
    ||typeof pin.integrity!=='string'||!/^sha256-[a-f0-9]{64}$/.test(pin.integrity))
    fail('invalid public release pin');
  return pin;
}

export async function fetchVerifiedArchive(pin,fetchImpl=fetch,limit=maxBytes){
  const response=await fetchImpl(pin.url,{redirect:'follow',signal:AbortSignal.timeout(60_000)});
  if(response.status!==200||!response.body||new URL(response.url).protocol!=='https:')
    fail('public SDK download failed');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))fail('SDK download exceeds size limit');
  const chunks=[];
  let length=0;
  for await(const chunk of response.body){
    length+=chunk.byteLength;
    if(length>limit)fail('SDK download exceeds size limit');
    chunks.push(Buffer.from(chunk));
  }
  const archive=Buffer.concat(chunks,length);
  if(!archive.length||sha256(archive)!==pin.integrity)fail('SDK archive digest differs from pin');
  return archive;
}

export async function bootstrapSdk(){
  const pin=validatePin(JSON.parse(readFileSync(pinPath,'utf8')));
  directory(path.join(root,'.creezio'));
  directory(targetDirectory);
  if(existsSync(target)){
    const stat=lstatSync(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes
      ||sha256(readFileSync(target))!==pin.integrity)
      fail('existing SDK archive differs from pin');
  }else{
    const archive=await fetchVerifiedArchive(pin);
    const temporary=`${target}.tmp-${process.pid}`;
    try{
      writeFileSync(temporary,archive,{flag:'wx'});
      renameSync(temporary,target);
    }finally{if(existsSync(temporary))unlinkSync(temporary);}
  }
  console.log(JSON.stringify({status:'verified',path:'.creezio/ci/creezio-sdk-1.0.0.tgz',
    integrity:pin.integrity,bytes:readFileSync(target).length}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await bootstrapSdk();
