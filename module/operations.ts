import {OperationError} from '@creezio/sdk/operations/handler';
import type {JsonValue, OperationContext, OperationHandler} from '@creezio/sdk/operations/handler';
import type {AttachmentLinkInput, AttachmentListInput, PurchaseAttachment, PurchaseRequest,
  RequestCreateInput, RequestGetInput, RequestListInput, RequestTransitionInput, RequestUpdateInput} from './public-contract.js';

type Row = Record<string, JsonValue>;
const now = () => new Date().toISOString();
// The context-scoped DataPort inserts and filters context_id itself. Passing it from module code is forbidden.
const scope = (context: OperationContext) => ({owner_id: context.principalId});
const key = (context: OperationContext, id: string) => ({...scope(context), id});
const id = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const conflict = (): never => {throw new OperationError('conflict');};
const inputError = (): never => {throw new OperationError('invalid_input');};

function details(value: RequestCreateInput) {
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 240
    || typeof value.description !== 'string' || value.description.length > 4000
    || !Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0 || value.amountMinor > 1_000_000_000_000
    || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) inputError();
  return {title: value.title.trim(), description: value.description,
    amount_minor: value.amountMinor, currency: value.currency};
}
function projected(row: Row): PurchaseRequest {
  return {id: String(row.id), title: String(row.title), description: String(row.description),
    amountMinor: Number(row.amount_minor), currency: String(row.currency),
    status: row.status as PurchaseRequest['status'], revision: Number(row.revision),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    submittedAt: row.submitted_at === null ? null : String(row.submitted_at)};
}
function attachment(row: Row): PurchaseAttachment {
  return {requestId: String(row.request_id), fileId: String(row.file_id), filename: String(row.filename),
    contentType: String(row.content_type), byteSize: Number(row.byte_size), digest: String(row.digest),
    createdAt: String(row.created_at), reference: {fileId: String(row.file_id),
      intentId: String(row.intent_id), generation: String(row.generation), digest: String(row.digest)}};
}
async function ownRequest(context: OperationContext, requestId: unknown): Promise<Row> {
  if (!id(requestId)) throw new OperationError('invalid_input');
  const row = await context.data.get('request', {key: key(context, requestId)}) as Row | null;
  if (!row) throw new OperationError('not_found');
  return row;
}
function revision(row: Row, expected: unknown): number {
  if (!Number.isSafeInteger(expected) || expected !== row.revision) conflict();
  return Number(expected);
}
function page(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 50) inputError();
  return Number(value);
}
function cursor(value: unknown, context: OperationContext, kind: 'request' | 'attachment', requestId?: string): Row | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new OperationError('invalid_input');
  try {
    const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),
      character=>character.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Record<string, unknown>;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)
      || decoded.contextId !== context.contextId || decoded.ownerId !== context.principalId
      || decoded.audience !== context.audience
      || decoded.kind !== kind || decoded.requestId !== (requestId ?? null)
      || typeof decoded.time !== 'string' || decoded.time.length > 35 || !id(decoded.id))
      throw new OperationError('invalid_input');
    return kind === 'request'
      ? {...scope(context), updated_at: decoded.time, id: decoded.id}
      : {...scope(context), request_id: requestId!, created_at: decoded.time, file_id: decoded.id};
  } catch {throw new OperationError('invalid_input');}
}
function nextCursor(row: Row | null, context: OperationContext, kind: 'request' | 'attachment', requestId?: string): string | null {
  if (!row) return null;
  const bytes=new TextEncoder().encode(JSON.stringify({contextId: context.contextId,
    ownerId: context.principalId,audience:context.audience,
    kind, requestId: requestId ?? null, time: row[kind === 'request' ? 'updated_at' : 'created_at'],
    id: row[kind === 'request' ? 'id' : 'file_id']}));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

/** Submitting records a request only. No purchase, payment or budget decision occurs. */
export const requestCreate: OperationHandler = (value, context) => {
  const input = value as unknown as RequestCreateInput, at = now(), row = {...scope(context), id: crypto.randomUUID(),
    ...details(input), status: 'draft', revision: 1, created_at: at, updated_at: at, submitted_at: null};
  return {output: {request: projected(row)}, plans: [context.data.planCreate('request', {values: row})]};
};
export const requestList: OperationHandler = async (value, context) => {
  const input = value as unknown as RequestListInput, limit = page(input.limit);
  const result = await context.data.list('request', {limit, where: scope(context),
    order: {indexId: 'recent', direction: 'desc'}, after: cursor(input.cursor, context, 'request')});
  return {output: {items: result.items.map(row => projected(row as Row)),
    nextCursor: nextCursor(result.nextAfter as Row | null, context, 'request')}};
};
export const requestGet: OperationHandler = async (value, context) => {
  const input = value as unknown as RequestGetInput;
  if (!id(input.id)) throw new OperationError('invalid_input');
  const row = await context.data.get('request', {key: key(context, input.id)}) as Row | null;
  return {output: {request: row ? projected(row) : null}};
};
export const requestUpdate: OperationHandler = async (value, context) => {
  const input = value as unknown as RequestUpdateInput, row = await ownRequest(context, input.id);
  const expected = revision(row, input.revision);
  if (row.status !== 'draft') conflict();
  const changes = {...details(input), updated_at: now()};
  const plan = context.data.planPatch('request', {key: key(context, input.id),
    where: {status: 'draft'}, compare: {field: 'revision', expected}, values: changes});
  return {output: {request: projected({...row, ...changes, revision: expected + 1})}, plans: [plan]};
};
async function transition(value: JsonValue, context: OperationContext, state: 'submitted' | 'withdrawn') {
  const input = value as unknown as RequestTransitionInput, row = await ownRequest(context, input.id);
  const expected = revision(row, input.revision);
  if (row.status !== (state === 'submitted' ? 'draft' : 'submitted')) conflict();
  const at = now(), changes: Row = {status: state, updated_at: at};
  if (state === 'submitted') changes.submitted_at = at;
  const plan = context.data.planPatch('request', {key: key(context, input.id),
    where: {status: row.status}, compare: {field: 'revision', expected}, values: changes});
  return {output: {request: projected({...row, ...changes, revision: expected + 1})}, plans: [plan]};
}
export const requestSubmit: OperationHandler = (value, context) => transition(value, context, 'submitted');
export const requestWithdraw: OperationHandler = (value, context) => transition(value, context, 'withdrawn');

export const attachmentLink: OperationHandler = async (value, context) => {
  const input = value as unknown as AttachmentLinkInput, row = await ownRequest(context, input.id);
  const expected = revision(row, input.revision);
  if (row.status !== 'draft') conflict();
  if (!context.files) throw new OperationError('unsupported');
  const prepared = await context.files.preparePublication('request-attachment', input.staged);
  const at = now(), linked = {...scope(context), request_id: input.id, file_id: prepared.file.fileId,
    filename: prepared.file.filename, content_type: prepared.file.contentType,
    byte_size: prepared.file.byteSize, digest: input.staged.digest,
    intent_id: input.staged.intentId, generation: input.staged.generation, created_at: at};
  const guard = context.data.planGet('request', {key: key(context, input.id), where: {status: 'draft'}, required: true});
  const link = context.data.planCreate('request_attachment', {values: linked});
  const bump = context.data.planPatch('request', {key: key(context, input.id),
    where: {status: 'draft'}, compare: {field: 'revision', expected}, values: {updated_at: at}});
  return {output: {attachment: attachment(linked), requestRevision: expected + 1},
    plans: [prepared.plan, guard, link, bump]};
};
export const attachmentList: OperationHandler = async (value, context) => {
  const input = value as unknown as AttachmentListInput, limit = page(input.limit);
  await ownRequest(context, input.id);
  const result = await context.data.list('request_attachment', {limit,
    where: {...scope(context), request_id: input.id}, order: {indexId: 'by-request', direction: 'asc'},
    after: cursor(input.cursor, context, 'attachment', input.id)});
  return {output: {items: result.items.map(row => attachment(row as Row)),
    nextCursor: nextCursor(result.nextAfter as Row | null, context, 'attachment', input.id)}};
};
