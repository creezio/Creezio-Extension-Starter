export {purchaseRequestsList, purchaseRequestNew, purchaseRequestDetail} from './workspace/views.tsx';

/** Routes are mounted by each compatible theme from the verified module manifest. */
export const contributions = [
  {id: 'list', route: '/requests', surfaces: ['workspace', 'front']},
  {id: 'new', route: '/purchase-requests/new', surfaces: ['workspace', 'front']},
  {id: 'detail', route: '/requests/{id}', surfaces: ['workspace', 'front']},
] as const;
