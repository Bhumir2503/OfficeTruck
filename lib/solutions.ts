type Tone = "good" | "warn" | "bad"

export type Solution = {
  slug: string
  name: string
  summary: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  headline: string
  lead: string
  /** Sample data for the hero card. Always labelled as an example on the page. */
  example: {
    title: string
    rows: { label: string; detail: string; value: string; tone?: Tone }[]
    totals: { label: string; value: string }[]
  }
  painsHeading: string
  pains: { title: string; body: string }[]
  featuresHeading: string
  /** `later` marks anything after the first two roadmap stages. */
  features: { title: string; body: string; later?: boolean }[]
  callout: { heading: string; body: string }
  faq: { question: string; answer: string }[]
}

export const solutions: Solution[] = [
  {
    slug: "owner-operators",
    name: "Owner-operators",
    summary: "Run the truck and the office without a second shift.",
    metaTitle: "Owner-Operator Software | OfficeTruck",
    metaDescription:
      "Loads, paperwork, invoices, expenses and compliance reminders in one place for owner-operators, with an app built for life on the road.",
    eyebrow: "For owner-operators",
    headline: "You drive all day. The paperwork shouldn't wait up for you.",
    lead: "Keep every load, receipt, invoice and renewal in one place, and see what you actually kept after the costs.",
    example: {
      title: "This week, Truck 101",
      rows: [
        {
          label: "Memphis to Dallas",
          detail: "Rate $1,400, paid",
          value: "+$495",
          tone: "good",
        },
        {
          label: "Dallas to Little Rock",
          detail: "Rate $780, invoiced",
          value: "+$240",
          tone: "good",
        },
        {
          label: "Little Rock to Nashville",
          detail: "Rate $950, delivered",
          value: "+$290",
          tone: "good",
        },
      ],
      totals: [
        { label: "Revenue", value: "$3,130" },
        { label: "Costs", value: "$2,105" },
        { label: "Profit", value: "$1,025" },
      ],
    },
    painsHeading: "One person. Every job in the business.",
    pains: [
      {
        title: "Paperwork after a full day of driving",
        body: "Rate cons, receipts and invoices pile up until the weekend.",
      },
      {
        title: "Receipts that vanish from the cab",
        body: "A lost lumper or fuel receipt is money you can't get back or write down.",
      },
      {
        title: "A bank balance that isn't a profit number",
        body: "Fuel, tolls, insurance and maintenance decide what a load really paid.",
      },
    ],
    featuresHeading: "An office that fits in the cab",
    features: [
      {
        title: "Loads from a rate con",
        body: "Upload the rate confirmation, check the details, and the load is created for you.",
      },
      {
        title: "Camera-first paperwork",
        body: "Photograph BOLs, PODs and receipts on your phone, even with no signal. They sync when you're back in coverage.",
      },
      {
        title: "Invoices ready to go",
        body: "Your packet is drafted from the load, so you only have to review it.",
      },
      {
        title: "Expenses by load",
        body: "Fuel, lumpers and tolls are tied to the run they belong to.",
      },
      {
        title: "Renewal reminders",
        body: "Keep company and truck deadlines in one calendar instead of in your head.",
      },
      {
        title: "Room to grow",
        body: "Add a truck or a driver later and keep your loads, documents and history.",
      },
    ],
    callout: {
      heading: "$39 a month for one truck",
      body: "Loads, documents, invoicing, expenses, compliance reminders and the driver app. This is early pricing and may change as we learn from pilot carriers.",
    },
    faq: [
      {
        question: "Do I need to be good with software?",
        answer:
          "No. The first version is built around a few jobs you already do: add a load, snap the paperwork, send the invoice.",
      },
      {
        question: "Can I use it from my phone?",
        answer:
          "Yes. The driver app covers your assigned loads, status updates and document uploads.",
      },
      {
        question: "What happens when I add a second truck?",
        answer:
          "You move to a fleet plan and keep your existing records. There's no starting over.",
      },
    ],
  },
  {
    slug: "small-fleets",
    name: "Small fleets",
    summary: "One view of every truck, driver and open invoice.",
    metaTitle: "Small Fleet TMS for 2 to 20 Trucks | OfficeTruck",
    metaDescription:
      "Trucking management software for small fleets: loads, dispatch basics, driver documents, invoicing and compliance in one connected system.",
    eyebrow: "For fleets of 2 to 20 trucks",
    headline: "Your fleet grew. Your spreadsheet didn't.",
    lead: "Give the owner and the office one shared view of every load, truck, driver, document and invoice.",
    example: {
      title: "Fleet today",
      rows: [
        {
          label: "Truck 101",
          detail: "In transit to Dallas, TX",
          value: "On route",
          tone: "good",
        },
        {
          label: "Truck 102",
          detail: "Delivered in Atlanta, GA",
          value: "POD missing",
          tone: "warn",
        },
        {
          label: "Truck 103",
          detail: "Empty in Memphis, TN",
          value: "Available",
        },
        {
          label: "Truck 104",
          detail: "In transit, registration due in 12 days",
          value: "Renewal due",
          tone: "warn",
        },
      ],
      totals: [
        { label: "In transit", value: "2" },
        { label: "Available", value: "1" },
        { label: "Need attention", value: "2" },
      ],
    },
    painsHeading: "Everything works until it depends on one person.",
    pains: [
      {
        title: "The whole operation in one person's head",
        body: "When the owner or dispatcher is out, nobody knows where things stand.",
      },
      {
        title: "Drivers sending paperwork every which way",
        body: "Texts, emails and photos have to be chased down and matched to loads.",
      },
      {
        title: "Tools that don't talk to each other",
        body: "Dispatch, billing and compliance each hold a different version of the truth.",
      },
    ],
    featuresHeading: "Run the fleet from one place",
    features: [
      {
        title: "Assignments that stay connected",
        body: "Match the driver, truck and trailer to the load, and keep the status timeline with it.",
      },
      {
        title: "A driver app that stays simple",
        body: "Assigned loads, stop details and document uploads, built to work with patchy signal.",
      },
      {
        title: "Roles for your office",
        body: "Owner, admin, dispatcher, accountant, safety manager and driver each see what they need.",
      },
      {
        title: "Fleet back office",
        body: "Drafted invoices, expenses, compliance tasks and standard reports across every truck.",
      },
      {
        title: "Driver settlements",
        body: "Calculate pay from the loads each driver actually ran.",
        later: true,
      },
      {
        title: "GPS through your ELD",
        body: "See last reported locations from the provider you already use, with the time of each update.",
        later: true,
      },
    ],
    callout: {
      heading: "Pay for active trucks, not a size bracket",
      body: "$25 per active truck a month on Fleet Basic ($70 minimum) or $35 on Fleet Plus ($99 minimum). Archived equipment isn't billed. This is early pricing and may change as we learn from pilot carriers.",
    },
    faq: [
      {
        question: "How many trucks can I have?",
        answer:
          "We're starting with fleets of up to 20 trucks. Both fleet plans are designed to keep working as you grow past that.",
      },
      {
        question: "Can my dispatcher and bookkeeper have separate access?",
        answer:
          "Yes. Roles are part of the foundation, so people only get the access their job needs.",
      },
      {
        question: "Do you replace my ELD?",
        answer:
          "No. We plan to connect to established ELD and telematics providers, not sell hardware.",
      },
    ],
  },
  {
    slug: "invoicing",
    name: "Invoicing",
    summary: "From signed POD to invoice sent, without the chase.",
    metaTitle: "Trucking Invoicing and Factoring Tracking | OfficeTruck",
    metaDescription:
      "Build complete trucking invoice packets from the load, catch missing PODs, and track factoring, aging, short-pays and broker payments.",
    eyebrow: "Trucking invoicing",
    headline: "Stop letting missing paperwork hold up your money.",
    lead: "Build the invoice from the load, catch what's missing before you send it, and see exactly who still owes you.",
    example: {
      title: "Invoice packet, Load #2041",
      rows: [
        {
          label: "Rate confirmation",
          detail: "Matched to load",
          value: "Attached",
          tone: "good",
        },
        {
          label: "Bill of lading",
          detail: "2 pages",
          value: "Attached",
          tone: "good",
        },
        {
          label: "Proof of delivery",
          detail: "Signature found",
          value: "Attached",
          tone: "good",
        },
        {
          label: "Lumper receipt",
          detail: "$85 on the load",
          value: "Missing",
          tone: "warn",
        },
      ],
      totals: [
        { label: "Ready", value: "$4,200" },
        { label: "Outstanding", value: "$18,650" },
        { label: "Overdue", value: "$1,900" },
      ],
    },
    painsHeading: "You did the work. Now you're chasing the check.",
    pains: [
      {
        title: "Invoices stuck waiting on a POD",
        body: "A delivered load earns nothing until its packet is complete.",
      },
      {
        title: "Packets rejected for a missing page",
        body: "One absent signature or receipt can send the whole thing back.",
      },
      {
        title: "Short-pays that slip through",
        body: "Without tracking, deductions are easy to miss and hard to dispute.",
      },
    ],
    featuresHeading: "Every step between delivery and deposit",
    features: [
      {
        title: "Invoices drafted from the load",
        body: "Rate, references and accessorials come straight from the record you approved.",
      },
      {
        title: "Packet completeness checks",
        body: "Spot missing PODs, pages and signatures before anything goes to a broker.",
      },
      {
        title: "Factoring tracking",
        body: "Generate the document packet and follow its status through your factor.",
      },
      {
        title: "AR aging and overdue alerts",
        body: "See what's outstanding, what's late, and when to expect payment.",
      },
      {
        title: "Broker payment history",
        body: "Log short-pays and deductions, and see how each broker has paid you.",
      },
      {
        title: "Email intake and QuickBooks",
        body: "Bring in broker emails automatically and keep your books in sync.",
        later: true,
      },
    ],
    callout: {
      heading: "Nothing goes out without you",
      body: "OfficeTruck can prepare the packet, but its AI won't send an invoice, change an agreed rate or make a payment on its own.",
    },
    faq: [
      {
        question: "Does it work if I use a factoring company?",
        answer:
          "Yes, that's planned from the financial operations stage: packet generation plus status tracking for each submission.",
      },
      {
        question: "Can I add detention and lumper charges?",
        answer:
          "Yes. Accessorials are part of invoice generation, with the supporting documents attached to the load.",
      },
      {
        question: "What if the AI reads a document wrong?",
        answer:
          "Extracted details are reviewed by a person before they're used, and each value links back to its source document.",
      },
    ],
  },
  {
    slug: "compliance",
    name: "Compliance",
    summary: "Renewals and driver files in order before anyone asks.",
    metaTitle: "Trucking Compliance Management | OfficeTruck",
    metaDescription:
      "Track driver, truck and company renewals, organize audit-ready files, and keep a clear history of completed compliance work.",
    eyebrow: "Trucking compliance",
    headline: "Know your files are in order before anyone asks.",
    lead: "Track every driver, truck and company deadline in one place, and keep the proof that the work got done.",
    example: {
      title: "Compliance calendar",
      rows: [
        {
          label: "Medical card",
          detail: "Driver: Truck 102",
          value: "14 days",
          tone: "warn",
        },
        { label: "Annual inspection", detail: "Truck 104", value: "31 days" },
        {
          label: "Insurance certificate",
          detail: "Company",
          value: "Current",
          tone: "good",
        },
        {
          label: "CDL copy",
          detail: "Driver: Truck 101",
          value: "Current",
          tone: "good",
        },
      ],
      totals: [
        { label: "Due soon", value: "2" },
        { label: "Current", value: "18" },
        { label: "Overdue", value: "0" },
      ],
    },
    painsHeading: "A reminder isn't the same as being ready.",
    pains: [
      {
        title: "Deadlines tracked in three different places",
        body: "Calendars, spreadsheets and sticky notes rarely agree with each other.",
      },
      {
        title: "Driver files scattered across folders",
        body: "Finding one current document turns into an afternoon of digging.",
      },
      {
        title: "No record of what got done",
        body: "Finishing a task helps less if you can't show when it happened.",
      },
    ],
    featuresHeading: "Compliance work, organized",
    features: [
      {
        title: "Driver, truck and company tasks",
        body: "Assign recurring tasks and renewals to the right person.",
      },
      {
        title: "Expiration alerts",
        body: "See what's coming due early enough to deal with it calmly.",
      },
      {
        title: "Audit-ready files",
        body: "Keep each document with the driver, truck or company it belongs to.",
      },
      {
        title: "Completion history",
        body: "Keep a record of what was done, by whom and when.",
      },
      {
        title: "IFTA support",
        body: "Keep the fleet records you need for your IFTA reporting together, on fleet plans.",
      },
      {
        title: "Rules with sources",
        body: "Requirements are versioned with effective dates and sources, so you can see where they came from.",
      },
    ],
    callout: {
      heading: "Organized, not legal advice",
      body: "OfficeTruck keeps your compliance work on track, but it doesn't replace legal or regulatory advice. You're still responsible for meeting the rules that apply to your operation.",
    },
    faq: [
      {
        question: "Does OfficeTruck guarantee I'll pass an audit?",
        answer:
          "No. It helps you keep tasks and documents organized, but it can't guarantee an audit outcome.",
      },
      {
        question: "What happens when regulations change?",
        answer:
          "Rules are tracked with effective dates and sources, and reviewed as they change. Always confirm requirements with the official source.",
      },
      {
        question: "Can drivers upload their own documents?",
        answer:
          "Document uploads are built into the driver app, and each file stays linked to the driver or truck it belongs to.",
      },
    ],
  },
  {
    slug: "profitability",
    name: "Profitability",
    summary: "Real profit by load, truck, driver, broker and lane.",
    metaTitle: "Trucking Profitability and Cost Per Mile | OfficeTruck",
    metaDescription:
      "See revenue per mile, cost per mile, deadhead and profit by load, truck, driver, broker and lane, with your real operating costs counted.",
    eyebrow: "Trucking profitability",
    headline: "Revenue is easy to see. Profit is what you keep.",
    lead: "See which loads, trucks, brokers and lanes make you money once fuel, driver pay, deadhead and every other cost is counted.",
    example: {
      title: "Profit per mile by truck",
      rows: [
        {
          label: "Truck 101",
          detail: "$3.10 revenue, $2.00 cost",
          value: "+$1.10",
          tone: "good",
        },
        {
          label: "Truck 102",
          detail: "$2.85 revenue, $2.41 cost",
          value: "+$0.44",
          tone: "good",
        },
        {
          label: "Truck 103",
          detail: "$2.20 revenue, $2.38 cost",
          value: "-$0.18",
          tone: "bad",
        },
      ],
      totals: [
        { label: "Revenue/mi", value: "$2.72" },
        { label: "Cost/mi", value: "$2.26" },
        { label: "Deadhead", value: "11%" },
      ],
    },
    painsHeading: "A busy month can still lose money.",
    pains: [
      {
        title: "Reports that stop at revenue",
        body: "Gross numbers can't tell you which work is worth taking again.",
      },
      {
        title: "A cost per mile that's really a guess",
        body: "When costs sit in separate places, the number is out of date before you use it.",
      },
      {
        title: "Losing lanes hiding behind good ones",
        body: "One strong run can cover for a truck or broker that's costing you.",
      },
    ],
    featuresHeading: "Numbers you can make decisions with",
    features: [
      {
        title: "Profit on every load",
        body: "See contribution per load once its revenue and allocated costs are in.",
      },
      {
        title: "Every way you need to slice it",
        body: "Compare trucks, drivers, brokers, customers, lanes and time periods.",
      },
      {
        title: "The costs that actually count",
        body: "Fuel, driver pay, tolls, deadhead, and maintenance and insurance allocations.",
      },
      {
        title: "Revenue and cost per mile",
        body: "Track RPM, CPM and deadhead percentage side by side.",
      },
      {
        title: "Plain-language answers",
        body: "Ask which lanes lost money last month and follow the answer back to the records.",
        later: true,
      },
      {
        title: "What-if on new loads",
        body: "Test a proposed load against your real numbers, once there's enough history to trust them.",
        later: true,
      },
    ],
    callout: {
      heading: "Every number traces back to a load",
      body: "Profit is calculated from your own loads and recorded costs, so you can see what's behind each figure. The more complete your records are, the more you can rely on it.",
    },
    faq: [
      {
        question: "Where does the cost data come from?",
        answer:
          "From what you and your drivers record: load expenses, driver pay, and your allocations for items like maintenance and insurance.",
      },
      {
        question: "Does this replace my accountant?",
        answer:
          "No. It's built for operating decisions. A QuickBooks connection is planned so your books and operations can stay aligned.",
      },
      {
        question: "How soon will the numbers be useful?",
        answer:
          "Load profit is available as soon as a load's revenue and costs are recorded. Trends get more reliable as your history builds.",
      },
    ],
  },
]
