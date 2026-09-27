import test from 'node:test';
import assert from 'node:assert/strict';
import {amountMinor, draftFromRequest, initialPanelState, panelState, pendingStatusTarget,
  purchaseRequest, reconcileRequest, validDraft} from '../../ui/workspace/state.ts';

const request = {id: 'req-1', title: 'Ordinateur', description: 'Équipe produit', amountMinor: 12999,
  currency: 'EUR', status: 'draft', revision: 2, createdAt: '2026-09-27T10:00:00Z',
  updatedAt: '2026-09-27T10:00:00Z', submittedAt: null};

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

test('pending command remains in a bounded restorable panel state with the exact status pointer', () => {
  const state = {...initialPanelState(), pending: {operationId: 'request.create', requestKey: 'key-1'}};
  assert.deepEqual(panelState(state), state);
  assert.deepEqual(pendingStatusTarget(state.pending), {requestKey: 'key-1'});
  assert.deepEqual(pendingStatusTarget({...state.pending, executionId: 'execution-1'}),
    {executionId: 'execution-1'});
  assert.equal(panelState({...state, pending: {...state.pending, operationId: 'other.module:delete'}}), null);
  assert.equal(panelState({...state, draft: {...state.draft, description: 'x'.repeat(4001)}}), null);
});

test('request output and editable draft reject malformed business values', () => {
  assert.deepEqual(purchaseRequest(request), request);
  assert.equal(purchaseRequest({...request, status: 'approved'}), null);
  assert.equal(purchaseRequest({...request, amountMinor: 1.5}), null);
  assert.equal(validDraft(draftFromRequest(request)), true);
  assert.equal(validDraft({...draftFromRequest(request), amountText: '129.999'}), false);
});
