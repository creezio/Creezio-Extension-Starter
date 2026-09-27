import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const manifest=JSON.parse(readFileSync(new URL('../../module/manifest.json',import.meta.url),'utf8'));
const moduleId='creezio.purchase-requests';
const operations=new Map(manifest.contracts.operations.map(op=>[op.id,op]));
const schemas=new Map(manifest.contracts.schemas.map(entry=>[entry.id,entry.schema]));

test('eight operations have exact admin/app HTTP bindings and engine-owned request keys',()=>{
  assert.deepEqual([...operations.keys()],['request.create','request.list','request.get','request.update',
    'request.submit','request.withdraw','attachment.link','attachment.list']);
  assert.equal(manifest.contracts.api.length,16);
  for(const op of operations.values()){
    assert.equal(op.handler.path,'dist/module/operations.js');
    assert.deepEqual(op.audiences,['admin','app']);
    assert.equal(op.context,'required');
    assert.equal(op.idempotency.mode,op.kind==='command'?'required':'none');
    if(op.kind==='command'){
      assert.equal(op.idempotency.keyField,'requestKey');
      assert.ok(schemas.get(op.input.schemaId).required.includes('requestKey'));
    }
    for(const audience of ['admin','app']){
      const binding=manifest.contracts.api.find(item=>item.audience===audience
        &&item.operation.id===op.id);
      assert.ok(binding,`${audience} ${op.id}`);
      assert.equal(binding.operation.moduleId,moduleId);
      assert.deepEqual(binding.auth,['session']);
      assert.equal(binding.path.startsWith(`/api/purchase-requests/${audience}/requests`),true);
      assert.equal(binding.input.schemaId,op.input.schemaId);
      assert.equal(binding.output.schemaId,op.output.schemaId);
      if(op.kind==='command') assert.notEqual(binding.method,'GET');
      if(op.id==='request.list'||op.id==='attachment.list'){
        assert.deepEqual(binding.parameters.filter(parameter=>parameter.in==='query').map(parameter=>
          [parameter.name,parameter.required]),[['limit',true],['cursor',false]]);
      }
    }
  }
});

test('all operations have MCP exposure, but only two scoped reads render widgets',()=>{
  const mcp=manifest.contracts.mcp;
  assert.equal(mcp.tools.length,8);
  assert.deepEqual(new Set(mcp.tools.map(tool=>tool.operation.id)),new Set(operations.keys()));
  const widgetTools=mcp.tools.filter(tool=>tool.widget);
  assert.deepEqual(widgetTools.map(tool=>tool.name),['purchase_request_get','purchase_request_list']);
  assert.deepEqual(widgetTools.map(tool=>tool.operation.id),['request.get','request.list']);
  assert.deepEqual(widgetTools.map(tool=>tool.widget.id),['request-card','request-picker']);
  assert.deepEqual(mcp.resources.map(resource=>resource.widget.id),['request-card','request-picker']);
  for(const tool of mcp.tools){
    const isRead=operations.get(tool.operation.id).kind==='query';
    assert.deepEqual(tool.annotations,{readOnly:isRead,destructive:!isRead,
      idempotent:true,openWorld:false});
    assert.deepEqual(tool.auth,['oauth']);
    assert.equal(tool.input.schemaId,operations.get(tool.operation.id).input.schemaId);
    assert.equal(tool.output.schemaId,operations.get(tool.operation.id).output.schemaId);
  }
  for(const widget of manifest.contracts.widgets){
    assert.ok(mcp.resources.some(resource=>resource.id===widget.resource
      &&resource.widget.id===widget.id));
    assert.equal(widget.transport.protocol,'mcp-apps');
    assert.deepEqual(widget.actions.map(action=>action.mode),['message','context','direct']);
    assert.equal(widget.actions[1].input.schemaId,'widget-context-input');
    assert.deepEqual(widget.actions[1].target.fields,['id','title','revision']);
    assert.deepEqual(schemas.get('widget-context-input').required,['id','title','revision']);
    assert.equal(widget.actions[2].target.operation.id,
      widget.id==='request-card'?'request.get':'request.list');
  }
});

test('the packaged review skill is bound to its exact bytes and read-only operations',()=>{
  const skill=manifest.contracts.mcp.skills.find(item=>item.id==='review-purchase-request');
  assert.ok(skill);
  assert.equal(skill.path,'plugin/skills/review-purchase-request/SKILL.md');
  const bytes=readFileSync(new URL(`../../${skill.path}`,import.meta.url));
  assert.equal(skill.integrity,`sha256-${createHash('sha256').update(bytes).digest('hex')}`);
  assert.deepEqual(skill.operations.map(operation=>operation.id),['request.list','request.get']);
  assert.deepEqual(skill.resources,['request-card-ui','request-picker-ui']);
  assert.ok(manifest.packaging.runtime.files.includes(skill.path));
});

test('file category and metadata stay private and context-scoped',()=>{
  const file=manifest.contracts.files[0];
  assert.equal(file.id,'request-attachment');
  assert.equal(file.public,false);
  assert.equal(file.metadataModel.id,'file_metadata');
  assert.equal(file.contextField,'context_id');
  assert.equal(file.ownerField,'file_owner');
  assert.equal(file.ownerScope,'principal');
  assert.deepEqual(file.attachment.models.map(model=>model.id),['request']);
  const metadata=manifest.contracts.models.find(model=>model.id==='file_metadata');
  assert.equal(metadata.scope,'context');
  assert.equal(metadata.public,false);
  assert.deepEqual(metadata.primaryKey,['context_id','file_id']);
});
