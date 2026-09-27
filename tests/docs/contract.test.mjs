import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(`../../${name}`,import.meta.url),'utf8');
test('the installed documentation identifies this version and its actual business boundary',()=>{
  const manifest=JSON.parse(read('module/manifest.json'));
  for(const name of ['README.md','prd.md','CHANGELOG.md']){
    const content=read(name);
    assert.ok(content.includes(manifest.identity.version),`${name} is not tied to this version`);
    assert.ok(manifest.packaging.runtime.files.includes(name),`${name} is not installed`);
  }
  const prd=read('prd.md');
  assert.match(prd,/aucun achat|ni payer|ne réalise aucun achat/);
  assert.match(prd,/révision/);
  assert.match(prd,/permission|autorisé/);
  assert.match(prd,/indépendante/);
});
test('developer instructions and all six required suites are part of validation, never runtime',()=>{
  const manifest=JSON.parse(read('module/manifest.json'));
  for(const name of ['AGENTS.md','FILES.md','interview.md','TODO.md','gate.mjs']){
    assert.ok(read(name).trim().length>40,`${name} is empty`);
    assert.ok(manifest.packaging.validation.files.includes(name),`${name} absent from validation`);
    assert.ok(!manifest.packaging.runtime.files.includes(name),`${name} leaked into runtime`);
  }
  for(const name of ['backend','ui','api-mcp','widgets','package','docs']){
    const suite=manifest.validation.suites[name];
    assert.equal(suite.mode,'required');
    assert.ok(suite.tests.length>0);
    assert.ok(manifest.packaging.validation.files.includes(suite.script));
    for(const file of suite.tests)assert.ok(manifest.packaging.validation.files.includes(file));
  }
});
