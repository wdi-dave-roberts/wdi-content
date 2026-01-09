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

export type ReceiptCategory = 'labor' | 'materials' | 'equipment' | 'permit' | 'inspection' | 'design' | 'other'
export type ReceiptStatus = 'draft' | 'pending' | 'approved' | 'paid' | 'disputed' | 'void'
export type PaymentMethod = 'cash' | 'check' | 'credit-card' | 'debit' | 'wire' | 'ach' | 'venmo' | 'zelle'

export type NoteType = 'general' | 'issue' | 'decision' | 'question' | 'reminder' | 'change-request'
export type NotePriority = 'low' | 'normal' | 'high' | 'urgent'

export type MilestoneStatus = 'upcoming' | 'reached' | 'missed'

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
  status?: ReceiptStatus
  paymentMethod?: PaymentMethod
  checkNumber?: string
  invoiceNumber?: string
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

// Root project data interface

export interface ProjectData {
  $schema?: string
  version: string
  tasks: Task[]
  vendors: Vendor[]
  receipts: Receipt[]
  notes: Note[]
  milestones?: Milestone[]
  budget?: Budget
}

// Utility types for tag references

export type VendorTag = `vendor:${string}`
export type TaskTag = `task:${string}`
export type ReceiptTag = `receipt:${string}`
export type EntityTag = VendorTag | TaskTag | ReceiptTag | 'project'
