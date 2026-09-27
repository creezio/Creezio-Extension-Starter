import {App, PostMessageTransport} from '@modelcontextprotocol/ext-apps';
import {widgetModelContextPayload} from '@creezio/sdk/widgets/model-context';
import type {PurchaseRequest} from '../../module/public-contract.ts';
import {amountLabel, contextInput, mergeRequestPage, nextCardRequest, proposedMessage,
  requestFromTool, requestsFromTool, type RequestContextInput} from './data.ts';

type Kind = 'card' | 'picker';
const tool = {card: 'purchase_request_get', picker: 'purchase_request_list'} as const;
const statusName = {draft: 'Brouillon', submitted: 'Soumise', withdrawn: 'Retirée'} as const;

/** Each MCP Apps iframe owns its selection; rendering never calls a business tool. */
export async function mountPurchaseWidget(kind: Kind): Promise<void> {
  const app = new App({name: `Creezio purchase request ${kind}`, version: '0.1.0'}, {});
  const root = document.getElementById('purchase-widget');
  const status = document.getElementById('status');
  const preview = document.getElementById('preview');
  const message = document.getElementById('message') as HTMLButtonElement | null;
  const context = document.getElementById('context') as HTMLButtonElement | null;
  const removeContext = document.getElementById('remove-context') as HTMLButtonElement | null;
  const direct = document.getElementById('direct') as HTMLButtonElement | null;
  const picker = document.getElementById('request-select') as HTMLSelectElement | null;
  if (!root || !status || !preview || !message || !context || !removeContext || !direct
    || kind === 'picker' && !picker) return;
  let requests: PurchaseRequest[] = [];
  let current: PurchaseRequest | null = null;
  let proposed = false;
  let sending = false;
  const sentOrUnknown = new Set<string>();
  let toolsAvailable = false;
  let reading = false;
  let retainedContext: RequestContextInput | null = null;
  const say = (value: string) => {status.textContent = value;};
  const selected = () => current;
  const refreshButtons = () => {
    const hasSelection = !!selected();
    message.disabled = !hasSelection || sending || !!current && sentOrUnknown.has(current.id);
    context.disabled = !hasSelection;
    removeContext.disabled = !hasSelection && !retainedContext;
    direct.disabled = !toolsAvailable || reading || kind === 'card' && !hasSelection;
  };
  const resetProposal = () => {
    proposed = false; preview.textContent = '';
    message.textContent = 'Préparer un message'; refreshButtons();
  };
  const render = () => {
    if (kind === 'card') {
      const title = document.getElementById('title'), state = document.getElementById('state');
      const amount = document.getElementById('amount'), revision = document.getElementById('revision');
      if (title) title.textContent = current?.title ?? 'Fiche indisponible';
      if (state) state.textContent = current ? statusName[current.status] : '—';
      if (amount) amount.textContent = current ? amountLabel(current) : '—';
      if (revision) revision.textContent = current ? String(current.revision) : '—';
    } else if (picker) {
      const wanted = current?.id ?? '';
      picker.replaceChildren();
      const blank = document.createElement('option'); blank.value = '';
      blank.textContent = requests.length ? 'Choisir une demande' : 'Aucune demande chargée';
      picker.appendChild(blank);
      for (const request of requests) {
        const option = document.createElement('option'); option.value = request.id;
        option.textContent = `${request.title} · ${statusName[request.status]}`;
        picker.appendChild(option);
      }
      picker.value = requests.some(item => item.id === wanted) ? wanted : '';
      const summary = document.getElementById('selection');
      if (summary) summary.textContent = current
        ? `${current.title} · ${statusName[current.status]} · ${amountLabel(current)}`
        : 'Sélectionnez une demande pour consulter son état.';
    }
    refreshButtons();
  };
  const showRequest = (request: PurchaseRequest) => {
    if (kind === 'card' && !nextCardRequest(current, request)) return;
    current = request;
    if (kind === 'picker') requests = [request, ...requests.filter(item => item.id !== request.id)].slice(0, 50);
    resetProposal(); render();
  };
  const showList = (items: PurchaseRequest[]) => {
    requests = mergeRequestPage(requests, items);
    current = requests.find(item => item.id === current?.id) ?? null;
    resetProposal(); render();
  };
  app.addEventListener('toolresult', result => {
    if (kind === 'picker') {
      const items = requestsFromTool(result.structuredContent);
      if (items) showList(items);
      return;
    }
    const request = requestFromTool(result.structuredContent);
    if (request) showRequest(request);
  });
  refreshButtons();
  try {await app.connect(new PostMessageTransport(window.parent, window.parent));}
  catch {say('Pont MCP Apps indisponible. Les actions restent indisponibles.'); return;}
  const capabilities = app.getHostCapabilities();
  const hostName = app.getHostVersion()?.name;
  toolsAvailable = !!capabilities?.serverTools;
  refreshButtons();
  if (!capabilities?.serverTools || !capabilities?.message || !capabilities?.updateModelContext)
    say('Certaines actions ne sont pas disponibles dans cet hôte.');
  else say('Widget prêt. Aucune action métier n’est déclenchée à l’affichage.');
  if (picker) picker.addEventListener('change', () => {
    current = requests.find(item => item.id === picker.value) ?? null;
    resetProposal(); render();
  });
  direct.addEventListener('click', async () => {
    if (!capabilities?.serverTools || reading || kind === 'card' && !current) return;
    reading = true; refreshButtons();
    try {
      const args = kind === 'card' ? {id: current!.id} : {limit: 30};
      const result = await app.callServerTool({name: tool[kind], arguments: args});
      if (result.isError) {say('Lecture refusée ou indisponible.'); return;}
      if (kind === 'card') {
        const next = requestFromTool(result.structuredContent);
        if (!next || next.id !== current?.id) {say('Résultat de lecture invalide.'); return;}
        showRequest(next);
      } else {
        const items = requestsFromTool(result.structuredContent);
        if (!items) {say('Liste indisponible.'); return;}
        showList(items);
      }
      say('Lecture directe terminée sans tour IA.');
    } catch {say('Résultat de lecture inconnu. Réessayez la lecture si nécessaire.');}
    finally {reading = false; refreshButtons();}
  });
  message.addEventListener('click', async () => {
    if (!current || sending || sentOrUnknown.has(current.id)) return;
    const requestId = current.id;
    const text = proposedMessage(current);
    if (!proposed) {
      preview.textContent = text;
      message.textContent = capabilities?.message ? 'Envoyer ce message' : 'Message prêt à copier';
      proposed = true;
      say(capabilities?.message ? 'Message proposé ; envoi volontaire requis.'
        : 'Envoi indisponible ; texte affiché à copier manuellement.');
      return;
    }
    if (!capabilities?.message) {say('Envoi indisponible ; copiez le texte affiché.'); return;}
    sending = true; refreshButtons();
    try {
      const result = await app.sendMessage({role: 'user', content: [{type: 'text', text}]});
      if (result.isError) say('Envoi refusé. Le message reste affiché.');
      else {sentOrUnknown.add(requestId);
        say('Message transmis à l’hôte ; aucune réponse IA ni opération métier n’est garantie.');}
    } catch {
      sentOrUnknown.add(requestId);
      say('Transmission incertaine. Vérifiez le chat avant tout nouvel envoi ; aucun renvoi automatique.');
    } finally {sending = false; refreshButtons();}
  });
  context.addEventListener('click', async () => {
    if (!current) return;
    if (!capabilities?.updateModelContext) {
      say('Sélection conservée seulement dans ce widget ; contexte non transmis.'); return;
    }
    try {
      const input = contextInput(current);
      await app.updateModelContext(widgetModelContextPayload(hostName,
        kind === 'card' ? 'card.context' : 'picker.context', input));
      retainedContext = input; refreshButtons();
      say('Contexte préparé pour le prochain tour ; aucune opération métier lancée.');
    } catch {say('État du contexte incertain ; aucune opération métier lancée.');}
  });
  removeContext.addEventListener('click', async () => {
    if (!current && !retainedContext) return;
    if (!capabilities?.updateModelContext) {
      retainedContext = null; refreshButtons();
      say('Sélection locale retirée ; aucun contexte n’avait été transmis.'); return;
    }
    try {
      await app.updateModelContext(widgetModelContextPayload(hostName,
        kind === 'card' ? 'card.context' : 'picker.context', retainedContext ?? contextInput(current!), true));
      retainedContext = null; refreshButtons();
      say('Contexte retiré pour les prochains tours.');
    } catch {say('Retrait du contexte incertain.');}
  });
}
