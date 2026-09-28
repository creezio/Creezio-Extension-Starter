import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PURCHASE_MODELS} from './models.ts';
import {PURCHASE_OPERATIONS} from './public-contract.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const sourceRevision=process.env.CREEZIO_SOURCE_REVISION;
const sourceIntegrity=process.env.CREEZIO_SOURCE_INTEGRITY;
if(!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(sourceRevision??'')
  || !/^sha256-[a-f0-9]{64}$/.test(sourceIntegrity??''))
  throw new Error('A real pinned Git source revision and source digest are required.');

const moduleId='creezio.purchase-requests',version='0.1.0';
const reviewSkill='plugin/skills/review-purchase-request/SKILL.md';
const reviewSkillIntegrity=`sha256-${createHash('sha256').update(
  readFileSync(path.join(root,reviewSkill))).digest('hex')}`;
const ref=(kind,id)=>({moduleId,kind,id});
const use=[ref('permission','use')];
const schema=schemaId=>({schemaId});
const string=(maxLength,minLength=1)=>({type:'string',minLength,maxLength});
const integer=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const optional=entry=>({anyOf:[entry,{type:'null'}]});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const array=(items,maxItems=50)=>({type:'array',items,maxItems});
const id=string(128),requestKey=string(128),cursor=string(2048),timestamp=string(35);
const request=object({id,title:string(240),description:string(4000,0),
  amountMinor:integer(0,1_000_000_000_000),currency:{type:'string',pattern:'^[A-Z]{3}$'},
  status:{type:'string',enum:['draft','submitted','withdrawn']},revision:integer(1),
  createdAt:timestamp,updatedAt:timestamp,submittedAt:optional(timestamp)});
const staged=object({fileId:string(67),intentId:id,generation:id,digest:string(64,64)});
const attachment=object({requestId:id,fileId:string(67),filename:string(255),contentType:string(128),
  byteSize:integer(),digest:string(64,64),createdAt:timestamp,reference:staged});
const listInput=object({limit:integer(1,50),cursor},['limit']);
const getInput=object({id});
const createInput=object({requestKey,title:string(240),description:string(4000,0),
  amountMinor:integer(0,1_000_000_000_000),currency:{type:'string',pattern:'^[A-Z]{3}$'}});
const updateInput=object({...createInput.properties,id,revision:integer(1)});
const transitionInput=object({requestKey,id,revision:integer(1)});
const attachmentLinkInput=object({...transitionInput.properties,staged});
const attachmentListInput=object({id,limit:integer(1,50),cursor},['id','limit']);
const requestOutput=object({request});
const requestGetOutput=object({request:optional(request)});
const requestListOutput=object({items:array(request),nextCursor:optional(cursor)});
const attachmentLinkOutput=object({attachment,requestRevision:integer(1)});
const attachmentListOutput=object({items:array(attachment),nextCursor:optional(cursor)});
const panelState=object({version:{const:1},draft:object({title:string(240,0),description:string(4000,0),
  amountText:string(32,0),currency:{type:'string',pattern:'^[A-Z]{3}$'}}),
  baseRevision:optional(integer(1)),dirty:{type:'boolean'},
  pending:optional(object({operationId:{type:'string',enum:Object.values(PURCHASE_OPERATIONS)},
    requestKey:string(128),executionId:string(128)},
    ['operationId','requestKey']))});
const schemas=Object.entries({
  request,attachment,'staged-file':staged,
  'request-create-input':createInput,'request-list-input':listInput,'request-get-input':getInput,
  'request-update-input':updateInput,'request-transition-input':transitionInput,
  'attachment-link-input':attachmentLinkInput,'attachment-list-input':attachmentListInput,
  'request-output':requestOutput,'request-get-output':requestGetOutput,'request-list-output':requestListOutput,
  'attachment-link-output':attachmentLinkOutput,'attachment-list-output':attachmentListOutput,
  'widget-context-input':object({id,title:string(240),revision:integer(1)}),
  'panel-state':panelState,'view-list-input':object({}),'view-new-input':object({}),
  'view-detail-input':getInput,'widget-state':object({}),
}).map(([id,schema])=>({id,schema}));

const model=name=>ref('model',name);
const operation=(id,title,kind,input,output,handler,{reads=[],writes=[],fileWrites=[],pagination=false,versioned=false}={})=>({
  id,title,kind,input:schema(input),output:schema(output),permissions:use,audiences:['admin','app'],
  actors:['user','delegated-user'],context:'required',handler:{path:'dist/module/operations.js',export:handler},
  effects:{reads:reads.map(model),writes:[...writes.map(model),...fileWrites.map(id=>ref('file',id))],
    emits:[],calls:[],providers:[]},
  errors:[{code:'invalid_input',retryable:false,outcome:'rejected'},
    {code:'unauthorized',retryable:false,outcome:'rejected'},
    {code:'forbidden',retryable:false,outcome:'rejected'},
    {code:'not_found',retryable:false,outcome:'rejected'},
    {code:'conflict',retryable:false,outcome:'rejected'},
    {code:'unsupported',retryable:false,outcome:'rejected'},
    {code:'rate_limited',retryable:true,outcome:'rejected'},
    {code:'unavailable',retryable:true,outcome:'rejected'},
    {code:'unknown',retryable:true,outcome:'unknown'}],
  pagination:pagination?{mode:'cursor',cursorField:'cursor',limitField:'limit',maxItems:50}:{mode:'none'},
  idempotency:kind==='command'?{mode:'required',keyField:'requestKey',scope:'actor-context-operation',
    retentionSeconds:86400}:{mode:'none'},
  approval:{mode:'none'},concurrency:versioned?{mode:'object-version',versionField:'revision'}:{mode:'none'},
  execution:{maxDurationMs:5000,maxItems:50,resumable:false},audit:{required:true,redactFields:['description']},
  public:false,
});
const operations=[
  operation('request.create','Créer un brouillon','command','request-create-input','request-output','requestCreate',
    {writes:['request']}),
  operation('request.list','Lister ses demandes','query','request-list-input','request-list-output','requestList',
    {reads:['request'],pagination:true}),
  operation('request.get','Lire sa demande','query','request-get-input','request-get-output','requestGet',
    {reads:['request']}),
  operation('request.update','Modifier un brouillon','command','request-update-input','request-output','requestUpdate',
    {reads:['request'],writes:['request'],versioned:true}),
  operation('request.submit','Soumettre une demande','command','request-transition-input','request-output','requestSubmit',
    {reads:['request'],writes:['request'],versioned:true}),
  operation('request.withdraw','Retirer une demande','command','request-transition-input','request-output','requestWithdraw',
    {reads:['request'],writes:['request'],versioned:true}),
  operation('attachment.link','Joindre un fichier staged','command','attachment-link-input','attachment-link-output','attachmentLink',
    {reads:['request','file_metadata'],writes:['request','file_metadata','request_attachment'],
      fileWrites:['request-attachment'],versioned:true}),
  operation('attachment.list','Lister les pièces jointes','query','attachment-list-input','attachment-list-output','attachmentList',
    {reads:['request','request_attachment'],pagination:true}),
];

const api=[];
for(const audience of ['admin','app']) {
  const base=`/api/purchase-requests/${audience}/requests`;
  for(const [id,method,path,input,output,parameters] of [
    ['request.create','POST',base,'request-create-input','request-output',[]],
    ['request.list','GET',base,'request-list-input','request-list-output',[]],
    ['request.get','GET',`${base}/{id}`,'request-get-input','request-get-output',['id']],
    ['request.update','PATCH',`${base}/{id}`,'request-update-input','request-output',['id']],
    ['request.submit','POST',`${base}/{id}/submit`,'request-transition-input','request-output',['id']],
    ['request.withdraw','POST',`${base}/{id}/withdraw`,'request-transition-input','request-output',['id']],
    ['attachment.link','POST',`${base}/{id}/attachments`,'attachment-link-input','attachment-link-output',['id']],
    ['attachment.list','GET',`${base}/{id}/attachments`,'attachment-list-input','attachment-list-output',['id']],
  ]) api.push({id:`${audience}.${id}`,method,path,operation:ref('operation',id),audience,
    auth:['session'],parameters:[...parameters.map(name=>({name,in:'path',inputField:name,required:true})),
      ...(['request.list','attachment.list'].includes(id)?[
        {name:'limit',in:'query',inputField:'limit',required:true},
        {name:'cursor',in:'query',inputField:'cursor',required:false}]:[])],
    input:schema(input),output:schema(output),rateLimit:{requests:60,windowSeconds:60}});
}

const widgetResource=(id,asset)=>({id:`${id}-ui`,uri:`ui://${moduleId}/${id}`,
  mimeType:'text/html;profile=mcp-app',audiences:['admin','app'],permissions:use,
  source:{kind:'asset',path:`ui/widgets/${asset}.html`},widget:ref('widget',id),
  ui:{csp:{connectDomains:[],resourceDomains:[],frameDomains:[],baseUriDomains:[]},
    permissions:{},prefersBorder:true}});
const mcpTool=(id,name,op,input,output,widget)=>({id,name,operation:ref('operation',op),
  audiences:['admin','app'],auth:['oauth'],input:schema(input),output:schema(output),
  annotations:{readOnly:operations.find(item=>item.id===op)?.kind==='query',
    destructive:operations.find(item=>item.id===op)?.kind==='command',
    idempotent:true,openWorld:false},
  ...(widget?{widget:ref('widget',widget)}:{}),textFallback:true});
const widgetAction=(prefix,mode,input,target,fallback,label)=>({id:`${prefix}.${mode}`,label,
  input:schema(input),requiredCapabilities:[],fallback,mode,target});
const widget=(id,asset,renderer,output,readOp,readInput,prefix)=>({
  id,version:'1.0.0',compatibility:'^1.0.0',resource:`${id}-ui`,
  renderer:{path:`dist/ui/widgets/${asset}.js`,export:renderer},input:schema(output),
  state:schema('widget-state'),result:schema(output),audiences:['admin','app'],permissions:use,
  requiredCapabilities:[],assets:[],actions:[
    widgetAction(prefix,'message','request',{template:'ui/widgets/request-message.txt',preview:true,
      voluntarySend:true,states:['proposed','transmitted','refused','unknown']},
      'copy-message','Partager la demande'),
    widgetAction(prefix,'context','widget-context-input',{namespace:'module-instance',fields:['id','title','revision'],
      scope:['actor','conversation','surface'],expiresAfterSeconds:3600,replace:true,removable:true,
      revisionField:'revision'},'local-untransmitted-context','Ajouter au contexte'),
    widgetAction(prefix,'direct',readInput,{kind:'operation',operation:ref('operation',readOp)},
      'unavailable','Actualiser'),
  ],
  instance:{identity:'host-generated',revision:'monotonic',correlation:'request-instance-conversation',
    objectVersion:'distinct',lateResponse:'reject-stale'},
  transport:{protocol:'mcp-apps',maxPayloadBytes:65536,timeoutMs:15000,
    uncertainResult:'reconcile-before-retry',fallbackDispatch:'before-first-dispatch-only'},
});
const view=(id,title,route,component,operations,input,panelState=false)=>({id,title,
  surfaces:['workspace','front'],route,component:{path:'dist/ui/workspace/views.js',export:component},
  permissions:use,operations:operations.map(id=>ref('operation',id)),input:schema(input),
  panel:{...(panelState?{stateSchema:schema('panel-state')}:{ }),identityFields:id==='detail'?['id']:[],
    navigation:'sdk',retention:'preserve',inactiveEffects:'suspend'}});
const views=[
  view('list','Mes demandes','/requests','purchaseRequestsList',['request.list'],'view-list-input'),
  view('new','Nouvelle demande','/requests/new','purchaseRequestNew',['request.create'],
    'view-new-input',true),
  view('detail','Demande','/requests/{id}','purchaseRequestDetail',
    ['request.get','request.update','request.submit','request.withdraw','attachment.link','attachment.list'],
    'view-detail-input',true),
];
const permission={id:'use',title:'Utiliser ses demandes d’achat',audiences:['admin','app'],
  actors:['user','delegated-user'],scopes:['purchase-requests.use'],context:'required',default:'deny',
  resources:[...PURCHASE_MODELS.map(m=>model(m.id)),ref('file','request-attachment')],
  actions:['read','create','update','delete','execute'],enforcement:{request:true,commit:true},public:false};
const files=[{id:'request-attachment',metadataModel:model('file_metadata'),contextField:'context_id',
  ownerField:'file_owner',ownerScope:'principal',storageFields:{id:'file_id',objectKey:'object_key',digest:'digest',
    byteSize:'byte_size',contentType:'content_type',filename:'filename',version:'version',
    state:'state',intentId:'intent_id',generation:'generation'},
  mimeTypes:['text/plain','application/pdf','image/png','image/jpeg'],maxBytes:10485760,
  public:false,permissions:use,attachment:{models:[model('request')],multiple:true},deletion:'restrict'}];
const suiteNames=['backend','ui','api-mcp','widgets','package','docs'];
const suites=Object.fromEntries(suiteNames.map(name=>[name,{mode:'required',script:`ci/${name}.mjs`,
  tests:[`tests/${name}/contract.test.mjs`,...(name==='package'?
    ['tests/package/source-archive.test.mjs','tests/package/sdk-version.test.mjs']:[])]}]));
const compiledJs=['dist/module/entry.server.js','dist/module/operations.js','dist/module/models.js',
  'dist/module/public-contract.js','dist/ui/contributions.js','dist/ui/workspace/views.js',
  'dist/ui/workspace/state.js','dist/ui/workspace/components.js','dist/ui/widgets/request-card.js',
  'dist/ui/widgets/request-picker.js','dist/ui/widgets/runtime.js','dist/ui/widgets/data.js',
  'dist/plugin/contributions.js'];
const developmentSkills=['create-module','data-and-permissions','ui-and-widgets',
  'test-and-package','publish-and-update'].map(name=>`skills/development/${name}/SKILL.md`);
const manifest={
  schemaVersion:'1.0.0',
  identity:{id:moduleId,title:'Demandes d’achat',publisher:'creezio',
    origin:'https://github.com/creezio/Creezio-Extension-Starter',version,
    source:{kind:'git',repository:'https://github.com/creezio/Creezio-Extension-Starter',
      revision:sourceRevision,integrity:sourceIntegrity},license:{expression:'MIT',file:'LICENSE'}},
  compatibility:{core:'^0.0.0',sdk:'^1.0.0',
    requiredCapabilities:['runtime.worker','data.d1.shared','files.r2.shared'],optionalCapabilities:[]},
  dependencies:[],
  entrypoints:{server:{path:'dist/module/entry.server.js',export:'purchaseRequests'},
    ui:{path:'dist/ui/contributions.js',export:'contributions'},
    plugin:{manifest:'plugin/plugin.json',mcp:'plugin/mcp.json',
      contributions:{path:'dist/plugin/contributions.js',export:'contributions'}}},
  contracts:{api,events:[],files,mcp:{tools:[
    mcpTool('request.get','purchase_request_get','request.get','request-get-input','request-get-output','request-card'),
    mcpTool('request.list','purchase_request_list','request.list','request-list-input','request-list-output','request-picker'),
    mcpTool('request.create','purchase_request_create','request.create','request-create-input','request-output'),
    mcpTool('request.update','purchase_request_update','request.update','request-update-input','request-output'),
    mcpTool('request.submit','purchase_request_submit','request.submit','request-transition-input','request-output'),
    mcpTool('request.withdraw','purchase_request_withdraw','request.withdraw','request-transition-input','request-output'),
    mcpTool('attachment.link','purchase_attachment_link','attachment.link','attachment-link-input','attachment-link-output'),
    mcpTool('attachment.list','purchase_attachment_list','attachment.list','attachment-list-input','attachment-list-output'),
  ],resources:[widgetResource('request-card','request-card'),
    widgetResource('request-picker','request-picker')],prompts:[],skills:[{
      id:'review-purchase-request',path:reviewSkill,audiences:['admin','app'],
      operations:[ref('operation','request.list'),ref('operation','request.get')],
      resources:['request-card-ui','request-picker-ui'],integrity:reviewSkillIntegrity}]},
    models:PURCHASE_MODELS,operations,permissions:[permission],publicContracts:[],schemas,
    search:[],settings:[],ui:{views,navigation:[{id:'requests',title:'Mes demandes',
      view:ref('view','list'),permissions:use,surfaces:['workspace','front'],order:20}],
      slots:[],front:{mode:'provided'},styles:[]},widgets:[
      widget('request-card','request-card','startRequestCard','request-get-output',
        'request.get','request-get-input','card'),
      widget('request-picker','request-picker','startRequestPicker','request-list-output',
        'request.list','request-list-input','picker'),
    ]},
  documentation:{installed:{readme:{path:'README.md',visibility:'public',artifact:'runtime'},
      prd:{path:'prd.md',visibility:'public',artifact:'runtime'},
      changelog:{path:'CHANGELOG.md',visibility:'public',artifact:'runtime'}},
    development:{agents:{path:'AGENTS.md',visibility:'restricted',artifact:'validation'},
      files:{path:'FILES.md',visibility:'restricted',artifact:'validation'},
      interview:{path:'interview.md',visibility:'restricted',artifact:'validation'},
      todo:{path:'TODO.md',visibility:'restricted',artifact:'validation'}},
    versionBinding:{moduleVersion:version,sourceRevision},
    localRevisions:{installedVersionDistinct:true,approvedImmutable:true},
    installationHistory:{distinctFromPackageChangelog:true}},
  packaging:{runtime:{files:['package.json','README.md','prd.md','CHANGELOG.md','LICENSE',
      'module/manifest.json',...compiledJs,...compiledJs.map(name=>name.replace(/\.js$/,'.d.ts')),
      'ui/widgets/request-card.html','ui/widgets/request-picker.html',
      'ui/widgets/request-message.txt','plugin/plugin.json','plugin/mcp.json',reviewSkill],references:[]},
    validation:{files:['AGENTS.md','FILES.md','interview.md','TODO.md','gate.mjs',
      'skills/README.md',...developmentSkills,
      'module/generate-manifest.mjs','module/models.ts','module/public-contract.ts',
      'module/operations.ts','module/entry.server.ts','ui/contributions.ts',
      'ui/workspace/views.tsx','ui/workspace/state.ts','ui/workspace/components.tsx',
      'ui/widgets/request-card.ts','ui/widgets/request-picker.ts','ui/widgets/runtime.ts',
      'ui/widgets/data.ts',
      'plugin/contributions.ts','tsconfig.json','scripts/build.mjs','scripts/package.mjs',
      'scripts/demo.mjs','scripts/sdk-version.mjs','demo/README.md',
      'tests/package/source-archive.test.mjs','tests/package/sdk-version.test.mjs',...suiteNames.flatMap(name=>
        [`ci/${name}.mjs`,`tests/${name}/contract.test.mjs`]),'ci/run-suite.mjs'],references:[]},
    validationBinding:{moduleId,moduleVersion:version,sourceRevision},noRuntimeTests:true,
    installation:'build-and-publish',providerInstallation:false},
  validation:{gate:'gate.mjs',suites,
    policy:{id:'creezio.local-contracts',version:'1.0.0',
      integrity:'sha256-469b93af15a6dd7066e767f45af8587e613ee2f080d142ed076b00613acb5dfd'},
    isolation:{productionSecrets:false,publicationRights:false},
    evidence:{sourceIntegrity:true,artifactIntegrity:true,profile:true,executedSuites:true}},
  lifecycle:{deactivation:'preserve-data',configuration:'explicit-state',
    uninstall:'explicit-approved-action',activationRequirements:[],absent:{},
    dependencyChanges:{install:'resolve-explicit-consumer-selection',
      activate:'require-active-dependencies',update:'validate-dependent-contracts',
      deactivate:'block-or-explicit-dependent-plan',uninstall:'block-or-explicit-dependent-plan',
      data:'preserve'}},
};

writeFileSync(path.join(root,'module/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
