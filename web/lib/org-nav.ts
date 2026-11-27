import {
  CircleUserRoundIcon,
  ContainerIcon,
  FolderOpenIcon,
  HandshakeIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  PackageIcon,
  ReceiptTextIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TruckIcon,
  type LucideIcon,
} from "lucide-react"

export type OrgSection = {
  title: string
  /** Path below /org/<slug>. Empty for the dashboard. */
  path: string
  icon: LucideIcon
  description: string
}

// The sidebar follows an owner's day: what needs attention and how the
// business is doing, the loads and the money they bring in, then the fleet,
// then compliance. Add new items to the group they belong to.
export const ORG_NAV: { label?: string; items: OrgSection[] }[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        path: "",
        icon: LayoutDashboardIcon,
        description:
          "What needs action today, and reports: profit per load, cost per mile and empty miles, broken down by truck, broker and route.",
      },
      {
        title: "Loads",
        path: "loads",
        icon: PackageIcon,
        description:
          "Every load from rate confirmation to paid, filtered by booked, in transit, delivered, invoiced and paid. Uploading a rate confirmation starts a new load here.",
      },
      {
        title: "Customers",
        path: "customers",
        icon: HandshakeIcon,
        description:
          "The brokers and direct shippers you haul for: contacts, billing, FMCSA checks for brokers, payment history and average days to pay.",
      },
      {
        title: "Invoices",
        path: "invoices",
        icon: ReceiptTextIcon,
        description:
          "Drafts, sent, overdue and paid invoices, plus factoring submissions.",
      },
    ],
  },
  {
    label: "Fleet",
    items: [
      {
        title: "Drivers",
        path: "drivers",
        icon: IdCardIcon,
        description:
          "Each driver's profile, qualification file, documents and assigned loads, and their weekly pay.",
      },
      {
        title: "Trucks",
        path: "equipment",
        icon: TruckIcon,
        description: "Equipment records, registration and inspections.",
      },
      {
        title: "Trailers",
        path: "trailers",
        icon: ContainerIcon,
        description:
          "Each trailer's type, plate, registration and inspections, and which truck is pulling it.",
      },
    ],
  },
  {
    label: "Compliance",
    items: [
      {
        title: "Compliance",
        path: "compliance",
        icon: ShieldCheckIcon,
        description:
          "The calendar of filings like IFTA, UCR and MCS-150, every driver's and truck's expiration dates with red, yellow and green status, and IFTA reports.",
      },
      {
        title: "Documents",
        path: "documents",
        icon: FolderOpenIcon,
        description:
          "The company's authority, insurance and W-9 with expiration dates, and every load, driver and receipt file in one searchable place.",
      },
    ],
  },
]

// Kept apart from the main nav, at the bottom of the sidebar.
export const ORG_NAV_FOOTER: OrgSection[] = [
  {
    title: "Settings",
    path: "settings",
    icon: Settings2Icon,
    description: "Company profile, users and roles, and billing.",
  },
  {
    title: "Help & support",
    path: "help",
    icon: LifeBuoyIcon,
    description: "Guides, answers and a way to reach the OfficeTruck team.",
  },
]

export const NEW_LOAD: OrgSection = {
  title: "New load",
  path: "loads/new",
  icon: PackageIcon,
  description:
    "Upload a rate confirmation to start a load. Its details will fill in from the document.",
}

// Opened from the account menu rather than the sidebar.
export const ACCOUNT: OrgSection = {
  title: "Your profile",
  path: "account",
  icon: CircleUserRoundIcon,
  description:
    "Your name, sign-in details and the organizations you belong to.",
}

const ALL_SECTIONS = [
  ...ORG_NAV.flatMap((group) => group.items),
  ...ORG_NAV_FOOTER,
  NEW_LOAD,
  ACCOUNT,
]

export function findSection(path: string) {
  return ALL_SECTIONS.find((section) => section.path === path)
}
