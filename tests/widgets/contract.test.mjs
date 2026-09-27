import test from 'node:test';
import assert from 'node:assert/strict';
import {amountLabel, contextInput, mergeRequestPage, nextCardRequest, proposedMessage,
  requestFromTool, requestsFromTool} from '../../ui/widgets/data.ts';

const request = {id: 'req-1', title: 'Ordinateur', description: '', amountMinor: 12999,
  currency: 'EUR', status: 'submitted', revision: 3, createdAt: '2026-09-27T10:00:00Z',
  updatedAt: '2026-09-27T10:00:00Z', submittedAt: '2026-09-27T10:00:00Z'};

test('card and picker unwrap only valid render or succeeded action data', () => {
  assert.deepEqual(requestFromTool({kind: 'creezio.widget.render.v1', input: {request}}), request);
  assert.deepEqual(requestsFromTool({kind: 'creezio.widget.render.v1', input: {items: [request]}}), [request]);
  assert.deepEqual(requestFromTool({kind: 'creezio.widget.action.v1', state: 'succeeded', output: {request}}), request);
  assert.equal(requestFromTool({kind: 'creezio.widget.action.v1', state: 'unknown', output: {request}}), null);
  assert.equal(requestsFromTool({items: [{...request, revision: -1}]}), null);
});

test('message presents the real proposed amount without asking to buy or approve', () => {
  assert.match(amountLabel(request), /129,99/);
  const text = proposedMessage(request);
  assert.match(text, /Ordinateur/);
  assert.match(text, /soumise/);
  assert.match(text, /129,99/);
  assert.match(text, /aucun achat, paiement ou approbation n’est demandé/);
});

test('late widget reads cannot replace another card or downgrade a selected revision', () => {
  assert.equal(nextCardRequest(request, {...request, id: 'other'}), null);
  assert.equal(nextCardRequest(request, {...request, revision: 2}), null);
  assert.equal(nextCardRequest(request, {...request, revision: 4})?.revision, 4);
  assert.equal(mergeRequestPage([request], [{...request, revision: 2}])[0].revision, 3);
  assert.equal(mergeRequestPage([request], [{...request, revision: 4}])[0].revision, 4);
});

test('model context contains only the selected identifier, title and revision on every host', () => {
  assert.deepEqual(contextInput(request), {id: 'req-1', title: 'Ordinateur', revision: 3});
});
