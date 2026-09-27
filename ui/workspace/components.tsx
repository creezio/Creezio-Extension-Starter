'use client';

import {Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle} from '@creezio/sdk/ui';
import type {PurchaseAttachment, PurchaseRequest} from '../../module/public-contract.ts';
import {amountMinor, type PurchaseDraft} from './state.ts';

export const statusLabel = (status: PurchaseRequest['status']) => ({
  draft: 'Brouillon', submitted: 'Soumise', withdrawn: 'Retirée',
})[status];

export function formatAmount(minor: number, currency: string): string {
  try {
    const digits = new Intl.NumberFormat('fr-FR', {style: 'currency', currency}).resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat('fr-FR', {style: 'currency', currency}).format(minor / 10 ** digits);
  } catch { return `${minor} ${currency} (unités mineures)`; }
}

export function RequestList(props: {items: readonly PurchaseRequest[]; onOpen: (id: string) => void}) {
  if (!props.items.length) return <Card><CardContent className="py-8 text-sm text-slate-600">
    Aucune demande d’achat pour ce compte et ce contexte.</CardContent></Card>;
  return <div className="grid gap-3">{props.items.map(item => <Card key={item.id}>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div className="min-w-0"><CardTitle className="truncate text-base">{item.title}</CardTitle>
        <CardDescription>{formatAmount(item.amountMinor, item.currency)}</CardDescription></div>
      <Badge variant={item.status === 'draft' ? 'outline' : item.status === 'submitted' ? 'success' : 'secondary'}>
        {statusLabel(item.status)}</Badge>
    </CardHeader><CardContent className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">Révision {item.revision}</span>
      <Button size="sm" variant="outline" onClick={() => props.onOpen(item.id)} aria-label={`Ouvrir ${item.title}`}>
        Ouvrir la fiche</Button>
    </CardContent></Card>)}</div>;
}

const field = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50';

export function RequestEditor(props: {draft: PurchaseDraft; disabled: boolean;
  onChange: (draft: PurchaseDraft) => void; onSubmit: () => void; submitLabel: string;
  submitDisabled?: boolean}) {
  const value = amountMinor(props.draft.amountText, props.draft.currency);
  return <form className="space-y-4" onSubmit={event => {event.preventDefault(); props.onSubmit();}}>
    <label className="block text-sm font-medium text-slate-800">Titre
      <input className={field} autoComplete="off" maxLength={240} required value={props.draft.title}
        disabled={props.disabled} onChange={event => props.onChange({...props.draft, title: event.target.value})} /></label>
    <label className="block text-sm font-medium text-slate-800">Description
      <textarea className={field} rows={5} maxLength={4000} value={props.draft.description}
        disabled={props.disabled} onChange={event => props.onChange({...props.draft, description: event.target.value})} /></label>
    <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
      <label className="block text-sm font-medium text-slate-800">Montant proposé
        <input className={field} inputMode="decimal" autoComplete="off" maxLength={32} required
          value={props.draft.amountText} disabled={props.disabled}
          onChange={event => props.onChange({...props.draft, amountText: event.target.value})} />
        {props.draft.amountText && value === null && <span role="alert" className="mt-1 block text-xs text-red-700">
          Montant invalide pour cette devise.</span>}</label>
      <label className="block text-sm font-medium text-slate-800">Devise
        <input className={field} autoComplete="off" maxLength={3} pattern="[A-Z]{3}" required
          value={props.draft.currency} disabled={props.disabled}
          onChange={event => props.onChange({...props.draft, currency: event.target.value.toUpperCase()})} /></label>
    </div>
    <p className="text-xs text-slate-500">Le montant est une proposition. Soumettre la demande n’effectue aucun achat ni paiement.</p>
    <Button type="submit" disabled={props.disabled || props.submitDisabled || value === null || !props.draft.title.trim()}>{props.submitLabel}</Button>
  </form>;
}

export function AttachmentList(props: {items: readonly PurchaseAttachment[];
  onDownload: (attachment: PurchaseAttachment) => void; disabled: boolean}) {
  return <Card><CardHeader><CardTitle className="text-base">Pièces jointes</CardTitle>
    <CardDescription>Fichiers liés à cette demande uniquement.</CardDescription></CardHeader>
    <CardContent>{props.items.length ? <ul className="space-y-2">{props.items.map(item =>
      <li key={item.fileId} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm">
        <span className="min-w-0 break-all">{item.filename}</span>
        <Button size="sm" variant="outline" disabled={props.disabled}
          onClick={() => props.onDownload(item)}>Télécharger</Button>
      </li>)}</ul> : <p className="text-sm text-slate-500">Aucune pièce jointe.</p>}</CardContent>
  </Card>;
}
