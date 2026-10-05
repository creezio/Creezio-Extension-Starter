import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCreate,requestGet,requestList,requestUpdate,requestSubmit,requestWithdraw,
  attachmentLink,attachmentList} from '../../module/operations.ts';

const instant='2026-09-27T12:00:00.000Z';
const initial={context_id:'ctx-1',owner_id:'person-1',id:'req-1',title:'Ordinateur',description:'',
  amount_minor:12999,currency:'EUR',status:'draft',revision:1,created_at:instant,
  updated_at:instant,submitted_at:null};
const requestKey='retry-key-1';
const base={title:'Ordinateur',description:'',amountMinor:12999,currency:'EUR'};
function harness(request=initial){
  const reads=[],writes=[],rows=request?[request]:[];
  const noContext=values=>{if(values)assert.equal(Object.hasOwn(values,'context_id'),false,
    'the context-scoped DataPort owns context_id');};
  const plan=(kind,model,options)=>{noContext(options.key);noContext(options.values);
    noContext(options.where);const value={kind,model,options};writes.push(value);return value;};
  const data={
    get:async(model,{key})=>{noContext(key);reads.push({model,key});return rows.find(row=>model==='request'
      &&row.context_id==='ctx-1'&&row.owner_id===key.owner_id&&row.id===key.id)??null;},
    list:async(model,options)=>{noContext(options.where);noContext(options.after);
      reads.push({model,options});return {items:model==='request'
        ?rows.filter(row=>row.context_id==='ctx-1'&&row.owner_id===options.where.owner_id):[],nextAfter:null};},
    planCreate:(model,options)=>plan('create',model,options),
    planPatch:(model,options)=>plan('patch',model,options),
    planGet:(model,options)=>plan('get',model,options),
  };
  const context={contextId:'ctx-1',principalId:'person-1',audience:'admin',data,
    files:{preparePublication:async(category,staged)=>({plan:{kind:'publish',category,staged},
      file:{fileId:staged.fileId,filename:'devis.pdf',contentType:'application/pdf',byteSize:42}})}};
  return {context,reads,writes};
}

test('creation is a draft scoped to the server principal and never submits a purchase',async()=>{
  const {context,writes}=harness(null);
  const result=await requestCreate({requestKey,...base},context);
  assert.equal(result.output.request.status,'draft');
  assert.equal(result.output.request.revision,1);
  assert.equal(result.output.request.submittedAt,null);
  assert.equal(result.plans.length,1);
  assert.equal(Object.hasOwn(writes[0].options.values,'context_id'),false);
  assert.deepEqual(writes[0].options.values.owner_id,'person-1');
  assert.equal(writes[0].options.values.amount_minor,12999);
  assert.equal('requestKey' in writes[0].options.values,false);
});

test('reads are owner-scoped and pagination is bounded',async()=>{
  const {context,reads}=harness();
  const item=await requestGet({id:'req-1'},context);
  assert.equal(item.output.request.id,'req-1');
  assert.deepEqual(reads[0].key,{owner_id:'person-1',id:'req-1'});
  const page=await requestList({limit:30},context);
  assert.equal(page.output.items.length,1);
  assert.deepEqual(reads[1].options.where,{owner_id:'person-1'});
  await assert.rejects(()=>requestList({limit:51},context),error=>error.code==='invalid_input');
  const foreign=harness({...initial,owner_id:'person-2'});
  assert.equal((await requestGet({id:'req-1'},foreign.context)).output.request,null);
});

test('draft edit, submission, and withdrawal require exact state and revision',async()=>{
  const {context}=harness();
  const updated=await requestUpdate({requestKey,id:'req-1',revision:1,...base,title:'Écran'},context);
  assert.equal(updated.output.request.revision,2);
  assert.equal(updated.plans[0].options.compare.expected,1);
  assert.deepEqual(updated.plans[0].options.where,{status:'draft'});
  await assert.rejects(()=>requestUpdate({requestKey,id:'req-1',revision:2,...base},context),
    error=>error.code==='conflict');
  const submitted=await requestSubmit({requestKey,id:'req-1',revision:1},context);
  assert.equal(submitted.output.request.status,'submitted');
  assert.ok(submitted.output.request.submittedAt);
  assert.deepEqual(submitted.plans[0].options.where,{status:'draft'});
  await assert.rejects(()=>requestWithdraw({requestKey,id:'req-1',revision:1},context),
    error=>error.code==='conflict');
  const submittedContext=harness({...initial,status:'submitted',submitted_at:instant}).context;
  await assert.rejects(()=>requestUpdate({requestKey,id:'req-1',revision:1,...base},submittedContext),
    error=>error.code==='conflict');
  const withdrawn=await requestWithdraw({requestKey,id:'req-1',revision:1},submittedContext);
  assert.equal(withdrawn.output.request.status,'withdrawn');
  assert.deepEqual(withdrawn.plans[0].options.where,{status:'submitted'});
});

test('staged attachment publication, relation, and request CAS share one batch',async()=>{
  const {context}=harness();
  const staged={fileId:'file-1',intentId:'intent-1',generation:'generation-1',digest:'a'.repeat(64)};
  const result=await attachmentLink({requestKey,id:'req-1',revision:1,staged},context);
  assert.equal(result.plans.length,4);
  assert.equal(result.plans[0].category,'request-attachment');
  assert.equal(result.plans[1].kind,'get');
  assert.deepEqual(result.plans[1].options.where,{status:'draft'});
  assert.equal(result.plans[2].model,'request_attachment');
  assert.equal(result.plans[2].options.values.owner_id,'person-1');
  assert.equal(result.plans[3].options.compare.expected,1);
  assert.equal(result.output.requestRevision,2);
  assert.equal(result.output.attachment.reference.intentId,staged.intentId);
  const listed=await attachmentList({id:'req-1',limit:20},context);
  assert.deepEqual(listed.output.items,[]);
  const boundary=await attachmentList({id:'req-1',limit:50},context);
  assert.deepEqual(boundary.output.items,[]);
  await assert.rejects(()=>attachmentList({id:'req-1',limit:51},context),
    error=>error.code==='invalid_input');
  await assert.rejects(()=>attachmentLink({requestKey,id:'req-1',revision:2,staged},context),
    error=>error.code==='conflict');
  const submitted=harness({...initial,status:'submitted',submitted_at:instant});
  await assert.rejects(()=>attachmentLink({requestKey,id:'req-1',revision:1,staged},submitted.context),
    error=>error.code==='conflict');
  assert.equal(submitted.writes.length,0);
});
