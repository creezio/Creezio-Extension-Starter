import type {PurchaseRequest} from '../../module/public-contract.ts';
import {purchaseRequest} from '../workspace/state.ts';

function payload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (envelope.kind === 'creezio.widget.render.v1') return envelope.input;
  if (envelope.kind === 'creezio.widget.action.v1' && envelope.state === 'succeeded') return envelope.output;
  return value;
}

export function requestFromTool(value: unknown): PurchaseRequest | null {
  const data = payload(value);
  const wrapped = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).request : null;
  return purchaseRequest(wrapped ?? data);
}

export function requestsFromTool(value: unknown): PurchaseRequest[] | null {
  const data = payload(value);
  const items = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).items : null;
  if (!Array.isArray(items) || items.length > 50) return null;
  const parsed = items.map(item => purchaseRequest(item));
  return parsed.every(Boolean) ? parsed as PurchaseRequest[] : null;
}

/** A delayed result must not replace another card or an already observed revision. */
export function nextCardRequest(current: PurchaseRequest | null, incoming: PurchaseRequest): PurchaseRequest | null {
  return current && (incoming.id !== current.id || incoming.revision < current.revision) ? null : incoming;
}

export function mergeRequestPage(previous: readonly PurchaseRequest[], incoming: readonly PurchaseRequest[]): PurchaseRequest[] {
  const known = new Map(previous.map(item => [item.id, item]));
  return incoming.map(item => {
    const old = known.get(item.id);
    return old && old.revision > item.revision ? old : item;
  });
}

export type RequestContextInput = Readonly<{id: string; title: string; revision: number}>;

/** Same minimal action schema for Creezio and external MCP Apps hosts. */
export function contextInput(request: PurchaseRequest): RequestContextInput {
  return {id: request.id, title: request.title, revision: request.revision};
}

export function amountLabel(request: PurchaseRequest): string {
  try {
    const format = new Intl.NumberFormat('fr-FR', {style: 'currency', currency: request.currency});
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(request.amountMinor / 10 ** digits);
  } catch { return `${request.amountMinor} unités mineures ${request.currency}`; }
}

export function proposedMessage(request: PurchaseRequest): string {
  const status = {draft: 'brouillon', submitted: 'soumise', withdrawn: 'retirée'}[request.status];
  return `Aide-moi à examiner la demande d’achat ${request.id} (« ${request.title} »), `
    + `statut ${status}, montant proposé ${amountLabel(request)}. `
    + 'Il s’agit d’un examen ; aucun achat, paiement ou approbation n’est demandé.';
}
