import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {canonicalJson,exactInventory,fileSnapshot,npmCommand,releaseOutputNames,tarFiles,validationArchive,
  verifyRuntimeArchive,verifySnapshot} from '../../scripts/package.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));

test('new release outputs cannot overwrite the public 0.1.0 receipt and checksums',()=>{
  const names=releaseOutputNames('0.1.1');
  assert.deepEqual(names,{
    runtime:'creezio-purchase-requests-0.1.1.tgz',
    validation:'creezio-purchase-requests-0.1.1-validation.tgz',
    receipt:'manifest-0.1.1.json',
    checksums:'SHA512SUMS-0.1.1',
  });
  assert.ok(!Object.values(names).some(name=>[
    'creezio-purchase-requests-0.1.0.tgz',
    'creezio-purchase-requests-0.1.0-validation.tgz',
    'manifest.json','SHA512SUMS',
  ].includes(name)));
  assert.throws(()=>releaseOutputNames('../0.1.1'),/invalid module version/);
});

test('widget assets read by the host are declared runtime files and public package exports',()=>{
  const descriptor=JSON.parse(readFileSync(path.join(root,'module/manifest.json'),'utf8'));
  const pack=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  const runtime=new Set(descriptor.packaging.runtime.files);
  const assets=[
    ...descriptor.contracts.mcp.resources.filter(resource=>resource.source?.kind==='asset')
      .map(resource=>resource.source.path),
    ...descriptor.contracts.widgets.flatMap(widget=>widget.actions
      .filter(action=>action.target?.template).map(action=>action.target.template)),
  ];
  assert.ok(assets.length>0);
  for(const asset of assets){
    assert.ok(runtime.has(asset),`undeclared widget asset: ${asset}`);
    assert.equal(pack.exports[`./${asset}`],`./${asset}`,`private widget asset: ${asset}`);
  }
});

test('npm pack includes exactly the runtime allowlist and excludes adjacent source',()=>{
  const parent=path.join(root,'.creezio');
  const createdParent=!existsSync(parent);
  if(createdParent)mkdirSync(parent);
  else assert.ok(lstatSync(parent).isDirectory()&&!lstatSync(parent).isSymbolicLink());
  const fixture=mkdtempSync(path.join(parent,'package-test-'));
  const output=path.join(fixture,'out');
  mkdirSync(output);
  const files=['package.json','runtime.txt','source-only.txt'];
  writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'@creezio/pack-fixture',
    version:'1.0.0',private:true,files:['runtime.txt']}));
  writeFileSync(path.join(fixture,'runtime.txt'),'allowed\n');
  writeFileSync(path.join(fixture,'source-only.txt'),'never packaged\n');
  const archive=path.join(output,'creezio-pack-fixture-1.0.0.tgz');
  try{
    const npm=npmCommand();
    const result=spawnSync(npm.program,[...npm.prefix,'pack','--json','--ignore-scripts',
      '--offline','--pack-destination',output],{cwd:fixture,encoding:'utf8',timeout:60000,
      maxBuffer:1024*1024,windowsHide:true});
    assert.equal(result.status,0,result.stderr||result.error?.message);
    const packed=JSON.parse(result.stdout);
    assert.equal(packed.length,1);
    assert.equal(packed[0].filename,path.basename(archive));
    exactInventory(packed[0].files.map(file=>file.path),['package.json','runtime.txt']);
    const entries=tarFiles(readFileSync(archive));
    exactInventory(entries.map(entry=>entry.path),['package/package.json','package/runtime.txt']);
    assert.equal(entries.find(entry=>entry.path==='package/runtime.txt').bytes.toString(),'allowed\n');
    verifyRuntimeArchive(readFileSync(archive),['package.json','runtime.txt'],fixture);
    const built=fileSnapshot(['package.json','runtime.txt'],fixture);
    writeFileSync(path.join(fixture,'runtime.txt'),'tampered\n');
    assert.throws(()=>verifyRuntimeArchive(readFileSync(archive),
      ['package.json','runtime.txt'],fixture),/changed runtime file bytes/);
    assert.throws(()=>verifySnapshot(built,['package.json','runtime.txt'],fixture),
      /build files changed after validation/);
  }finally{
    for(const file of [archive,...files.map(name=>path.join(fixture,name))]){
      assert.ok(file.startsWith(`${fixture}${path.sep}`));
      if(existsSync(file)){
        assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink());
        unlinkSync(file);
      }
    }
    rmdirSync(output);rmdirSync(fixture);
    if(createdParent)rmdirSync(parent);
  }
});

test('validation archive has stable bytes, sorted files and no release receipt inside',()=>{
  const files=[{path:'tests/b.txt',bytes:Buffer.from('B\n')},
    {path:'docs/a.txt',bytes:Buffer.from('A\n')}];
  const first=validationArchive(files),second=validationArchive([...files].reverse());
  assert.deepEqual(first,second);
  const tar=gunzipSync(first);
  const names=[];
  for(let offset=0;offset+512<=tar.length;){
    const header=tar.subarray(offset,offset+512);
    if(header.every(byte=>byte===0))break;
    names.push(header.subarray(0,100).toString('utf8').replace(/\0.*$/,''));
    const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,'').trim(),8);
    assert.equal(header[156],48); // regular file; no links or directories
    offset+=512+Math.ceil(size/512)*512;
  }
  assert.deepEqual(names,['docs/a.txt','tests/b.txt']);
  assert.ok(!names.includes('manifest.json'));
});

test('inventories reject extra, missing, duplicate and escaping files',()=>{
  assert.throws(()=>exactInventory(['a','b'],['a']),/inventory mismatch/);
  assert.throws(()=>exactInventory(['a'],['a','b']),/inventory mismatch/);
  assert.throws(()=>exactInventory(['a','a'],['a']),/invalid file inventory/);
  assert.throws(()=>validationArchive([{path:'../escape',bytes:Buffer.from('x')}]),/invalid file inventory/);
});

test('descriptor hash canonicalization sorts object keys but preserves array order',()=>{
  assert.equal(canonicalJson({z:1,a:{y:[2,1],x:true}}),
    '{"a":{"x":true,"y":[2,1]},"z":1}');
});
