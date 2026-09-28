'use client';

import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent,
  TabsList, TabsTrigger} from '@creezio/sdk/ui';
import {RetainedSubViews, useWorkspaceActivity} from '@creezio/sdk/workspace/components';
import {useRegisterWorkspaceMetadata} from '@creezio/sdk/workspace/metadata';
import {useRegisterPageToolbar} from '@creezio/sdk/workspace/toolbar';
import type {WorkspaceViewProps} from '@creezio/sdk/workspace/types';
import {createFileClient} from '@creezio/sdk/files/client';
import type {OperationClientResult} from '@creezio/sdk/operations/client';
import {createCommandJournal, type PendingCommand} from '@creezio/sdk/operations/command-journal';
import {PURCHASE_MODULE_ID, PURCHASE_OPERATIONS, purchaseBindingId,
  type PurchaseAttachment, type PurchaseRequest} from '../../module/public-contract.ts';
import {AttachmentList, formatAmount, RequestEditor, RequestList, statusLabel} from './components.tsx';
import {amountMinor, canInspectPending, canRenderPanel, commandResultForCurrent, draftFromRequest, initialPanelState, isLegacyPending, panelState, pendingStatusTarget,
  purchaseAttachment, purchaseRequest, reconcileRequest, validDraft,
  restoredPanelState, type PendingPurchaseCommand, type PurchasePanelStateV1} from './state.ts';

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
  const access = useSyncExternalStore(props.access.subscribe, props.access.getSnapshot, props.access.getSnapshot);
  const sessionId = access.phase === 'authenticated' && !access.pending
    && access.session?.audience === props.audience ? access.session.id : null;
  const scopeKey = sessionId ? `${sessionId}|${props.audience}|${props.contextId}|${props.panelId}` : null;
  const [items, setItems] = useState<PurchaseRequest[]>([]);
  const itemsScope = useRef<string | null>(null);
  const lastVerifiedScope = useRef<string | null>(null), lastRefresh = useRef(0);
  const listSerial = useRef(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    listSerial.current++;
    if (!scopeKey && access.phase !== 'anonymous') return;
    if (scopeKey === lastVerifiedScope.current && access.phase !== 'anonymous') return;
    lastVerifiedScope.current = scopeKey; itemsScope.current = null;
    setItems([]); setNextCursor(null); setMessage('');
  }, [scopeKey, access.phase]);
  useRegisterPageToolbar(props.panelId, props.location.url, <>
    <Button size="sm" variant="outline" disabled={!props.active || !activity || loading}
      onClick={() => setRefresh(value => value + 1)}>Actualiser</Button>
    <Button size="sm" disabled={!props.active || !activity}
      onClick={() => props.navigation.open(NEW_VIEW)}>Nouvelle demande</Button>
  </>);
  useEffect(() => {
    if (!props.active || !activity || !props.authorized || !scopeKey) return;
    let current = true; const serial = ++listSerial.current;
    const retainPages = itemsScope.current === scopeKey && lastRefresh.current === refresh;
    lastRefresh.current = refresh;
    setLoading(true); setMessage('');
    void props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.list),
      contextId: props.contextId, input: {limit: 30}, isCurrent: () => current}).then(result => {
      if (!current || serial !== listSerial.current) return;
      const page = listOutput(succeeded(result));
      if (page) {itemsScope.current = scopeKey;
        setItems(previous => retainPages
          ? [...page.items, ...previous.filter(item => !page.items.some(fresh => fresh.id === item.id))]
          : page.items);
        setNextCursor(previous => retainPages ? previous ?? page.nextCursor : page.nextCursor);
      }
      else setMessage('Liste indisponible. Actualisez pour réessayer.');
    }).finally(() => {if (current && serial === listSerial.current) setLoading(false);});
    return () => {current = false;};
  }, [props.active, activity, props.authorized, props.audience, props.client, props.contextId, scopeKey, refresh]);
  async function more() {
    if (!nextCursor || loading || !props.active || !activity || !props.authorized || !scopeKey
      || itemsScope.current !== scopeKey) return;
    const pageScope = scopeKey, serial = ++listSerial.current;
    setLoading(true);
    try {
      const result = await props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.list),
        contextId: props.contextId, input: {limit: 30, cursor: nextCursor},
        isCurrent: () => props.active && props.authorized && itemsScope.current === pageScope
          && serial === listSerial.current});
      if (itemsScope.current !== pageScope || serial !== listSerial.current) return;
      const page = listOutput(succeeded(result));
      if (!page) {setMessage('Page suivante indisponible.'); return;}
      setItems(previous => {
        const known = new Set(previous.map(item => item.id));
        return [...previous, ...page.items.filter(item => !known.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } finally {if (serial === listSerial.current) setLoading(false);}
  }
  if (!scopeKey || !props.active || !props.authorized || itemsScope.current !== scopeKey)
    return <section className="p-6" aria-label="Demandes d’achat"><p role="status">Accès en cours de vérification…</p></section>;
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
  const access = useSyncExternalStore(props.access.subscribe, props.access.getSnapshot, props.access.getSnapshot);
  const session = access.phase === 'authenticated' && !access.pending && access.session?.audience === props.audience
    ? access.session : null;
  const scopeKey = session ? `${session.id}|${props.audience}|${props.contextId}|${props.panelId}|${props.location.identity}` : null;
  const [state, setState] = useState<PurchasePanelStateV1>(() =>
    panelState(props.navigation.readPanelState()?.data) ?? initialPanelState());
  const stateRef = useRef(state);
  const [storageWarning, setStorageWarning] = useState(false);
  const journal = useRef<ReturnType<typeof createCommandJournal> | null>(null);
  const journalScope = useRef<string | null>(null);
  const identity = useRef({key: scopeKey, active: props.active, authorized: props.authorized,
    panelId: props.panelId, viewId: props.location.viewId, inputId: props.input.id,
    client: props.client, access: props.access, epoch: 0});
  const previous = identity.current;
  if (previous.key !== scopeKey || previous.active !== props.active || previous.authorized !== props.authorized
    || previous.panelId !== props.panelId || previous.viewId !== props.location.viewId
    || previous.inputId !== props.input.id || previous.client !== props.client || previous.access !== props.access)
    identity.current = {key: scopeKey, active: props.active, authorized: props.authorized,
      panelId: props.panelId, viewId: props.location.viewId, inputId: props.input.id,
      client: props.client, access: props.access, epoch: previous.epoch + 1};
  useEffect(() => {
    if (!scopeKey || !session) {
      if (access.phase === 'anonymous') {journal.current = null; journalScope.current = null;
        const empty = initialPanelState(); stateRef.current = empty; setState(empty);}
      return;
    }
    if (journalScope.current === scopeKey) return;
    const restored = restoredPanelState(props.navigation.readPanelState()?.data);
    stateRef.current = restored; setState(restored);
    journal.current = createCommandJournal({sessionId: session.id, audience: props.audience,
      contextId: props.contextId}, restored.pending && !isLegacyPending(restored.pending) ? restored.pending : null);
    journalScope.current = scopeKey;
  }, [scopeKey, session?.id, access.phase, props.navigation, props.audience, props.contextId]);
  const commit = useCallback((next: PurchasePanelStateV1, activeSubview: 'details' | 'attachments' = 'details') => {
    stateRef.current = next; setState(next);
    setStorageWarning(!props.navigation.savePanelState({activeSubview, data: next}));
  }, [props.navigation]);
  const persistPending = useCallback((pending: PendingCommand | null, activeSubview: 'details' | 'attachments' = 'details') => {
    if (!scopeKey || journalScope.current !== scopeKey || !identity.current.active || !identity.current.authorized)
      return false;
    const next = {...stateRef.current, pending};
    const saved = props.navigation.savePanelState({activeSubview, data: next});
    setStorageWarning(!saved);
    if (saved) {stateRef.current = next; setState(next);}
    return saved;
  }, [scopeKey, props.navigation]);
  const current = useCallback((epoch: number) => identity.current.epoch === epoch
    && identity.current.key === scopeKey && identity.current.active && identity.current.authorized
    && props.access.getSnapshot().phase === 'authenticated'
    && props.access.getSnapshot().session?.id === session?.id,
  [scopeKey, session?.id, props.access]);
  return {state, stateRef, commit, storageWarning, journal, persistPending, current,
    epoch: identity.current.epoch, ready: !!scopeKey && journalScope.current === scopeKey,
    sessionId: session?.id ?? null, scopeKey};
}

function PendingNotice(props: {pending: PendingPurchaseCommand | null; onCheck: () => void;
  checking: boolean}) {
  if (!props.pending) return null;
  return <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    Résultat de « {isLegacyPending(props.pending) ? props.pending.operationId : props.pending.intent ?? props.pending.bindingId} » incertain. Aucune nouvelle commande n’est envoyée avant vérification.
    <Button size="sm" variant="outline" className="ml-2" disabled={props.checking} onClick={props.onCheck}>
      {props.checking ? 'Vérification…' : 'Vérifier l’exécution'}</Button>
  </div>;
}

export function purchaseRequestNew(props: WorkspaceViewProps) {
  useRegisterWorkspaceMetadata(props.panelId, {title: 'Nouvelle demande', kind: 'entity', trail: [
    {label: 'Demandes d’achat', href: '/requests'}, {label: 'Nouvelle demande'}]});
  const activity = useWorkspaceActivity();
  const {state, stateRef, commit, storageWarning, journal, persistPending, current, epoch,
    ready, sessionId} = usePanelDraft(props);
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false), busySerial = useRef(0);
  useEffect(() => {busySerial.current++; inFlight.current = false;
    setBusy(false); setChecking(false);}, [epoch]);
  const available = props.active && activity && props.authorized && ready;
  useRegisterPageToolbar(props.panelId, props.location.url,
    <Button size="sm" variant="ghost" onClick={() => props.navigation.open(LIST_VIEW)}>Demandes</Button>);
  function accept(result: OperationClientResult, key: string, stillPending: boolean) {
    if (stateRef.current.pending && stateRef.current.pending.requestKey !== key) return;
    const created = requestOutput(succeeded(result));
    if (created) {
      commit({...stateRef.current, dirty: false});
      if (!stillPending) props.navigation.open(DETAIL_VIEW, {id: created.id});
      else setMessage('Création confirmée. Restauration du suivi indisponible ; vérifiez de nouveau avant toute action.');
      return;
    }
    if (result.kind === 'execution' && result.execution.state === 'succeeded') {
      setMessage('Création confirmée. Actualisez la liste pour retrouver la demande.');
      return;
    }
    if (result.kind === 'rejected' || result.kind === 'execution' && result.execution.state === 'failed') {
      setMessage(stillPending ? 'Statut inaccessible ou suivi non enregistré. La clé reste conservée.' : issue(result));
      return;
    }
    setMessage('Création incertaine. Vérifiez l’exécution avant de réessayer.');
  }
  async function create() {
    const current = stateRef.current;
    if (!available || !sessionId || busy || checking || inFlight.current || current.pending || !journal.current
      || !validDraft(current.draft)) return;
    const amount = amountMinor(current.draft.amountText, current.draft.currency);
    if (amount === null) return;
    const requestKey = crypto.randomUUID();
    const issued: PendingCommand = {sessionId, audience: props.audience, contextId: props.contextId,
      bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.create),
      intent: PURCHASE_OPERATIONS.create, requestKey};
    const controller = journal.current, token = epoch;
    const serial = ++busySerial.current;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const outcome = await controller.execute(props.client, issued,
        {title: current.draft.title.trim(), description: current.draft.description,
          amountMinor: amount, currency: current.draft.currency},
        () => currentScope(token), next => persistPending(next));
      if (currentScope(token)) accept(outcome.result, requestKey, !!outcome.pending);
    } finally {if (serial === busySerial.current) {inFlight.current = false; setBusy(false);}}
  }
  const currentScope = current;
  async function check() {
    const pending = stateRef.current.pending;
    if (!canInspectPending(pending, available, checking, busy, inFlight.current)) return;
    const serial = ++busySerial.current;
    setChecking(true);
    try {
      if (isLegacyPending(pending)) {
        const token = epoch;
        const result = await props.client.status({bindingId: purchaseBindingId(props.audience, pending.operationId),
          contextId: props.contextId, ...pendingStatusTarget(pending), isCurrent: () => current(token)});
        if (!current(token)) return;
        const terminal = result.kind === 'execution' && ['succeeded', 'failed'].includes(result.execution.state);
        const cleared = terminal && persistPending(null);
        accept(result, pending.requestKey, !cleared);
      } else {
        const token = epoch;
        const outcome = await journal.current?.inspect(props.client, () => current(token), next => persistPending(next));
        if (outcome && current(token)) accept(outcome.result, pending.requestKey, !!outcome.pending);
      }
    } finally {if (serial === busySerial.current) setChecking(false);}
  }
  if (!canRenderPanel(ready, props.active, props.authorized, activity))
    return <section className="p-6" aria-label="Nouvelle demande d’achat"><p role="status">Accès en cours de vérification…</p></section>;
  return <section className="space-y-4 p-6" aria-label="Nouvelle demande d’achat">
    <h1 className="text-lg font-semibold">Nouvelle demande d’achat</h1>
    <Card><CardHeader><CardTitle className="text-base">Préparer une demande</CardTitle>
      <CardDescription>Elle reste brouillon tant que vous ne la soumettez pas explicitement.</CardDescription></CardHeader>
      <CardContent><RequestEditor draft={state.draft} disabled={!available || busy || checking || !!state.pending}
        onChange={draft => commit({...stateRef.current, draft, dirty: true})}
        onSubmit={() => void create()} submitLabel={busy ? 'Création…' : 'Créer le brouillon'} /></CardContent></Card>
    <PendingNotice pending={state.pending} checking={checking || busy} onCheck={() => void check()} />
    {message && <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>}
    {storageWarning && <p role="alert" className="text-sm text-amber-800">
      Brouillon conservé dans ce panneau ; sa restauration après rechargement n’est pas garantie.</p>}
  </section>;
}

export function purchaseRequestDetail(props: WorkspaceViewProps) {
  const id = props.input.id ?? '';
  const activity = useWorkspaceActivity();
  const {state, stateRef, commit, storageWarning, journal, persistPending, current, epoch,
    ready, sessionId, scopeKey} = usePanelDraft(props);
  const [requestStored, setRequest] = useState<PurchaseRequest | null>(null);
  const requestScope = useRef<string | null>(null);
  const request = requestScope.current === scopeKey ? requestStored : null;
  const [attachments, setAttachments] = useState<PurchaseAttachment[]>([]);
  const [attachmentCursor, setAttachmentCursor] = useState<string | null>(null);
  const [section, setSection] = useState<'details' | 'attachments'>(() =>
    props.navigation.readPanelState()?.activeSubview === 'attachments' ? 'attachments' : 'details');
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false), [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false), busySerial = useRef(0), latestRevision = useRef<number | null>(null);
  useEffect(() => {busySerial.current++; inFlight.current = false;
    setBusy(false); setChecking(false);}, [epoch]);
  useEffect(() => {
    requestScope.current = null; latestRevision.current = null;
    setRequest(null); setAttachments([]); setAttachmentCursor(null); setMessage('');
  }, [scopeKey]);
  const available = props.active && activity && props.authorized && ready;
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
    requestScope.current = scopeKey;
    setRequest(next);
    const outcome = reconcileRequest(stateRef.current, next);
    if (outcome.state !== stateRef.current) persist(outcome.state);
    if (outcome.conflict) setMessage('La fiche a changé. Votre brouillon est conservé ; choisissez comment reprendre.');
    return true;
  }
  const readAttachments = useCallback(async (cursor?: string) => {
    if (!available || !id) return;
    const token = epoch;
    const result = await props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.attachmentList),
      contextId: props.contextId, input: {id, limit: 30, ...(cursor ? {cursor} : {})},
      isCurrent: () => current(token)});
    if (!current(token)) return;
    const page = attachmentsOutput(succeeded(result));
    if (!page || page.items.some(item => item.requestId !== id)) {
      setMessage('Pièces jointes indisponibles.'); return;
    }
    setAttachments(previous => cursor ? [...previous, ...page.items.filter(item => !previous.some(old => old.fileId === item.fileId))] : page.items);
    setAttachmentCursor(page.nextCursor);
  }, [available, id, props.audience, props.client, props.contextId, current, epoch]);
  useEffect(() => {
    if (!available || !id) return;
    let mounted = true; const token = epoch;
    setLoading(true);
    void props.client.invoke({bindingId: purchaseBindingId(props.audience, PURCHASE_OPERATIONS.get),
      contextId: props.contextId, input: {id}, isCurrent: () => mounted && current(token)}).then(result => {
      if (!mounted || !current(token)) return;
      const next = requestOutput(succeeded(result));
      if (next) acceptRequest(next);
      else setMessage('Fiche indisponible ou accès refusé.');
    }).finally(() => {if (mounted && current(token)) setLoading(false);});
    void readAttachments();
    return () => {mounted = false;};
  }, [available, id, props.audience, props.client, props.contextId, current, epoch, readAttachments, refresh]);
  function commandSuccess(operationId: OperationId, output: unknown) {
    if (operationId === PURCHASE_OPERATIONS.attachmentLink) {
      const link = output && typeof output === 'object' ? output as {requestRevision?: unknown; attachment?: unknown} : null;
      const attached = purchaseAttachment(link?.attachment);
      const revision = link?.requestRevision;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision)
        || !attached || attached.requestId !== id) return false;
      if (!request) {
        setRefresh(value => value + 1);
        setMessage('Liaison confirmée. Relisez la fiche pour retrouver la pièce jointe.');
        return true;
      }
      if (revision < request.revision
        || latestRevision.current !== null && revision < latestRevision.current) {
        setMessage('Liaison confirmée. La fiche affichée est plus récente ; actualisez pour vérifier les pièces jointes.');
        return true;
      }
      latestRevision.current = revision;
      setRequest({...request, revision});
      persist({...stateRef.current, baseRevision: revision});
      setRefresh(value => value + 1);
      setMessage('Pièce jointe liée à la demande.');
      return true;
    }
    const next = requestOutput(output);
    if (!next || next.id !== id) return false;
    if (!commandResultForCurrent(request, latestRevision.current, next)) {
      setMessage('Modification confirmée. Une version plus récente est affichée ; votre brouillon est conservé.');
      return true;
    }
    latestRevision.current = next.revision;
    setRequest(next);
    persist({...stateRef.current, draft: draftFromRequest(next), baseRevision: next.revision,
      dirty: false});
    setMessage(operationId === PURCHASE_OPERATIONS.submit ? 'Demande soumise. Aucun achat n’a été effectué.'
      : operationId === PURCHASE_OPERATIONS.withdraw ? 'Demande retirée.' : 'Demande enregistrée.');
    return true;
  }
  function acceptCommand(result: OperationClientResult, operationId: OperationId, requestKey: string,
    stillPending: boolean) {
    if (stateRef.current.pending && stateRef.current.pending.requestKey !== requestKey) return;
    if (result.kind === 'execution' && result.execution.state === 'succeeded'
      && commandSuccess(operationId, result.execution.output)) return;
    if (result.kind === 'execution' && result.execution.state === 'succeeded') {
      setRefresh(value => value + 1);
      setMessage('Modification confirmée. Relisez la fiche pour vérifier le résultat.');
      return;
    }
    if (result.kind === 'rejected' || result.kind === 'execution' && result.execution.state === 'failed') {
      setMessage(stillPending ? 'Statut inaccessible ou suivi non enregistré. La clé reste conservée.' : issue(result));
      return;
    }
    setMessage('Résultat incertain. Vérifiez l’exécution avant une nouvelle tentative.');
  }
  async function runCommand(operationId: OperationId, fields: Record<string, unknown>) {
    if (!available || !sessionId || !request || checking || inFlight.current || stateRef.current.pending
      || !journal.current) return;
    const issued: PendingCommand = {sessionId, audience: props.audience, contextId: props.contextId,
      bindingId: purchaseBindingId(props.audience, operationId), requestKey: crypto.randomUUID(),
      intent: operationId, targetId: id};
    const controller = journal.current, token = epoch;
    const serial = ++busySerial.current;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const outcome = await controller.execute(props.client, issued, fields,
        () => current(token), next => persistPending(next, section));
      if (current(token)) acceptCommand(outcome.result, operationId, issued.requestKey, !!outcome.pending);
    } finally {if (serial === busySerial.current) {inFlight.current = false; setBusy(false);}}
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
    if (!canInspectPending(pending, available, checking, busy, inFlight.current)) return;
    const serial = ++busySerial.current;
    setChecking(true);
    try {
      const token = epoch;
      if (isLegacyPending(pending)) {
        const result = await props.client.status({bindingId: purchaseBindingId(props.audience, pending.operationId),
          contextId: props.contextId, ...pendingStatusTarget(pending), isCurrent: () => current(token)});
        if (!current(token)) return;
        const terminal = result.kind === 'execution' && ['succeeded', 'failed'].includes(result.execution.state);
        const cleared = terminal && persistPending(null, section);
        acceptCommand(result, pending.operationId, pending.requestKey, !cleared);
      } else {
        const outcome = await journal.current?.inspect(props.client, () => current(token),
          next => persistPending(next, section));
        if (outcome && current(token)) {
          const operationId = Object.values(PURCHASE_OPERATIONS).find(op =>
            pending.bindingId === purchaseBindingId(props.audience, op));
          if (operationId) acceptCommand(outcome.result, operationId, pending.requestKey, !!outcome.pending);
        }
      }
    } finally {if (serial === busySerial.current) setChecking(false);}
  }
  async function upload(file: File) {
    if (!available || !request || busy || checking || stateRef.current.pending || request.status !== 'draft') return;
    const token = epoch, serial = ++busySerial.current;
    setBusy(true); setMessage('Téléversement en cours…');
    try {
      const staged = await fileClient.upload({file, filename: file.name, intentId: crypto.randomUUID(),
        isCurrent: () => current(token)});
      if (!current(token)) return;
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
    } finally {if (serial === busySerial.current) setBusy(false);}
  }
  async function download(attachment: PurchaseAttachment) {
    if (!available) return;
    const token = epoch;
    const result = await fileClient.download(attachment.reference,
      () => current(token));
    if (!current(token)) return;
    if (result.kind !== 'ready') {setMessage('Téléchargement indisponible.'); return;}
    const url = URL.createObjectURL(result.value);
    try {
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = attachment.filename; anchor.rel = 'noopener';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } finally {URL.revokeObjectURL(url);}
  }
  const conflict = !!request && state.baseRevision !== null && state.baseRevision !== request.revision;
  const editable = available && !!request && request.status === 'draft' && !busy && !checking && !state.pending && !conflict;
  if (!canRenderPanel(ready, props.active, props.authorized, activity))
    return <article className="p-6" aria-label="Demande d’achat"><p role="status">Accès en cours de vérification…</p></article>;
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
    <PendingNotice pending={state.pending} checking={checking || busy} onCheck={() => void check()} />
    {message && <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>}
    {storageWarning && <p role="alert" className="text-sm text-amber-800">
      Brouillon et clé de vérification conservés dans ce panneau ; restauration après rechargement non garantie.</p>}
  </article>;
}
