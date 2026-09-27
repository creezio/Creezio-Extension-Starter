import type {DataModel} from '@creezio/sdk/operations/handler';

type ModelField = DataModel['fields'][number];

const moduleId = 'creezio.purchase-requests';
const reference = (kind: string, id: string) => ({moduleId, kind, id});
const field = (id: string, type: ModelField['type'], options: {
  nullable?: boolean; protected?: boolean; constraints?: ModelField['constraints'];
} = {}): ModelField => ({id, type, nullable: options.nullable ?? false, protected: options.protected ?? false,
  computed: false, ...(options.constraints ? {constraints: options.constraints} : {})});
const string = (maxLength: number, minLength = 1) => ({minLength, maxLength});
const integer = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => ({minimum, maximum});
const context = field('context_id', 'string', {protected: true, constraints: string(128)});
const owner = field('owner_id', 'string', {constraints: string(128)});
const permission = reference('permission', 'use');

export const PURCHASE_MODELS = [
  {
    id: 'request', title: 'Demandes d’achat', scope: 'context', contextField: 'context_id',
    fields: [context, owner, field('id', 'string', {constraints: string(128)}),
      field('title', 'string', {constraints: string(240)}),
      field('description', 'string', {constraints: string(4000, 0)}),
      field('amount_minor', 'integer', {constraints: integer(0, 1_000_000_000_000)}),
      field('currency', 'string', {constraints: string(3, 3)}),
      field('status', 'string', {constraints: {enum: ['draft', 'submitted', 'withdrawn']}}),
      field('revision', 'integer', {constraints: integer(1)}),
      field('created_at', 'date-time'), field('updated_at', 'date-time'),
      field('submitted_at', 'date-time', {nullable: true})],
    primaryKey: ['context_id', 'owner_id', 'id'],
    indexes: [{id: 'recent', fields: ['context_id', 'owner_id', 'updated_at', 'id'], unique: false}],
    relations: [], permissions: [permission], deletion: {mode: 'soft', requiresApproval: false}, public: false,
  },
  {
    id: 'file_metadata', title: 'Fichiers privés des demandes', scope: 'context', contextField: 'context_id',
    fields: [context,
      field('file_id', 'string', {protected: true, constraints: string(67)}),
      field('file_owner', 'string', {protected: true, constraints: string(260)}),
      field('object_key', 'string', {protected: true, constraints: string(512)}),
      field('digest', 'string', {protected: true, constraints: string(64, 64)}),
      field('byte_size', 'integer', {protected: true, constraints: integer()}),
      field('content_type', 'string', {protected: true, constraints: string(128)}),
      field('filename', 'string', {protected: true, constraints: string(255)}),
      field('version', 'integer', {protected: true, constraints: integer(1)}),
      field('state', 'string', {protected: true, constraints: {enum: ['staging', 'staged', 'available', 'abandoned', 'deleted']}}),
      field('intent_id', 'string', {protected: true, constraints: string(128)}),
      field('generation', 'string', {protected: true, constraints: string(128)})],
    primaryKey: ['context_id', 'file_id'],
    indexes: [{id: 'intent', fields: ['context_id', 'intent_id', 'generation'], unique: true},
      {id: 'object-key', fields: ['context_id', 'object_key'], unique: true}],
    relations: [], permissions: [permission], deletion: {mode: 'soft', requiresApproval: false}, public: false,
  },
  {
    id: 'request_attachment', title: 'Pièces jointes des demandes', scope: 'context', contextField: 'context_id',
    fields: [context, owner,
      field('request_id', 'string', {constraints: string(128)}),
      field('file_id', 'string', {constraints: string(67)}),
      field('filename', 'string', {constraints: string(255)}),
      field('content_type', 'string', {constraints: string(128)}),
      field('byte_size', 'integer', {constraints: integer()}),
      field('digest', 'string', {constraints: string(64, 64)}),
      field('intent_id', 'string', {constraints: string(128)}),
      field('generation', 'string', {constraints: string(128)}),
      field('created_at', 'date-time')],
    primaryKey: ['context_id', 'owner_id', 'request_id', 'file_id'],
    indexes: [{id: 'by-request', fields: ['context_id', 'owner_id', 'request_id', 'created_at', 'file_id'], unique: false}],
    relations: [{id: 'request', fields: ['context_id', 'owner_id', 'request_id'],
      target: reference('model', 'request'), targetFields: ['context_id', 'owner_id', 'id'], onDelete: 'restrict'}],
    permissions: [permission], deletion: {mode: 'soft', requiresApproval: false}, public: false,
  },
] as const satisfies readonly DataModel[];
