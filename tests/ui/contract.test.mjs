import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {Workspace} from '@creezio/sdk/workspace/components';
import {createCommandJournal} from '@creezio/sdk/operations/command-journal';
import {contributions} from '../../dist/ui/contributions.js';
import {amountMinor, canInspectPending, canRenderPanel, commandResultForCurrent, draftFromRequest, initialPanelState, panelState, pendingStatusTarget,
  isLegacyPending, purchaseRequest, reconcileRequest, restoredPanelState, validDraft} from '../../ui/workspace/state.ts';

const request = {id: 'req-1', title: 'Ordinateur', description: 'Équipe produit', amountMinor: 12999,
  currency: 'EUR', status: 'draft', revision: 2, createdAt: '2026-09-27T10:00:00Z',
  updatedAt: '2026-09-27T10:00:00Z', submittedAt: null};

test('public SDK roundtrips the new front route without the old detail-route ambiguity',()=>{
  const descriptor=JSON.parse(readFileSync(new URL('../../module/manifest.json',import.meta.url),'utf8'));
  const selected=['list','new','detail'];
  const declarations=descriptor.contracts.ui.views.filter(view=>selected.includes(view.id));
  assert.equal(declarations.length,3);
  for(const declaration of declarations)
    assert.equal(contributions.find(view=>view.id===declaration.id)?.route,declaration.route);
  const views=declarations.map(view=>({id:`${descriptor.identity.id}:${view.id}`,
    moduleId:descriptor.identity.id,title:view.title,route:view.route,surfaces:view.surfaces,
    audiences:['app'],panel:view.panel,component:()=>null,
    validateInput:input=>view.id==='detail'
      ?Object.keys(input).length===1&&typeof input.id==='string'&&input.id.length>0
      :Object.keys(input).length===0}));
  const session={id:'session',principalId:'owner',audience:'app'};
  const access={audience:'app',getSnapshot:()=>({phase:'authenticated',pending:null,session}),
    subscribe:()=>()=>{}};
  const projection={sessionId:session.id,principalId:session.principalId,audience:'app',
    contextId:'application',compositionDigest:`sha256-${'a'.repeat(64)}`,epoch:1,
    viewIds:views.map(view=>view.id),navigationIds:[],slotIds:[]};
  const visit=(candidates,url)=>{
    let result;
    renderToString(createElement(Workspace,{access,projection,views:candidates,navigation:[],
      client:{},contextId:'application',surface:'front',persist:false,
      renderShell:({controller})=>{
        controller.setProjection(projection);
        result={accepted:controller.visit(url),location:controller.getSnapshot().tabs[0]?.location};
        return null;
      }}));
    return result;
  };
  const oldViews=views.map(view=>view.id.endsWith(':new')?{...view,route:'/requests/new'}:view);
  assert.equal(visit(oldViews,'/requests/new').accepted,false,'the published 0.1.0 route is ambiguous');
  const creation=visit(views,'/purchase-requests/new');
  assert.equal(creation.accepted,true);
  assert.equal(creation.location.viewId,`${descriptor.identity.id}:new`);
  assert.equal(creation.location.url,'/purchase-requests/new');
  const detail=visit(views,'/requests/record-1');
  assert.equal(detail.accepted,true);
  assert.equal(detail.location.viewId,`${descriptor.identity.id}:detail`);
  assert.equal(detail.location.input.id,'record-1');
});

test('amount fields use the currency minor unit without rounding a larger entered precision', () => {
  assert.equal(amountMinor('129,99', 'EUR'), 12999);
  assert.equal(amountMinor('129.999', 'EUR'), null);
  assert.equal(amountMinor('250', 'JPY'), 250);
  assert.equal(amountMinor('-1', 'EUR'), null);
  assert.equal(amountMinor('10000000000.01', 'EUR'), null);
  assert.equal(draftFromRequest(request).amountText, '129.99');
});

test('a local draft survives a later server revision and requires an explicit choice', () => {
  const initial = reconcileRequest(initialPanelState(), request);
  assert.equal(initial.conflict, false);
  assert.equal(initial.state.baseRevision, 2);
  const edited = {...initial.state, draft: {...initial.state.draft, title: 'Ordinateur portable'}, dirty: true};
  const later = {...request, title: 'Autre titre', revision: 3};
  const outcome = reconcileRequest(edited, later);
  assert.equal(outcome.conflict, true);
  assert.equal(outcome.state.draft.title, 'Ordinateur portable');
  assert.equal(outcome.state.baseRevision, 2);
  const untouched = reconcileRequest(initial.state, later);
  assert.equal(untouched.conflict, false);
  assert.equal(untouched.state.draft.title, 'Autre titre');
});

test('a status result older than a get cannot replace the newer request or its local draft', () => {
  const older={...request,revision:2};
  const newer={...request,revision:3,title:'Titre serveur récent'};
  const draft={...initialPanelState(),baseRevision:2,dirty:true,
    draft:{...draftFromRequest(older),title:'Mon brouillon non enregistré'}};
  const afterGet=reconcileRequest(draft,newer);
  assert.equal(afterGet.state.draft.title,'Mon brouillon non enregistré');
  assert.equal(commandResultForCurrent(newer,3,older),null);
  assert.equal(afterGet.state.baseRevision,2);
  assert.equal(commandResultForCurrent(newer,3,{...newer,revision:4})?.revision,4);
  assert.equal(commandResultForCurrent(null,null,newer)?.revision,3,
    'a terminal status may hydrate a reloaded detail before request.get');
});

test('pending command remains in a bounded restorable panel state with the exact status pointer', () => {
  const state = {...initialPanelState(), pending: {operationId: 'request.create', requestKey: 'key-1'}};
  assert.deepEqual(panelState(state), state);
  assert.equal(isLegacyPending(state.pending), true);
  assert.deepEqual(pendingStatusTarget(state.pending), {requestKey: 'key-1'});
  assert.deepEqual(pendingStatusTarget({...state.pending, executionId: 'execution-1'}),
    {executionId: 'execution-1'});
  assert.equal(panelState({...state, pending: {...state.pending, operationId: 'other.module:delete'}}), null);
  assert.equal(panelState({...state, draft: {...state.draft, description: 'x'.repeat(4001)}}), null);
});

test('new SDK pending metadata roundtrips while another scope cannot adopt it', () => {
  const scope={sessionId:'session-a',audience:'app',contextId:'application'};
  const pending={...scope,bindingId:'creezio.purchase-requests:app.request.create',
    requestKey:'key-a',intent:'request.create'};
  assert.deepEqual(panelState({...initialPanelState(),pending})?.pending,pending);
  assert.equal(createCommandJournal(scope,pending).pending?.requestKey,'key-a');
  assert.equal(createCommandJournal({...scope,sessionId:'session-b'},pending).pending,null);
  assert.equal(createCommandJournal({...scope,audience:'admin'},pending).pending,null);
  assert.equal(panelState({...initialPanelState(),pending:{...pending,bindingId:'other:app.delete'}}),null);
});

test('restoring a retained panel wakes hydration even when SDK returns the same stored object', () => {
  const stored={...initialPanelState(),draft:{...initialPanelState().draft,title:'Conservé'}};
  const restored=restoredPanelState(stored);
  assert.notStrictEqual(restored,stored);
  assert.deepEqual(restored,stored);
});

test('SDK journal refuses a create when panel persistence fails, and preserves unknown for status only', async () => {
  const scope={sessionId:'session-a',audience:'app',contextId:'application'};
  const pending={...scope,bindingId:'creezio.purchase-requests:app.request.create',
    requestKey:'key-a',intent:'request.create'};
  let invoked=0,inspected=0,saved=initialPanelState();
  const client={audience:'app',async invoke(){invoked++;return {kind:'unknown',code:'outcome_unknown'};},
    async status(){inspected++;return {kind:'rejected',code:'forbidden',status:403};}};
  const failed=createCommandJournal(scope);
  const rejected=await failed.execute(client,pending,{title:'Ordinateur'},()=>true,()=>false);
  assert.equal(rejected.result.code,'client_state_unavailable');
  assert.equal(invoked,0);
  const journal=createCommandJournal(scope);
  const persist=value=>{const next={...saved,pending:value};
    if (!panelState(next)) return false;
    saved=next;return true;};
  const outcome=await journal.execute(client,pending,{title:'Ordinateur'},()=>true,persist);
  assert.equal(outcome.result.kind,'unknown');
  assert.equal(invoked,1);
  assert.equal(saved.pending.requestKey,'key-a');
  const status=await journal.inspect(client,()=>true,persist);
  assert.equal(status.result.code,'forbidden');
  assert.equal(inspected,1);
  assert.equal(invoked,1);
  assert.equal(saved.pending.requestKey,'key-a');
  assert.equal((await journal.execute(client,{...pending,requestKey:'key-b'}, {},()=>true,persist)).result.code,'in_progress');
  assert.equal(invoked,1);
  client.status=async()=>({kind:'execution',execution:{state:'succeeded',output:{request}}});
  const settled=await journal.inspect(client,()=>true,persist);
  assert.equal(settled.result.execution.state,'succeeded');
  assert.equal(settled.pending,null);
  assert.equal(saved.pending,null);
  assert.equal(invoked,1,'inspection must never replay the create');
});

test('pending inspection waits for the in-flight invocation lease before claiming status', () => {
  const pending={operationId:'request.create',requestKey:'key-a'};
  assert.equal(canInspectPending(pending,true,false,true,true),false);
  assert.equal(canInspectPending(pending,true,false,false,true),false);
  assert.equal(canInspectPending(pending,true,false,false,false),true);
});

test('retained panels suspend rendering without dropping their draft when access or activity changes', () => {
  const saved={...initialPanelState(),draft:{...initialPanelState().draft,title:'Brouillon privé'}};
  assert.equal(canRenderPanel(true,true,true,true),true);
  assert.equal(canRenderPanel(true,true,false,true),false);
  assert.equal(canRenderPanel(true,false,true,false),false);
  assert.equal(canRenderPanel(false,true,true,true),false);
  assert.equal(restoredPanelState(saved).draft.title,'Brouillon privé');
});

test('request output and editable draft reject malformed business values', () => {
  assert.deepEqual(purchaseRequest(request), request);
  assert.equal(purchaseRequest({...request, status: 'approved'}), null);
  assert.equal(purchaseRequest({...request, amountMinor: 1.5}), null);
  assert.equal(validDraft(draftFromRequest(request)), true);
  assert.equal(validDraft({...draftFromRequest(request), amountText: '129.999'}), false);
});
