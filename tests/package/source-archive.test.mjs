import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {assertDemoSdkArchive,checkedSourceLock,sourceEntries} from '../../scripts/demo.mjs';

const revision='a'.repeat(40);
function header(name,size,type){
  const value=Buffer.alloc(512);value.write(name,0,'utf8');
  const octal=(offset,width,number)=>value.write(`${number.toString(8).padStart(width-1,'0')}\0`,offset,width,'ascii');
  octal(100,8,0o644);octal(108,8,0);octal(116,8,0);octal(124,12,size);octal(136,12,0);
  value.fill(32,148,156);value.write(type,156,'ascii');value.write('ustar\0',257,'ascii');
  value.write(`${value.reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')}\0 `,148,'ascii');
  return value;
}
function archive({comment=revision,fileType='0'}={}){
  const pax=Buffer.from(`52 comment=${comment}\n`);
  const file=Buffer.from('{"name":"creezio-d1r2"}\n');
  const blocks=(name,bytes,type)=>[header(name,bytes.length,type),bytes,
    Buffer.alloc((512-bytes.length%512)%512)];
  return gzipSync(Buffer.concat([
    ...blocks('pax_global_header',pax,'g'),
    header(`Creezio-D1R2-${revision}/`,0,'5'),
    ...blocks(`Creezio-D1R2-${revision}/package.json`,file,fileType),
    Buffer.alloc(1024),
  ]));
}

test('the pinned codeload global PAX comment precedes a confined source tree',()=>{
  const entries=sourceEntries(archive(),revision);
  assert.deepEqual(entries.map(entry=>entry.path),['package.json']);
  assert.equal(entries[0].bytes.toString('utf8'),'{'+'"name":"creezio-d1r2"}\n');
});

test('another global PAX revision or an archive link is refused',()=>{
  assert.throws(()=>sourceEntries(archive({comment:'b'.repeat(40)}),revision),/global PAX/);
  assert.throws(()=>sourceEntries(archive({fileType:'2'}),revision),/link or unsupported/);
});

test('legacy T30 lock selects only a verified SDK 1.0 archive',()=>{
  const integrity=`sha256-${'a'.repeat(64)}`;
  const lock={schemaVersion:1,core:{repository:'https://github.com/creezio/Creezio-D1R2',
    revision,url:`https://codeload.github.com/creezio/Creezio-D1R2/tar.gz/${revision}`,
    integrity},sdk:{integrity},module:{runtimeIntegrity:integrity,
    validationIntegrity:integrity,receiptIntegrity:integrity}};
  assert.equal(checkedSourceLock(lock,'local-sdk.tgz').sdk.version,'1.0.0');
  assert.equal(lock.sdk.version,undefined);
  const entries=[{path:'package/package.json',bytes:Buffer.from(JSON.stringify({
    name:'@creezio/sdk',version:'1.0.0'}))}];
  assert.doesNotThrow(()=>assertDemoSdkArchive(entries,'1.0.0'));
  assert.throws(()=>assertDemoSdkArchive([{...entries[0],bytes:Buffer.from(JSON.stringify({
    name:'@creezio/sdk',version:'1.1.0'}))}],'1.0.0'),/SDK archive identity|version differs/);
  assert.throws(()=>checkedSourceLock({...lock,sdk:{...lock.sdk,
    url:'https://github.com/creezio/Creezio-D1R2/releases/download/sdk-v1.1.0/creezio-sdk-1.1.0.tgz'}},
    'local-sdk.tgz'),/invalid source lock/);
});

test('demo accepts an explicitly pinned SDK 1.2 only with the public journal files',()=>{
  const integrity=`sha256-${'a'.repeat(64)}`;
  const lock={schemaVersion:1,core:{repository:'https://github.com/creezio/Creezio-D1R2',
    revision,url:`https://codeload.github.com/creezio/Creezio-D1R2/tar.gz/${revision}`,
    integrity},sdk:{version:'1.2.0',integrity,
      url:'https://github.com/creezio/Creezio-D1R2/releases/download/sdk-v1.2.0/creezio-sdk-1.2.0.tgz'},
    module:{runtimeIntegrity:integrity,validationIntegrity:integrity,receiptIntegrity:integrity}};
  assert.equal(checkedSourceLock(lock).sdk.version,'1.2.0');
  const sdk={name:'@creezio/sdk',version:'1.2.0',exports:{
    './delivery/context':{types:'./dist/types/sdk/delivery/context.d.ts',
      import:'./dist/esm/delivery/context.js'},
    './delivery/transport':{types:'./dist/types/sdk/delivery/transport.d.ts',
      import:'./dist/esm/delivery/transport.js'},
    './operations/command-journal':{types:'./dist/types/sdk/operations/command-journal.d.ts',
      import:'./dist/esm/operations/command-journal.js'}}};
  const entries=[{path:'package/package.json',bytes:Buffer.from(JSON.stringify(sdk))},
    ...['context','transport'].flatMap(name=>[
      `package/dist/types/sdk/delivery/${name}.d.ts`,`package/dist/esm/delivery/${name}.js`])
      .map(path=>({path,bytes:Buffer.from('public')})),
    {path:'package/dist/types/sdk/operations/command-journal.d.ts',bytes:Buffer.from('public')},
    {path:'package/dist/esm/operations/command-journal.js',bytes:Buffer.from('public')}];
  assert.doesNotThrow(()=>assertDemoSdkArchive(entries,'1.2.0'));
  assert.throws(()=>assertDemoSdkArchive(entries.slice(0,-1),'1.2.0'),/command-journal/);
});
