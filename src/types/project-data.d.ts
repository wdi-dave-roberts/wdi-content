// Project Data Types
// Auto-generated from project-data.schema.json

export type TaskStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'
export type TaskCategory =
  | 'demolition'
  | 'rough-in'
  | 'structural'
  | 'mechanical'
  | 'electrical'
  | 'plumbing'
  | 'finish'
  | 'fixtures'
  | 'cleanup'
  | 'inspection'

export type VendorType =
  | 'general-contractor'
  | 'subcontractor'
  | 'specialty-contractor'
  | 'supplier'
  | 'materials'
  | 'equipment-rental'
  | 'utility'
  | 'government'
  | 'inspector'
  | 'designer'
  | 'consultant'
  | 'other'

export type VendorTrade =
  | 'general'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'flooring'
  | 'drywall'
  | 'painting'
  | 'carpentry'
  | 'trim'
  | 'cabinetry'
  | 'countertops'
  | 'tile'
  | 'roofing'
  | 'demolition'
  | 'hauling'
  | 'appliances'
  | 'fixtures'
  | 'multiple'

export type VendorStatus = 'active' | 'inactive' | 'preferred' | 'blacklisted'
export type PaymentTerms = 'cod' | 'net-15' | 'net-30' | 'draws' | 'milestone'

export type ReceiptType =
  | 'estimate'
  | 'quote'
  | 'invoice'
  | 'receipt'
  | 'payment'
  | 'draw'
  | 'change-order'
  | 'credit'

// Receipt categories aligned with contract Exhibit D
export type ReceiptCategory =
  | 'subcontractor'
  | 'materials'
  | 'labor'
  | 'professional'
  | 'permit'
  | 'site-support'
  | 'pm-fee'
  | 'lodging'
  | 'owner-furnished'
  | 'other'

export type PaidBy = 'project' | 'owner'
export type ReceiptStatus = 'draft' | 'pending' | 'approved' | 'paid' | 'disputed' | 'void'
export type PaymentMethod = 'cash' | 'check' | 'credit-card' | 'debit' | 'wire' | 'ach' | 'venmo' | 'zelle'

export type NoteType = 'general' | 'issue' | 'decision' | 'question' | 'reminder' | 'change-request'
export type NotePriority = 'low' | 'normal' | 'high' | 'urgent'

export type MilestoneStatus = 'upcoming' | 'reached' | 'missed'

// Payment types
// scheduled: future payment, milestone not reached
// awaiting-request: milestone reached, GC hasn't submitted draw request
// requested: GC submitted draw request, awaiting approval
// due: approved, payment is due
// received: payment made
// deferred: postponed by agreement
// overdue: past due date
export type PaymentStatus = 'scheduled' | 'awaiting-request' | 'requested' | 'due' | 'received' | 'deferred' | 'overdue'

// Change Order types
export type ChangeOrderReason =
  | 'owner-request'
  | 'unforeseen-condition'
  | 'design-change'
  | 'code-compliance'
  | 'value-engineering'
  | 'scope-clarification'
  | 'other'

export type ChangeOrderStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'void'
export type ApprovalParty = 'owner' | 'gc' | 'sub'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

// Contract types
export type ContractType = 'fixed-price' | 'cost-plus' | 'time-materials' | 'unit-price'

// Lien waiver types
export type LienWaiverType = 'conditional' | 'unconditional'

// Entity interfaces

export interface Task {
  id: string
  name: string
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  progress?: number
  dependencies?: string[]
  assignee?: string // vendor:{id}
  status?: TaskStatus
  priority?: TaskPriority
  category?: TaskCategory
  description?: string
  estimatedCost?: number
  actualCost?: number
  location?: string
}

export interface VendorContact {
  name?: string
  phone?: string
  email?: string
  address?: {
    street?: string
    city?: string
    state?: string
    zip?: string
  }
}

export interface VendorLicense {
  number?: string
  state?: string
  expiration?: string
}

export interface VendorInsurance {
  liability?: boolean
  workersComp?: boolean
  policyNumber?: string
  expiration?: string
}

export interface Vendor {
  id: string
  name: string
  type: VendorType
  trade?: VendorTrade
  contact?: VendorContact
  license?: VendorLicense
  insurance?: VendorInsurance
  rating?: number
  status?: VendorStatus
  paymentTerms?: PaymentTerms
  folder?: string
  website?: string
}

export interface LineItem {
  description?: string
  quantity?: number
  unitPrice?: number
  total?: number
}

export interface ReceiptMetadata {
  ocrConfidence?: number
  extractedAt?: string
  extractedBy?: string
  verified?: boolean
  verifiedBy?: string
  verifiedAt?: string
}

export interface LienWaiverStatus {
  received?: boolean
  date?: string // YYYY-MM-DD
  href?: string
}

export interface ReceiptLienWaiver {
  conditional?: LienWaiverStatus
  unconditional?: LienWaiverStatus
}

export interface Receipt {
  id: string
  vendor: string // vendor:{id}
  href?: string
  date: string // YYYY-MM-DD
  dueDate?: string
  amount: number
  tax?: number
  description?: string
  lineItems?: LineItem[]
  type?: ReceiptType
  category?: ReceiptCategory
  task?: string // task:{id}
  changeOrder?: string // co:{id}
  status?: ReceiptStatus
  paidBy?: PaidBy
  markupPercent?: number // 0-100, default by category
  ownerSelected?: boolean // Owner selected item - no markup but counts toward owed
  allowable?: boolean // True unless rework or excluded per contract
  paymentMethod?: PaymentMethod
  checkNumber?: string
  invoiceNumber?: string
  lienWaiver?: ReceiptLienWaiver
  metadata?: ReceiptMetadata
}

export interface Note {
  id: string
  created: string // ISO 8601
  updated?: string
  author?: string
  content: string
  tags: string[]
  type?: NoteType
  priority?: NotePriority
  pinned?: boolean
  resolved?: boolean
  attachments?: string[]
}

export interface Milestone {
  id: string
  name: string
  date: string // YYYY-MM-DD
  description?: string
  status?: MilestoneStatus
  tasks?: string[]
}

export interface BudgetCategory {
  budgeted?: number
  spent?: number
}

export interface Budget {
  total?: number
  contingency?: number
  categories?: Record<string, BudgetCategory>
}

export interface PaymentLienWaiver {
  vendor: string // vendor:{id}
  type: LienWaiverType
  received?: boolean
  date?: string
  href?: string
}

export interface Payment {
  id: string
  name: string // "Deposit", "Draw 1 - Rough-In", etc.
  amount: number
  scheduledDate?: string // YYYY-MM-DD
  receivedDate?: string // YYYY-MM-DD
  milestone?: string // milestone:{id}
  status?: PaymentStatus
  method?: PaymentMethod
  checkNumber?: string
  href?: string
  lienWaivers?: PaymentLienWaiver[]
  notes?: string
}

export interface ChangeOrderApproval {
  party: ApprovalParty
  vendor?: string // vendor:{id} for sub approvals
  status: ApprovalStatus
  date?: string
  signedBy?: string
  href?: string
  notes?: string
}

export interface ChangeOrder {
  id: string
  number: number // Sequential CO-001, CO-002, etc.
  requestDate: string
  description: string
  reason?: ChangeOrderReason
  costImpact: number // Positive = increase, negative = credit
  scheduleImpact?: number // Days (positive = delay)
  tasks?: string[] // Affected task IDs
  receipts?: string[] // Associated receipt IDs
  approvals?: ChangeOrderApproval[]
  status: ChangeOrderStatus
  href?: string
}

export interface ContractParties {
  owner?: string // vendor:{id}
  contractor?: string // vendor:{id}
}

export interface Contract {
  type?: ContractType
  targetPrice?: number
  contingencyPercent?: number
  contingencyAmount?: number
  markupRules?: Record<string, number> // category -> markup percent
  parties?: ContractParties
  startDate?: string
  completionDate?: string
  href?: string
}

// Root project data interface

export interface ProjectData {
  $schema?: string
  version: string
  tasks: Task[]
  vendors: Vendor[]
  receipts: Receipt[]
  notes: Note[]
  milestones?: Milestone[]
  payments?: Payment[]
  changeOrders?: ChangeOrder[]
  budget?: Budget
  contract?: Contract
}

// Utility types for tag references

export type VendorTag = `vendor:${string}`
export type TaskTag = `task:${string}`
export type ReceiptTag = `receipt:${string}`
export type MilestoneTag = `milestone:${string}`
export type ChangeOrderTag = `co:${string}`
export type EntityTag = VendorTag | TaskTag | ReceiptTag | MilestoneTag | ChangeOrderTag | 'project'
