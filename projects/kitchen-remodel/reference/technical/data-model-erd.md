# Project Data Model ERD

Entity Relationship Diagram for the White Doe Inn project management data model.

## Full Entity Diagram

```mermaid
erDiagram
    ProjectData ||--o{ Task : contains
    ProjectData ||--o{ Vendor : contains
    ProjectData ||--o{ Receipt : contains
    ProjectData ||--o{ Note : contains
    ProjectData ||--o{ Milestone : contains
    ProjectData ||--o{ Payment : contains
    ProjectData ||--o{ ChangeOrder : contains
    ProjectData ||--o| Budget : has
    ProjectData ||--o| Contract : has

    Task ||--o{ Task : "depends on"
    Task }o--o| Vendor : "assigned to"
    Task }o--o{ Milestone : "required for"
    Task }o--o{ ChangeOrder : "affected by"

    Vendor ||--o{ Receipt : "bills"
    Vendor }o--o| Contract : "party to"

    Receipt }o--o| Task : "for"
    Receipt }o--o| ChangeOrder : "part of"
    Receipt }o--o| Vendor : "from"

    Note }o--o{ Task : "tagged"
    Note }o--o{ Vendor : "tagged"
    Note }o--o{ Milestone : "tagged"
    Note }o--o{ Receipt : "tagged"

    Payment }o--o| Milestone : "triggered by"
    Payment ||--o{ PaymentLienWaiver : has

    ChangeOrder ||--o{ ChangeOrderApproval : requires

    Task {
        string id PK
        string name
        date start
        date end
        number progress
        string[] dependencies FK
        string assignee FK "vendor:{id}"
        TaskStatus status
        TaskPriority priority
        TaskCategory category
        string description
        number estimatedCost
        number actualCost
        string location
    }

    Vendor {
        string id PK
        string name
        VendorType type
        VendorTrade trade
        VendorContact contact
        VendorLicense license
        VendorInsurance insurance
        number rating
        VendorStatus status
        PaymentTerms paymentTerms
        string folder
        string website
    }

    Receipt {
        string id PK
        string vendor FK "vendor:{id}"
        string href
        date date
        date dueDate
        number amount
        number tax
        string description
        LineItem[] lineItems
        ReceiptType type
        ReceiptCategory category
        string task FK "task:{id}"
        string changeOrder FK "co:{id}"
        ReceiptStatus status
        PaidBy paidBy
        number markupPercent
        boolean ownerSelected
        boolean allowable
        PaymentMethod paymentMethod
        string checkNumber
        string invoiceNumber
        LienWaiver lienWaiver
    }

    Note {
        string id PK
        datetime created
        datetime updated
        string author
        string content
        string[] tags FK
        NoteType type
        NotePriority priority
        boolean pinned
        boolean resolved
        string[] attachments
    }

    Milestone {
        string id PK
        string name
        date date
        string description
        MilestoneStatus status
        string[] tasks FK
    }

    Payment {
        string id PK
        string name
        number amount
        date scheduledDate
        date receivedDate
        string milestone FK "milestone:{id}"
        PaymentStatus status
        PaymentMethod method
        string checkNumber
        string href
        string notes
    }

    PaymentLienWaiver {
        string vendor FK "vendor:{id}"
        LienWaiverType type
        boolean received
        date date
        string href
    }

    ChangeOrder {
        string id PK
        integer number
        date requestDate
        string description
        ChangeOrderReason reason
        number costImpact
        integer scheduleImpact
        string[] tasks FK
        string[] receipts FK
        ChangeOrderStatus status
        string href
    }

    ChangeOrderApproval {
        ApprovalParty party
        string vendor FK "vendor:{id}"
        ApprovalStatus status
        date date
        string signedBy
        string href
        string notes
    }

    Budget {
        number total
        number contingency
        BudgetCategory categories
    }

    Contract {
        ContractType type
        number targetPrice
        number contingencyPercent
        number contingencyAmount
        MarkupRules markupRules
        ContractParties parties
        date startDate
        date completionDate
        string href
    }
```

## Enumerations

```mermaid
erDiagram
    TASK_STATUS {
        string pending
        string scheduled
        string in_progress
        string completed
        string blocked
        string cancelled
    }

    TASK_PRIORITY {
        string low
        string normal
        string high
        string critical
    }

    TASK_CATEGORY {
        string demolition
        string rough-in
        string structural
        string mechanical
        string electrical
        string plumbing
        string finish
        string fixtures
        string cleanup
        string inspection
    }

    VENDOR_TYPE {
        string general-contractor
        string subcontractor
        string specialty-contractor
        string supplier
        string materials
        string equipment-rental
        string utility
        string government
        string inspector
        string designer
        string consultant
        string other
    }

    VENDOR_TRADE {
        string general
        string electrical
        string plumbing
        string hvac
        string flooring
        string drywall
        string painting
        string carpentry
        string trim
        string cabinetry
        string countertops
        string tile
        string roofing
        string demolition
        string hauling
        string appliances
        string fixtures
        string multiple
    }

    RECEIPT_CATEGORY {
        string subcontractor "20% markup"
        string materials "20% markup"
        string labor "20% markup"
        string professional "20% markup"
        string permit "0% markup"
        string site-support "0% markup"
        string pm-fee "0% markup"
        string lodging "0% markup"
        string owner-furnished "N/A"
        string other
    }

    PAYMENT_STATUS {
        string scheduled "future"
        string awaiting-request "milestone reached"
        string requested "GC submitted"
        string due "approved"
        string received "paid"
        string deferred "postponed"
        string overdue "past due"
    }

    CHANGE_ORDER_STATUS {
        string draft
        string pending
        string approved
        string rejected
        string void
    }

    APPROVAL_PARTY {
        string owner
        string gc
        string sub
    }
```

## Tag Reference System

The data model uses a flexible tag-based reference system:

| Tag Format | Example | Description |
|------------|---------|-------------|
| `vendor:{id}` | `vendor:weathertek` | Reference to a vendor |
| `task:{id}` | `task:demolition` | Reference to a task |
| `receipt:{id}` | `receipt:inv-001` | Reference to a receipt |
| `milestone:{id}` | `milestone:rough-in-complete` | Reference to a milestone |
| `co:{id}` | `co:co-001` | Reference to a change order |
| `project` | `project` | Project-level reference |

## Cost-Plus Contract Flow

```mermaid
flowchart TD
    subgraph Costs["Allowable Costs"]
        R1[Receipt] --> CAT{Category}
        CAT -->|subcontractor| M20A[+20% markup]
        CAT -->|materials| M20B[+20% markup]
        CAT -->|labor| M20C[+20% markup]
        CAT -->|professional| M20D[+20% markup]
        CAT -->|permit| M0A[0% markup]
        CAT -->|site-support| M0B[0% markup]
        CAT -->|pm-fee| M0C[0% markup]
        CAT -->|lodging| M0D[0% markup]
    end

    subgraph Billing["Billing Logic"]
        R1 --> PB{Paid By?}
        PB -->|project| PROJ[Counts toward total]
        PB -->|owner| OWN[Owner direct - excluded]

        R1 --> OS{Owner Selected?}
        OS -->|yes| NOMARK[No markup, counts toward owed]
        OS -->|no| STDMARK[Standard markup applies]
    end

    subgraph Payments["Payment Schedule"]
        DEP[Deposit $60K] --> D1[Draw 1 $25K]
        D1 --> |rough-in complete| FINAL[Final = Balance]
        FINAL --> |final inspection| CLOSE[Project Close]
    end
```

## Change Order Approval Flow

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Pending: Submit

    Pending --> OwnerReview: Route to Owner
    OwnerReview --> GCReview: Owner Approves
    OwnerReview --> Rejected: Owner Rejects

    GCReview --> SubReview: GC Approves (if sub involved)
    GCReview --> Approved: GC Approves (no sub)
    GCReview --> Rejected: GC Rejects

    SubReview --> Approved: Sub Approves
    SubReview --> Rejected: Sub Rejects

    Approved --> [*]
    Rejected --> Draft: Revise

    Draft --> Void: Cancel
    Pending --> Void: Cancel
    Void --> [*]
```

## File References

- **Schema**: `projects/_schema/project-data.schema.json`
- **TypeScript Types**: `src/types/project-data.d.ts`
- **Project Data**: `projects/kitchen-remodel/data.json`
