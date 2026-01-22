// Project Data Types
// Auto-generated from project-data.schema.json

export type TaskStatus = 'pending' | 'scheduled' | 'inProgress' | 'completed' | 'blocked' | 'cancelled'
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low'
export type TaskOwner = 'Owner' | 'Contractor'
export type TaskCategory =
  | 'demolition'
  | 'structural'
  | 'mechanical'
  | 'electrical'
  | 'plumbing'
  | 'finish'
  | 'fixtures'
  | 'cleanup'
  | 'inspection'
  | 'equipment'
  | 'windowsAndDoors'

// IssueStatus is now aliased to QuestionStatus (see below)
// Kept for backward compatibility with any code using the old type name

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

// Issue/Question types (unified issues system)
// Note: "Question" and "Issue" are now synonyms - the system has been unified
export type QuestionAssignee = 'brandon' | 'dave' | 'tonia'
export type IssueAssignee = QuestionAssignee | 'system'  // system for auto-detected
export type QuestionStatus = 'open' | 'answered' | 'resolved' | 'dismissed'
export type IssueStatus = QuestionStatus  // Alias for unified naming
export type QuestionReviewStatus = 'pending' | 'accepted' | 'rejected'
export type IssueReviewStatus = QuestionReviewStatus  // Alias

// Action-oriented categories for issues
// - ASSIGN: "What do I need to assign?" (Brandon)
// - SCHEDULE: "What do I need to schedule?" (Brandon)
// - ORDER: "What do I need to order?" (Tonia - materials ready to buy)
// - SPECIFY: "What needs specs/quantity?" (Tonia - materials needing details)
// - TRACK: "What needs delivery info?" (Tonia - materials ordered, tracking needed)
// - DECIDE: "What decisions are needed?" (Varies - binary decisions, dependencies)
export type ActionCategory = 'ASSIGN' | 'SCHEDULE' | 'ORDER' | 'SPECIFY' | 'TRACK' | 'DECIDE'

// Issue source - where the issue came from
export type IssueSource = 'manual' | 'auto-lifecycle' | 'auto-detection'

// Structured question types
export type QuestionType =
  | 'assignee'
  | 'date'
  | 'date-range'
  | 'dependency'
  | 'yes-no'
  | 'select-one'
  | 'material-status'
  | 'notification'
  | 'free-text'
  | 'schedule-conflict'
  | 'missing-assignee'
  | 'past-due'
  | 'unscheduled-blocker'
  | 'material-overdue'

// Structured response types (type-safe union)
export type StructuredResponse =
  | { type: 'assignee'; value: string }           // vendor:{id}
  | { type: 'date'; value: string }               // YYYY-MM-DD
  | { type: 'date-range'; start: string; end: string }
  | { type: 'dependency'; tasks: string[] }       // task IDs
  | { type: 'yes-no'; value: boolean }
  | { type: 'select-one'; value: string }
  | { type: 'material-status'; value: string }    // MaterialStatus value
  | { type: 'notification'; acknowledged: boolean }
  | { type: 'free-text'; value: string }

// Question config for type-specific options
export interface QuestionConfig {
  tradeFilter?: string[]      // For assignee: filter by vendor trades
  options?: string[]          // For select-one: list of valid options
  statusOptions?: string[]    // For material-status: valid status values
}

// Applied change record for audit trail
export interface AppliedChange {
  entity: 'task' | 'subtask' | 'material'
  entityId: string
  field: string
  oldValue: unknown
  newValue: unknown
}

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
  id: string // Hierarchical: "1", "1.1", "1.2.3" - auto-generated
  parentId?: string // Parent task ID for subtasks
  name: string
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  owner: TaskOwner
  assignee?: string // Vendor name from vendor list
  dependencies?: string[] // Task IDs that must complete first
  subtasks?: Task[] // Recursive nested subtasks
  progress?: number
  status?: TaskStatus
  priority?: TaskPriority
  category?: TaskCategory
  description?: string
  estimatedCost?: number
  actualCost?: number
  location?: string
  lastUpdated?: string // ISO 8601 - auto-generated
  comments?: string
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

// Note: The old Issue interface (I1, I2, I3...) has been replaced by the unified
// issues system which uses the Question interface renamed as Issue.
// See the Issue type alias after the Question interface.

export interface Question {
  id: string // Auto-generated: i-{type}-{slug}, il-{type}-{task}, id-{type}-{task}
  created: string // YYYY-MM-DD

  // Classification (new fields for unified issues system)
  category?: ActionCategory     // What action is needed? (ASSIGN, SCHEDULE, ORDER, SPECIFY, TRACK, DECIDE)
  source?: IssueSource          // Where this came from (manual, auto-lifecycle, auto-detection)
  title?: string                // Short summary for display
  priority?: 'low' | 'normal' | 'high' | 'critical'

  // Question definition
  type?: QuestionType           // Structured question type (undefined = legacy free-text)
  prompt?: string               // Question text for structured questions
  question?: string             // Legacy field (kept for backward compatibility)
  description?: string          // Additional context
  config?: QuestionConfig       // Type-specific options

  // Context
  relatedTask?: string          // Task ID (without task: prefix)
  relatedTasks?: string[]       // For cross-task issues (schedule conflicts)
  relatedMaterial?: string      // Material ID from task's materialDependencies

  // Assignment
  assignee: QuestionAssignee | 'system'
  status: QuestionStatus

  // Response
  response?: StructuredResponse | string  // Structured response or legacy string
  responseNotes?: string        // Optional explanation with response
  respondedAt?: string          // YYYY-MM-DD when response was added

  // Review workflow
  reviewStatus?: QuestionReviewStatus  // pending | accepted | rejected
  rejectionReason?: string      // Reason if rejected
  appliedChanges?: AppliedChange[]     // Audit trail of changes made

  // Resolution
  resolvedAt?: string           // YYYY-MM-DD when resolved (replaces resolvedDate)
  resolvedDate?: string         // Legacy field (kept for backward compatibility)
  resolvedBy?: 'manual' | 'auto' // How this was resolved

  // Auto-detection tracking
  detectionRule?: string        // Rule that created this issue
  lastChecked?: string          // When condition was last verified
}

// Issue is the new name for Question (unified issues system)
// Using the same interface - the rename happens at the array level (questions → issues)
export type Issue = Question

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
  // questions is the legacy name, will be migrated to issues
  questions?: Question[]
  // issues is the new unified system (includes questions + auto-detected issues)
  issues?: Issue[]
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
export type IssueTag = `issue:${string}`
export type QuestionTag = `question:${string}`
export type EntityTag = VendorTag | TaskTag | ReceiptTag | MilestoneTag | ChangeOrderTag | IssueTag | QuestionTag | 'project'
