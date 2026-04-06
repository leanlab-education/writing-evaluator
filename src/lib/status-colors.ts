export const statusColors: Record<string, string> = {
  SETUP: 'bg-status-setup-bg text-status-setup-text',
  ACTIVE: 'bg-status-active-bg text-status-active-text',
  RECONCILIATION: 'bg-status-reconciliation-bg text-status-reconciliation-text',
  COMPLETE: 'bg-status-complete-bg text-status-complete-text',
}

export const batchStatusColors: Record<string, string> = {
  DRAFT: 'bg-status-setup-bg text-status-setup-text',
  SCORING: 'bg-status-active-bg text-status-active-text',
  RECONCILING: 'bg-status-reconciliation-bg text-status-reconciliation-text',
  COMPLETE: 'bg-status-complete-bg text-status-complete-text',
}

export const batchStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  SCORING: 'Scoring',
  RECONCILING: 'Reconciling',
  COMPLETE: 'Complete',
}
