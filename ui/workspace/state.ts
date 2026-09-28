import {PURCHASE_OPERATIONS, purchaseBindingId, type PurchaseAttachment, type PurchaseRequest} from '../../module/public-contract.ts';
import {readPendingCommand, type PendingCommand} from '@creezio/sdk/operations/command-journal';

export type PurchaseDraft = Readonly<{
  title: string;
  description: string;
  amountText: string;
  currency: string;
}>;
export type LegacyPendingPurchaseCommand = Readonly<{
  operationId: typeof PURCHASE_OPERATIONS[keyof typeof PURCHASE_OPERATIONS];
  requestKey: string;
  executionId?: string;
}>;
export type PendingPurchaseCommand = LegacyPendingPurchaseCommand | PendingCommand;
export const isLegacyPending = (pending: PendingPurchaseCommand): pending is LegacyPendingPurchaseCommand =>
  'operationId' in pending;
/** Only non-secret presentation state is restored by the host's validated panel store. */
export type PurchasePanelStateV1 = Readonly<{
  version: 1;
  draft: PurchaseDraft;
  baseRevision: number | null;
  dirty: boolean;
  pending: PendingPurchaseCommand | null;
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit && value.isWellFormed()
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const scopedId = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);

export function purchaseRequest(value: unknown): PurchaseRequest | null {
  if (!object(value) || !bounded(value.id, 128) || !value.id || !bounded(value.title, 240)
    || !bounded(value.description, 4000) || !Number.isSafeInteger(value.amountMinor)
    || (value.amountMinor as number) < 0 || (value.amountMinor as number) > 1_000_000_000_000
    || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)
    || !['draft', 'submitted', 'withdrawn'].includes(String(value.status))
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1
    || !['createdAt', 'updatedAt'].every(key => typeof value[key] === 'string')
    || value.submittedAt !== null && typeof value.submittedAt !== 'string') return null;
  return value as unknown as PurchaseRequest;
}

export function purchaseAttachment(value: unknown): PurchaseAttachment | null {
  if (!object(value) || !bounded(value.requestId, 128) || !bounded(value.fileId, 128)
    || !bounded(value.filename, 255) || !bounded(value.contentType, 128)
    || !Number.isSafeInteger(value.byteSize) || (value.byteSize as number) < 0
    || !bounded(value.digest, 128) || !bounded(value.createdAt, 64) || !object(value.reference)
    || !['fileId', 'intentId', 'generation', 'digest'].every(key =>
      bounded((value.reference as Record<string, unknown>)[key], 128))) return null;
  return value as unknown as PurchaseAttachment;
}

export const emptyDraft = (): PurchaseDraft => ({title: '', description: '', amountText: '', currency: 'EUR'});

export function fractionDigits(currency: string): number {
  try { return new Intl.NumberFormat('fr-FR', {style: 'currency', currency}).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}

export function amountInput(amountMinor: number, currency: string): string {
  const digits = fractionDigits(currency), divisor = 10 ** digits;
  return (amountMinor / divisor).toFixed(digits);
}

export function amountMinor(text: string, currency: string): number | null {
  const digits = fractionDigits(currency), normalized = text.trim().replace(',', '.');
  if (!/^(0|[1-9]\d{0,12})(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, decimal = ''] = normalized.split('.');
  if (decimal.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number(decimal.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) && minor <= 1_000_000_000_000 ? minor : null;
}

export function draftFromRequest(request: PurchaseRequest): PurchaseDraft {
  return {title: request.title, description: request.description,
    amountText: amountInput(request.amountMinor, request.currency), currency: request.currency};
}

export function validDraft(draft: PurchaseDraft): boolean {
  return draft.title.trim().length > 0 && draft.title.length <= 240
    && draft.description.length <= 4000 && /^[A-Z]{3}$/.test(draft.currency)
    && amountMinor(draft.amountText, draft.currency) !== null;
}

export function panelState(value: unknown): PurchasePanelStateV1 | null {
  if (!object(value) || value.version !== 1 || !object(value.draft)
    || !bounded(value.draft.title, 240) || !bounded(value.draft.description, 4000)
    || !bounded(value.draft.amountText, 32) || !/^[A-Z]{3}$/.test(String(value.draft.currency))
    || value.baseRevision !== null && (!Number.isSafeInteger(value.baseRevision) || (value.baseRevision as number) < 1)
    || typeof value.dirty !== 'boolean') return null;
  if (value.pending !== null) {
    if (!object(value.pending)) return null;
    if ('operationId' in value.pending) {
      if (!Object.values(PURCHASE_OPERATIONS).includes(value.pending.operationId as typeof PURCHASE_OPERATIONS[keyof typeof PURCHASE_OPERATIONS])
        || !bounded(value.pending.requestKey, 128) || !value.pending.requestKey
        || value.pending.executionId !== undefined && !bounded(value.pending.executionId, 128)) return null;
    } else if (!scopedId(value.pending.sessionId)
      || !['admin', 'app'].includes(String(value.pending.audience))
      || !scopedId(value.pending.contextId)
      || !readPendingCommand(value.pending, {sessionId: value.pending.sessionId,
        audience: value.pending.audience as 'admin' | 'app', contextId: value.pending.contextId})
      || !Object.values(PURCHASE_OPERATIONS).some(operationId =>
        value.pending && object(value.pending) && value.pending.bindingId ===
          purchaseBindingId(value.pending.audience as 'admin' | 'app', operationId))
      || !bounded(value.pending.requestKey, 128) || !value.pending.requestKey
      || value.pending.intent !== undefined && (!bounded(value.pending.intent, 64)
        || !Object.values(PURCHASE_OPERATIONS).includes(value.pending.intent as typeof PURCHASE_OPERATIONS[keyof typeof PURCHASE_OPERATIONS]))
      || value.pending.targetId !== undefined && !scopedId(value.pending.targetId)
      || Object.keys(value.pending).some(key => !['sessionId','audience','contextId','bindingId',
        'requestKey','intent','targetId'].includes(key))) return null;
  }
  return value as PurchasePanelStateV1;
}

export function initialPanelState(): PurchasePanelStateV1 {
  return {version: 1, draft: emptyDraft(), baseRevision: null, dirty: false, pending: null};
}

/** A fresh reference also wakes a retained panel restored from the same SDK snapshot. */
export function restoredPanelState(value: unknown): PurchasePanelStateV1 {
  return {...(panelState(value) ?? initialPanelState())};
}

export function reconcileRequest(state: PurchasePanelStateV1, request: PurchaseRequest):
  {state: PurchasePanelStateV1; conflict: boolean} {
  if (state.baseRevision === request.revision) return {state, conflict: false};
  if (state.dirty || state.pending) return {state, conflict: state.baseRevision !== null};
  return {state: {...state, draft: draftFromRequest(request), baseRevision: request.revision,
    dirty: false}, conflict: false};
}

/** A terminal status may arrive after a fresher request.get was already shown. */
export function commandResultForCurrent(current: PurchaseRequest | null, latestRevision: number | null,
  candidate: PurchaseRequest | null): PurchaseRequest | null {
  return candidate && (!current || candidate.id === current.id)
    && (!current || candidate.revision >= current.revision)
    && (latestRevision === null || candidate.revision >= latestRevision) ? candidate : null;
}

export function pendingStatusTarget(pending: LegacyPendingPurchaseCommand) {
  return pending.executionId ? {executionId: pending.executionId} : {requestKey: pending.requestKey};
}

/** Inspection cannot supersede the lease of a still-running mutation. */
export function canInspectPending(pending: PendingPurchaseCommand | null, available: boolean,
  checking: boolean, busy: boolean, inFlight: boolean): pending is PendingPurchaseCommand {
  return !!pending && available && !checking && !busy && !inFlight;
}

export function canRenderPanel(ready: boolean, active: boolean, authorized: boolean,
  activity: boolean): boolean {
  return ready && active && authorized && activity;
}
