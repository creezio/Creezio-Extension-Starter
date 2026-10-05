import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {assertDemoDependencySelection,assertDemoInstallStamp,assertDemoModuleArchive,
  assertDemoModuleReceipt,assertDemoSdkArchive,checkedSourceLock,moduleArtifactNames,
  moduleVersionRange,sourceEntries}
  from '../../scripts/demo.mjs';

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
  assert.equal(checkedSourceLock(lock,'local-sdk.tgz').module.version,'0.1.0');
  assert.equal(moduleVersionRange(checkedSourceLock(lock,'local-sdk.tgz')),'^0.1.0');
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

test('module version selects exact archive names; a missing legacy version means only 0.1.0',()=>{
  const integrity=`sha256-${'a'.repeat(64)}`;
  const base={schemaVersion:1,core:{repository:'https://github.com/creezio/Creezio-D1R2',
    revision,url:`https://codeload.github.com/creezio/Creezio-D1R2/tar.gz/${revision}`,
    integrity},sdk:{version:'1.2.0',integrity,
      url:'https://github.com/creezio/Creezio-D1R2/releases/download/sdk-v1.2.0/creezio-sdk-1.2.0.tgz'},
    module:{version:'0.1.4',runtimeIntegrity:integrity,validationIntegrity:integrity,
      receiptIntegrity:integrity}};
  assert.equal(checkedSourceLock(base).module.version,'0.1.4');
  assert.equal(moduleVersionRange(checkedSourceLock(base)),'0.1.4');
  assert.deepEqual(moduleArtifactNames('0.1.4'),{
    runtime:'creezio-purchase-requests-0.1.4.tgz',
    validation:'creezio-purchase-requests-0.1.4-validation.tgz',
    receipt:'manifest-0.1.4.json'});
  assert.equal(checkedSourceLock({...base,module:{...base.module,version:'0.2.0'}})
    .module.version,'0.2.0');
  assert.equal(moduleArtifactNames('0.2.0-rc.1').runtime,
    'creezio-purchase-requests-0.2.0-rc.1.tgz');
  const legacy={...base,module:{...base.module}};
  delete legacy.module.version;
  assert.equal(checkedSourceLock(legacy).module.version,'0.1.0');
  assert.equal(moduleVersionRange(checkedSourceLock(legacy)),'^0.1.0');
  assert.equal(moduleArtifactNames('0.1.0').receipt,'manifest.json');
  assert.throws(()=>checkedSourceLock({...base,module:{...base.module,version:'^1.0.0'}}),
    /invalid source lock/);
  assert.throws(()=>checkedSourceLock({...base,module:{...base.module,version:null}}),
    /invalid source lock/);
  for(const invalid of ['../0.2.0','0.2.0/../bad','0.2.0-../bad','v0.2.0',
    '0.2.0+build','0.02.0']){
    assert.throws(()=>moduleArtifactNames(invalid),/unsupported module version/);
  }
});

test('an installed app rejects a different module pin before copying new packages',()=>{
  const integrity=value=>`sha256-${value.repeat(64)}`;
  const lock={core:{revision},sdk:{integrity:integrity('a')},
    module:{version:'0.1.4',runtimeIntegrity:integrity('b')}};
  const stamp={sourceRevision:revision,sdkIntegrity:integrity('a'),
    moduleIntegrity:integrity('c')};
  assert.throws(()=>assertDemoInstallStamp(stamp,lock),/installed app differs/);
  assert.doesNotThrow(()=>assertDemoInstallStamp({...stamp,moduleIntegrity:integrity('b')},lock));
});

test('a verified receipt and runtime tar must name the module version from the lock',()=>{
  const integrity=`sha256-${'a'.repeat(64)}`;
  const source={kind:'git',repository:'https://github.com/creezio/Creezio-Extension-Starter',
    revision,integrity};
  const lock={module:{version:'0.1.4',runtimeIntegrity:integrity,validationIntegrity:integrity}};
  const receipt={module:{id:'creezio.purchase-requests',
    origin:'https://github.com/creezio/Creezio-Extension-Starter',version:'0.1.4',source},
    runtime:{integrity,location:{path:'.creezio/packages/creezio-purchase-requests-0.1.4.tgz'}},
    validation:{integrity,location:{path:'.creezio/packages/creezio-purchase-requests-0.1.4-validation.tgz'}}};
  assert.doesNotThrow(()=>assertDemoModuleReceipt(receipt,lock));
  assert.throws(()=>assertDemoModuleReceipt({...receipt,module:{...receipt.module,version:'0.1.2'}},lock),
    /detached receipt/);
  assert.throws(()=>assertDemoModuleReceipt({...receipt,runtime:{...receipt.runtime,
    location:{path:'.creezio/packages/creezio-purchase-requests-0.1.2.tgz'}}},lock),
    /detached receipt/);
  const entries=[{path:'package/package.json',bytes:Buffer.from(JSON.stringify({
    name:'@creezio/purchase-requests',version:'0.1.4'}))},
  {path:'package/module/manifest.json',bytes:Buffer.from(JSON.stringify({
    identity:{id:'creezio.purchase-requests',version:'0.1.4',source}}))}];
  assert.doesNotThrow(()=>assertDemoModuleArchive(entries,receipt));
  assert.throws(()=>assertDemoModuleArchive([{...entries[0],bytes:Buffer.from(JSON.stringify({
    name:'@creezio/purchase-requests',version:'0.1.2'}))},entries[1]],receipt),
    /module archive identity/);
  assert.throws(()=>assertDemoModuleArchive([entries[0],{...entries[1],
    bytes:Buffer.from(JSON.stringify({identity:{id:'creezio.purchase-requests',version:'0.1.2',source}}))}],
    receipt),/module archive identity/);
  assert.throws(()=>assertDemoModuleArchive([entries[0],{...entries[1],
    bytes:Buffer.from(JSON.stringify({identity:{id:'creezio.purchase-requests',version:'0.1.4',
      source:{...source,revision:'b'.repeat(40)}}}))}],receipt),/module archive identity/);
});

test('npm dependency selection rejects a different module version, spec or archive digest',()=>{
  const moduleArchive=Buffer.from('pinned module archive');
  const sdkArchive=Buffer.from('pinned sdk archive');
  const spec='file:.creezio/packages/creezio-purchase-requests-0.1.4.tgz';
  const sdkSpec='file:.creezio/packages/creezio-sdk-1.2.0.tgz';
  const integrity=bytes=>`sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const source={sdk:{version:'1.2.0'},module:{version:'0.1.4'}};
  const pack={devDependencies:{'@creezio/sdk':sdkSpec},
    dependencies:{'@creezio/purchase-requests':spec}};
  const lock={packages:{'':pack,
    'node_modules/@creezio/sdk':{version:'1.2.0',resolved:sdkSpec,integrity:integrity(sdkArchive)},
    'node_modules/@creezio/purchase-requests':{
      version:'0.1.4',resolved:spec,integrity:integrity(moduleArchive)}}};
  const archives={'@creezio/sdk':sdkArchive,'@creezio/purchase-requests':moduleArchive};
  assert.doesNotThrow(()=>assertDemoDependencySelection(pack,lock,source,archives));
  assert.throws(()=>assertDemoDependencySelection(pack,{packages:{...lock.packages,
    'node_modules/@creezio/purchase-requests':{
      ...lock.packages['node_modules/@creezio/purchase-requests'],version:'0.1.2'}}},source,archives),
    /package lock differs/);
  assert.throws(()=>assertDemoDependencySelection({...pack,
    dependencies:{'@creezio/purchase-requests':'file:old.tgz'}},lock,source,archives),
    /package lock does not select/);
  assert.throws(()=>assertDemoDependencySelection(pack,lock,source,{
    ...archives,'@creezio/purchase-requests':Buffer.from('different module archive')}),
    /package lock differs/);
});
