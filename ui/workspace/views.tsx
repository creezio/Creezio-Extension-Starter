'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent,
  TabsList, TabsTrigger} from '@creezio/sdk/ui';
import {RetainedSubViews, useWorkspaceActivity} from '@creezio/sdk/workspace/components';
import {useRegisterWorkspaceMetadata} from '@creezio/sdk/workspace/metadata';
import {useRegisterPageToolbar} from '@creezio/sdk/workspace/toolbar';
import type {WorkspaceViewProps} from '@creezio/sdk/workspace/types';
import {createFileClient} from '@creezio/sdk/files/client';
import type {OperationClientResult} from '@creezio/sdk/operations/client';
import {PURCHASE_MODULE_ID, PURCHASE_OPERATIONS, purchaseBindingId,
  type PurchaseAttachment, type PurchaseRequest} from '../../module/public-contract.ts';
import {AttachmentList, formatAmount, RequestEditor, RequestList, statusLabel} from './components.tsx';
import {amountMinor, draftFromRequest, initialPanelState, panelState, pendingStatusTarget,
  purchaseAttachment, purchaseRequest, reconcileRequest, validDraft,
  type PendingPurchaseCommand, type PurchasePanelStateV1} from './state.ts';

const LIST_VIEW = `${PURCHASE_MODULE_ID}:list`;
const NEW_VIEW = `${PURCHASE_MODULE_ID}:new`;
const DETAIL_VIEW = `${PURCHASE_MODULE_ID}:detail`;
const FILE_CATEGORY = 'request-attachment';
type OperationId = typeof PURCHASE_OPERATIONS[keyof typeof PURCHASE_OPERATIONS];

const succeeded = (result: OperationClientResult) => result.kind === 'execution'
  && result.execution.state === 'succeeded' ? result.execution.output : null;
const requestOutput = (output: unknown): PurchaseRequest | null => {
  const value = output && typeof output === 'object' ? output as {request?: unknown} : null;
  return purchaseRequest(value?.request);
};
const listOutput = (output: unknown): {items: PurchaseRequest[]; nextCursor: string | null} | null => {
  const value = output && typeof output === 'object' ? output as {items?: unknown; nextCursor?: unknown} : null;
  if (!Array.isArray(value?.items) || value.items.length > 200 || !value.items.every(item => purchaseRequest(item))
    || value.nextCursor !== null && typeof value.nextCursor !== 'string') return null;
  return {items: value.items as PurchaseRequest[], nextCursor: value.nextCursor as string | null};
};
const attachmentsOutput = (output: unknown): {items: PurchaseAttachment[]; nextCursor: string | null} | null => {
  const value = output && typeof output === 'object' ? output as {items?: unknown; nextCursor?: unknown} : null;
  if (!Array.isArray(value?.items) || value.items.length > 200 || !value.items.every(item => purchaseAttachment(item))
    || value.nextCursor !== null && typeof value.nextCursor !== 'string') return null;
  return {items: value.items as PurchaseAttachment[], nextCursor: value.nextCursor as string | null};
};
const issue = (result: OperationClientResult) => result.kind === 'rejected'
  ? 'Action refusée. Vérifiez vos droits et actualisez la fiche.'
  : 'Résultat incertain. Vérifiez l’exécution avant une nouvelle tentative.';

/** Same component is mounted by the workspace and by a compatible front theme. */
export function purchaseRequestsList(props: WorkspaceViewProps) {
  useRegisterWorkspaceMetadata(props.panelId, {title: 'Demandes d’achat', kind: 'section'});
  const activity = useWorkspaceActivity();
  const [items, setItems] = useState<PurchaseRequest[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useRegisterPageToolbar(props.panelId, props.location.url, <>
    <Button size="sm" variant="outline" disabled={!props.active || !activity || loading}
      onClick={() => setRefresh(value => value + 1)}>Actualiser</Button>
    <Button size="sm" disabled={!props.active || !activity}
      onClick={() => props.navigation.open(NEW_VIEW)}>Nouvelle demande</Button>
  </>);
  useEffect(() => {
    if (!props.active || !activity || !props.authorized) return;
    let current = true;
    setLoading(true); setMessage('');
    void props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.list),
      contextId: props.contextId, input: {limit: 30}, isCurrent: () => current}).then(result => {
      if (!current) return;
      const page = listOutput(succeeded(result));
      if (page) {setItems(page.items); setNextCursor(page.nextCursor);}
      else setMessage('Liste indisponible. Actualisez pour réessayer.');
    }).finally(() => {if (current) setLoading(false);});
    return () => {current = false;};
  }, [props.active, activity, props.authorized, props.audience, props.client, props.contextId, refresh]);
  async function more() {
    if (!nextCursor || loading || !props.active || !activity || !props.authorized) return;
    setLoading(true);
    try {
      const result = await props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.list),
        contextId: props.contextId, input: {limit: 30, cursor: nextCursor},
        isCurrent: () => props.active && props.authorized});
      const page = listOutput(succeeded(result));
      if (!page) {setMessage('Page suivante indisponible.'); return;}
      setItems(previous => {
        const known = new Set(previous.map(item => item.id));
        return [...previous, ...page.items.filter(item => !known.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } finally {setLoading(false);}
  }
  return <section className="space-y-4 p-6" aria-label="Demandes d’achat">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">Demandes d’achat</h1>
      <p className="text-sm text-slate-600">Vos demandes et leur montant proposé.</p></div>
      <Button onClick={() => props.navigation.open(NEW_VIEW)} disabled={!props.active || !activity}>Nouvelle demande</Button></div>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    {loading && !items.length ? <p role="status" className="text-sm text-slate-500">Chargement…</p>
      : <RequestList items={items} onOpen={id => props.navigation.open(DETAIL_VIEW, {id})} />}
    {nextCursor && <Button variant="outline" disabled={loading || !props.active || !activity}
      onClick={() => void more()}>Demandes plus anciennes</Button>}
  </section>;
}

function usePanelDraft(props: WorkspaceViewProps) {
  const [state, setState] = useState<PurchasePanelStateV1>(() =>
    panelState(props.navigation.readPanelState()?.data) ?? initialPanelState());
  const stateRef = useRef(state);
  const [storageWarning, setStorageWarning] = useState(false);
  const commit = useCallback((next: PurchasePanelStateV1, activeSubview: 'details' | 'attachments' = 'details') => {
    stateRef.current = next; setState(next);
    setStorageWarning(!props.navigation.savePanelState({activeSubview, data: next}));
  }, [props.navigation]);
  return {state, stateRef, commit, storageWarning};
}

function PendingNotice(props: {pending: PendingPurchaseCommand | null; onCheck: () => void;
  checking: boolean}) {
  if (!props.pending) return null;
  return <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    Résultat de « {props.pending.operationId} » incertain. Aucune nouvelle commande n’est envoyée avant vérification.
    <Button size="sm" variant="outline" className="ml-2" disabled={props.checking} onClick={props.onCheck}>
      {props.checking ? 'Vérification…' : 'Vérifier l’exécution'}</Button>
  </div>;
}

export function purchaseRequestNew(props: WorkspaceViewProps) {
  useRegisterWorkspaceMetadata(props.panelId, {title: 'Nouvelle demande', kind: 'entity', trail: [
    {label: 'Demandes d’achat', href: '/requests'}, {label: 'Nouvelle demande'}]});
  const activity = useWorkspaceActivity();
  const {state, stateRef, commit, storageWarning} = usePanelDraft(props);
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const available = props.active && activity && props.authorized;
  useRegisterPageToolbar(props.panelId, props.location.url,
    <Button size="sm" variant="ghost" onClick={() => props.navigation.open(LIST_VIEW)}>Demandes</Button>);
  function accept(result: OperationClientResult, key: string) {
    if (stateRef.current.pending?.requestKey !== key) return;
    const created = requestOutput(succeeded(result));
    if (created) {
      commit({...stateRef.current, pending: null, dirty: false});
      props.navigation.open(DETAIL_VIEW, {id: created.id});
      return;
    }
    if (result.kind === 'rejected' || result.kind === 'execution' && result.execution.state === 'failed') {
      commit({...stateRef.current, pending: null}); setMessage(issue(result));
      return;
    }
    const executionId = result.kind === 'execution' ? result.execution.id
      : result.kind === 'unknown' ? result.executionId : undefined;
    commit({...stateRef.current, pending: {operationId: PURCHASE_OPERATIONS.create, requestKey: key,
      ...(executionId ? {executionId} : {})}});
    setMessage('Création incertaine. Vérifiez l’exécution avant de réessayer.');
  }
  async function create() {
    const current = stateRef.current;
    if (!available || busy || inFlight.current || current.pending || !validDraft(current.draft)) return;
    const amount = amountMinor(current.draft.amountText, current.draft.currency);
    if (amount === null) return;
    const requestKey = crypto.randomUUID();
    commit({...current, pending: {operationId: PURCHASE_OPERATIONS.create, requestKey}});
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const result = await props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.create),
        contextId: props.contextId, input: {requestKey, title: current.draft.title.trim(),
          description: current.draft.description, amountMinor: amount, currency: current.draft.currency}});
      accept(result, requestKey);
    } finally {inFlight.current = false; setBusy(false);}
  }
  async function check() {
    const pending = stateRef.current.pending;
    if (!pending || !available || checking) return;
    setChecking(true);
    try {
      const result = await props.client.status({bindingId: purchaseBindingId(props.audience, pending.operationId),
        contextId: props.contextId, ...pendingStatusTarget(pending)});
      accept(result, pending.requestKey);
    } finally {setChecking(false);}
  }
  return <section className="space-y-4 p-6" aria-label="Nouvelle demande d’achat">
    <h1 className="text-lg font-semibold">Nouvelle demande d’achat</h1>
    <Card><CardHeader><CardTitle className="text-base">Préparer une demande</CardTitle>
      <CardDescription>Elle reste brouillon tant que vous ne la soumettez pas explicitement.</CardDescription></CardHeader>
      <CardContent><RequestEditor draft={state.draft} disabled={!available || busy || !!state.pending}
        onChange={draft => commit({...stateRef.current, draft, dirty: true})}
        onSubmit={() => void create()} submitLabel={busy ? 'Création…' : 'Créer le brouillon'} /></CardContent></Card>
    <PendingNotice pending={state.pending} checking={checking} onCheck={() => void check()} />
    {message && <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>}
    {storageWarning && <p role="alert" className="text-sm text-amber-800">
      Brouillon conservé dans ce panneau ; sa restauration après rechargement n’est pas garantie.</p>}
  </section>;
}

export function purchaseRequestDetail(props: WorkspaceViewProps) {
  const id = props.input.id ?? '';
  const activity = useWorkspaceActivity();
  const {state, stateRef, commit, storageWarning} = usePanelDraft(props);
  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [attachments, setAttachments] = useState<PurchaseAttachment[]>([]);
  const [attachmentCursor, setAttachmentCursor] = useState<string | null>(null);
  const [section, setSection] = useState<'details' | 'attachments'>(() =>
    props.navigation.readPanelState()?.activeSubview === 'attachments' ? 'attachments' : 'details');
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false), [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false), latestRevision = useRef<number | null>(null);
  const available = props.active && activity && props.authorized;
  const fileClient = useMemo(() => createFileClient({access: props.access, moduleId: PURCHASE_MODULE_ID,
    categoryId: FILE_CATEGORY, contextId: props.contextId}), [props.access, props.contextId]);
  const pageTitle = request?.title.slice(0, 200) || 'Demande d’achat';
  useRegisterWorkspaceMetadata(props.panelId, {title: pageTitle, kind: 'entity', trail: [
    {label: 'Demandes d’achat', href: '/requests'}, {label: pageTitle}]});
  useRegisterPageToolbar(props.panelId, props.location.url, <>
    <Button size="sm" variant="ghost" onClick={() => props.navigation.open(LIST_VIEW)}>Demandes</Button>
    <Button size="sm" variant="outline" disabled={!available || loading}
      onClick={() => setRefresh(value => value + 1)}>Actualiser</Button>
  </>);
  const persist = useCallback((next: PurchasePanelStateV1, subview = section) => {
    stateRef.current = next;
    commit(next, subview);
  }, [commit, section, stateRef]);
  function acceptRequest(next: PurchaseRequest) {
    if (next.id !== id || latestRevision.current !== null && next.revision < latestRevision.current) return false;
    latestRevision.current = next.revision;
    setRequest(next);
    const outcome = reconcileRequest(stateRef.current, next);
    if (outcome.state !== stateRef.current) persist(outcome.state);
    if (outcome.conflict) setMessage('La fiche a changé. Votre brouillon est conservé ; choisissez comment reprendre.');
    return true;
  }
  const readAttachments = useCallback(async (cursor?: string) => {
    if (!available || !id) return;
    const result = await props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.attachmentList),
      contextId: props.contextId, input: {id, limit: 30, ...(cursor ? {cursor} : {})}});
    const page = attachmentsOutput(succeeded(result));
    if (!page || page.items.some(item => item.requestId !== id)) {
      setMessage('Pièces jointes indisponibles.'); return;
    }
    setAttachments(previous => cursor ? [...previous, ...page.items.filter(item => !previous.some(old => old.fileId === item.fileId))] : page.items);
    setAttachmentCursor(page.nextCursor);
  }, [available, id, props.audience, props.client, props.contextId]);
  useEffect(() => {
    if (!available || !id) return;
    let current = true;
    setLoading(true);
    void props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.get),
      contextId: props.contextId, input: {id}, isCurrent: () => current}).then(result => {
      if (!current) return;
      const next = requestOutput(succeeded(result));
      if (next) acceptRequest(next);
      else setMessage('Fiche indisponible ou accès refusé.');
    }).finally(() => {if (current) setLoading(false);});
    void readAttachments();
    return () => {current = false;};
  }, [available, id, props.audience, props.client, props.contextId, refresh]);
  function commandSuccess(operationId: OperationId, output: unknown) {
    if (operationId === PURCHASE_OPERATIONS.attachmentLink) {
      const link = output && typeof output === 'object' ? output as {requestRevision?: unknown; attachment?: unknown} : null;
      const attached = purchaseAttachment(link?.attachment);
      const revision = link?.requestRevision;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision)
        || !attached || attached.requestId !== id) return false;
      if (!request || revision < request.revision) return false;
      latestRevision.current = revision;
      setRequest({...request, revision});
      persist({...stateRef.current, baseRevision: revision, pending: null});
      setRefresh(value => value + 1);
      setMessage('Pièce jointe liée à la demande.');
      return true;
    }
    const next = requestOutput(output);
    if (!next || next.id !== id) return false;
    latestRevision.current = next.revision;
    setRequest(next);
    persist({...stateRef.current, draft: draftFromRequest(next), baseRevision: next.revision,
      dirty: false, pending: null});
    setMessage(operationId === PURCHASE_OPERATIONS.submit ? 'Demande soumise. Aucun achat n’a été effectué.'
      : operationId === PURCHASE_OPERATIONS.withdraw ? 'Demande retirée.' : 'Demande enregistrée.');
    return true;
  }
  function acceptCommand(result: OperationClientResult, pending: PendingPurchaseCommand) {
    if (stateRef.current.pending?.requestKey !== pending.requestKey) return;
    if (result.kind === 'execution' && result.execution.state === 'succeeded'
      && commandSuccess(pending.operationId, result.execution.output)) return;
    if (result.kind === 'rejected' || result.kind === 'execution' && result.execution.state === 'failed') {
      persist({...stateRef.current, pending: null}); setMessage(issue(result)); return;
    }
    const executionId = result.kind === 'execution' ? result.execution.id
      : result.kind === 'unknown' ? result.executionId : undefined;
    persist({...stateRef.current, pending: {...pending, ...(executionId ? {executionId} : {})}});
    setMessage('Résultat incertain. Vérifiez l’exécution avant une nouvelle tentative.');
  }
  async function runCommand(operationId: OperationId, fields: Record<string, unknown>) {
    if (!available || !request || inFlight.current || stateRef.current.pending) return;
    const pending: PendingPurchaseCommand = {operationId, requestKey: crypto.randomUUID()};
    persist({...stateRef.current, pending});
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const result = await props.client.invoke({bindingId: purchaseBindingId(props.audience, operationId),
        contextId: props.contextId, input: {...fields, requestKey: pending.requestKey}});
      acceptCommand(result, pending);
    } finally {inFlight.current = false; setBusy(false);}
  }
  async function save() {
    const current = stateRef.current, amount = amountMinor(current.draft.amountText, current.draft.currency);
    if (!request || !current.dirty || !validDraft(current.draft) || amount === null
      || current.baseRevision !== request.revision
      || request.status !== 'draft') return;
    await runCommand(PURCHASE_OPERATIONS.update, {id, revision: current.baseRevision,
      title: current.draft.title.trim(), description: current.draft.description,
      amountMinor: amount, currency: current.draft.currency});
  }
  async function check() {
    const pending = stateRef.current.pending;
    if (!pending || !available || checking) return;
    setChecking(true);
    try {
      const result = await props.client.status({bindingId: purchaseBindingId(props.audience, pending.operationId),
        contextId: props.contextId, ...pendingStatusTarget(pending)});
      acceptCommand(result, pending);
    } finally {setChecking(false);}
  }
  async function upload(file: File) {
    if (!available || !request || busy || stateRef.current.pending || request.status !== 'draft') return;
    setBusy(true); setMessage('Téléversement en cours…');
    try {
      const staged = await fileClient.upload({file, filename: file.name, intentId: crypto.randomUUID(),
        isCurrent: () => props.active && props.authorized});
      if (staged.kind !== 'ready') {
        setMessage(staged.kind === 'unknown'
          ? 'Téléversement incertain. Vérifiez le fichier avant tout nouvel envoi.'
          : 'Téléversement refusé.');
        return;
      }
      setMessage('Fichier téléversé ; liaison à la demande en cours…');
      // Staging alone is not an attachment. The server publishes and links it atomically.
      await runCommand(PURCHASE_OPERATIONS.attachmentLink, {id, revision: request.revision,
        staged: staged.value.reference});
    } finally {setBusy(false);}
  }
  async function download(attachment: PurchaseAttachment) {
    if (!available) return;
    const result = await fileClient.download(attachment.reference,
      () => props.active && props.authorized);
    if (result.kind !== 'ready') {setMessage('Téléchargement indisponible.'); return;}
    const url = URL.createObjectURL(result.value);
    try {
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = attachment.filename; anchor.rel = 'noopener';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } finally {URL.revokeObjectURL(url);}
  }
  const conflict = !!request && state.baseRevision !== null && state.baseRevision !== request.revision;
  const editable = available && !!request && request.status === 'draft' && !busy && !state.pending && !conflict;
  return <article className="space-y-4 p-6" aria-label="Demande d’achat">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <h1 className="text-lg font-semibold">{request?.title ?? 'Demande d’achat'}</h1>
      {request && <p className="text-sm text-slate-600">{statusLabel(request.status)} · {formatAmount(request.amountMinor, request.currency)} · révision {request.revision}</p>}
    </div><Button size="sm" variant="outline" onClick={() => props.navigation.open(LIST_VIEW)}>Retour aux demandes</Button></div>
    {loading && !request && <p role="status">Chargement…</p>}
    {request && <><Tabs value={section} onValueChange={value => {
      const next = value === 'attachments' ? 'attachments' : 'details';
      setSection(next); props.navigation.savePanelState({activeSubview: next, data: stateRef.current});
    }}><TabsList><TabsTrigger value="details">Détails</TabsTrigger>
      <TabsTrigger value="attachments">Pièces jointes</TabsTrigger></TabsList></Tabs>
      <RetainedSubViews active={section} views={[
        {id: 'details', content: <Card><CardHeader><CardTitle className="text-base">Détails de la demande</CardTitle>
          <CardDescription>Les modifications sont enregistrées sur la révision affichée.</CardDescription></CardHeader>
          <CardContent className="space-y-4">{request.status === 'draft'
            ? <RequestEditor draft={state.draft} disabled={!editable} submitDisabled={!state.dirty}
              onChange={draft => persist({...stateRef.current, draft, dirty: true})}
              onSubmit={() => void save()} submitLabel={busy ? 'Enregistrement…' : 'Enregistrer le brouillon'} />
            : <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-medium text-slate-600">Statut</dt><dd>{statusLabel(request.status)}</dd></div>
              <div><dt className="font-medium text-slate-600">Montant proposé</dt>
                <dd>{formatAmount(request.amountMinor, request.currency)}</dd></div>
              <div className="sm:col-span-2"><dt className="font-medium text-slate-600">Description</dt>
                <dd className="whitespace-pre-wrap">{request.description || 'Aucune description.'}</dd></div>
            </dl>}
            {conflict && <div role="alert" className="rounded-md border border-amber-300 p-3 text-sm">
              La fiche serveur a changé depuis la révision {state.baseRevision}. Votre brouillon est conservé.
              <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() =>
                persist({...stateRef.current, baseRevision: request.revision})}>Rebaser mon brouillon</Button>
              <Button size="sm" variant="outline" onClick={() =>
                persist({...stateRef.current, draft: draftFromRequest(request), baseRevision: request.revision,
                  dirty: false})}>Adopter la version serveur</Button></div></div>}
            {request.status === 'draft' && <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <Button variant="outline" disabled={!available || busy || !!state.pending || conflict || state.dirty}
                onClick={() => void runCommand(PURCHASE_OPERATIONS.submit, {id, revision: request.revision})}>
                Soumettre la demande</Button></div>}
            {request.status === 'submitted' && <div className="border-t border-slate-200 pt-4">
              <Button variant="outline" disabled={!available || busy || !!state.pending || conflict}
                onClick={() => void runCommand(PURCHASE_OPERATIONS.withdraw, {id, revision: request.revision})}>
                Retirer la demande</Button></div>}
          </CardContent></Card>},
        {id: 'attachments', content: <div className="space-y-3"><AttachmentList items={attachments}
          disabled={!available} onDownload={attachment => void download(attachment)} />
          {attachmentCursor && <Button variant="outline" onClick={() => void readAttachments(attachmentCursor)}>
            Autres pièces jointes</Button>}
          {request.status === 'draft' && <label className="block text-sm font-medium text-slate-800">
            Ajouter un fichier (10 Mo maximum)
            <input type="file" className="mt-2 block w-full text-sm" disabled={!available || busy || !!state.pending}
              onChange={event => {const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '';}} />
          </label>}</div>},
      ]}/></>}
    <PendingNotice pending={state.pending} checking={checking} onCheck={() => void check()} />
    {message && <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>}
    {storageWarning && <p role="alert" className="text-sm text-amber-800">
      Brouillon et clé de vérification conservés dans ce panneau ; restauration après rechargement non garantie.</p>}
  </article>;
}
