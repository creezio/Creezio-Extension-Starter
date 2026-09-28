/** Versioned JSON boundary shared by the packaged module, its views and its plugin. */
export const PURCHASE_MODULE_ID = 'creezio.purchase-requests' as const;
export const PURCHASE_MODULE_VERSION = '0.1.3' as const;

export const PURCHASE_OPERATIONS = Object.freeze({
  create: 'request.create',
  list: 'request.list',
  get: 'request.get',
  update: 'request.update',
  submit: 'request.submit',
  withdraw: 'request.withdraw',
  attachmentLink: 'attachment.link',
  attachmentList: 'attachment.list',
} as const);

export type PurchaseAudience = 'admin' | 'app';
export type PurchaseStatus = 'draft' | 'submitted' | 'withdrawn';
export type PurchaseRequest = Readonly<{
  id: string;
  title: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: PurchaseStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}>;
export type PurchaseAttachmentReference = Readonly<{
  fileId: string;
  intentId: string;
  generation: string;
  digest: string;
}>;
export type PurchaseAttachment = Readonly<{
  requestId: string;
  fileId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  digest: string;
  createdAt: string;
  reference: PurchaseAttachmentReference;
}>;

export type RequestCreateInput = Readonly<{
  requestKey: string;
  title: string;
  description: string;
  amountMinor: number;
  currency: string;
}>;
export type RequestListInput = Readonly<{limit: number; cursor?: string}>;
export type RequestGetInput = Readonly<{id: string}>;
export type RequestUpdateInput = RequestCreateInput & Readonly<{id: string; revision: number}>;
export type RequestTransitionInput = Readonly<{requestKey: string; id: string; revision: number}>;
export type AttachmentLinkInput = RequestTransitionInput & Readonly<{staged: PurchaseAttachmentReference}>;
export type AttachmentListInput = Readonly<{id: string; limit: number; cursor?: string}>;

export type RequestOutput = Readonly<{request: PurchaseRequest}>;
export type RequestGetOutput = Readonly<{request: PurchaseRequest | null}>;
export type RequestListOutput = Readonly<{items: readonly PurchaseRequest[]; nextCursor: string | null}>;
export type AttachmentLinkOutput = Readonly<{attachment: PurchaseAttachment; requestRevision: number}>;
export type AttachmentListOutput = Readonly<{items: readonly PurchaseAttachment[]; nextCursor: string | null}>;

export const purchaseBindingId = (audience: PurchaseAudience, operationId: typeof PURCHASE_OPERATIONS[keyof typeof PURCHASE_OPERATIONS]) =>
  `${PURCHASE_MODULE_ID}:${audience}.${operationId}` as const;
