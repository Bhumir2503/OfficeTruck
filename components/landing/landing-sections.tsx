import {
  ArrowRightIcon,
  BellRingIcon,
  CheckIcon,
  HandCoinsIcon,
  MessageSquareTextIcon,
  SmartphoneIcon,
} from "lucide-react"
import Link from "next/link"

import { LoadSheet } from "@/components/landing/load-sheet"
import { buttonVariants } from "@/components/ui/button"
import { solutions } from "@/lib/solutions"
import { cn } from "@/lib/utils"

export const container = "mx-auto w-full max-w-6xl px-6"
export const deepPanel = "bg-[color-mix(in_oklch,var(--primary)_58%,black)]"
const amberButton =
  "h-11 bg-[#f4b740] px-5 text-neutral-950 hover:bg-[#f4b740]/85"

const pains = [
  {
    title: "The same load, typed three times",
    body: "Rate con to spreadsheet, spreadsheet to invoice, invoice to accounting.",
  },
  {
    title: "Money held up by missing paper",
    body: "One lost POD can stall an invoice while nobody notices it's overdue.",
  },
  {
    title: "Compliance living in folders and memory",
    body: "A reminder helps. Knowing your files are in order helps more.",
  },
  {
    title: "Revenue that says nothing about profit",
    body: "A good month on paper can hide a lane or a truck that's losing money.",
  },
]

const steps = [
  {
    title: "Drop in the rate con",
    body: "Upload it or forward the email. Broker, rate, reference and stops are pulled out for you.",
  },
  {
    title: "Review and approve",
    body: "Nothing becomes a load until someone on your team has checked it.",
  },
  {
    title: "Assign the run",
    body: "Pick the driver, truck and trailer. The load lands on the driver's phone.",
  },
  {
    title: "Capture paperwork",
    body: "Drivers photograph BOLs, PODs, fuel and lumper receipts, even with no signal.",
  },
  {
    title: "Send the invoice",
    body: "The packet is checked for missing pages, then drafted for you to send or factor.",
  },
  {
    title: "Get paid, see profit",
    body: "Payments, deductions and short-pays are logged against the load.",
  },
]

const documents = [
  { file: "ratecon_2041.pdf", type: "Rate confirmation", flag: false },
  { file: "IMG_0412.jpg", type: "POD", flag: false },
  { file: "IMG_0413.jpg", type: "Lumper receipt", flag: false },
  { file: "scan_0098.pdf", type: "Missing signature", flag: true },
]

const lanes = [
  { lane: "Memphis to Dallas", value: 1.1 },
  { lane: "Nashville to Chicago", value: 0.86 },
  { lane: "Atlanta to Miami", value: 0.41 },
  { lane: "Dallas to Memphis", value: -0.18 },
]

const smallFeatures = [
  {
    icon: HandCoinsIcon,
    title: "Know when the money is coming",
    body: "See what's ready to invoice, what's aging, which brokers pay slowly, and every short-pay or deduction.",
  },
  {
    icon: BellRingIcon,
    title: "Stay ahead of compliance",
    body: "Track driver, truck and company renewals, keep audit-ready files, and keep a history of what was done and when.",
  },
  {
    icon: SmartphoneIcon,
    title: "An app drivers will actually use",
    body: "Assigned loads, stop details and camera-first uploads that sync when the signal comes back.",
  },
]

const guarantees = [
  "Change an agreed freight rate",
  "Approve an expense",
  "Send an invoice",
  "Make a payment",
]

const roadmap = [
  {
    stage: "First",
    title: "Back office",
    items: [
      "Loads, drivers and trucks",
      "Rate con extraction",
      "Documents and invoice drafts",
      "Expenses and compliance calendar",
      "Driver app uploads and status",
    ],
  },
  {
    stage: "Next",
    title: "Financial operations",
    items: [
      "Invoice submission and factoring tracking",
      "Payments and AR aging",
      "Broker profiles",
      "Load profitability",
      "Mileage estimates and navigation links",
    ],
  },
  {
    stage: "Then",
    title: "Automation and visibility",
    items: [
      "Email intake and missing-POD alerts",
      "Settlements and maintenance",
      "QuickBooks",
      "ELD integrations and GPS map",
      "ETA alerts",
    ],
  },
  {
    stage: "Later",
    title: "Full TMS",
    items: [
      "Advanced dispatch",
      "Multi-stop route optimization",
      "Geofencing",
      "Customer portals",
      "API and webhooks",
    ],
  },
]

const plans = [
  {
    name: "Solo",
    price: "$39",
    unit: "per month",
    note: "For one truck",
    features: [
      "Loads, documents and invoicing",
      "Expenses",
      "Compliance reminders",
      "Driver app",
    ],
  },
  {
    name: "Fleet Basic",
    price: "$25",
    unit: "per active truck / month",
    note: "$70 monthly minimum",
    features: [
      "Core fleet back office",
      "Multiple users",
      "Dispatch basics",
      "IFTA support and standard reports",
    ],
  },
  {
    name: "Fleet Plus",
    price: "$35",
    unit: "per active truck / month",
    note: "$99 monthly minimum",
    features: [
      "Everything in Fleet Basic",
      "Advanced automation and analytics",
      "Integrations and permissions",
      "Priority support",
    ],
  },
]

const questions = [
  {
    question: "Do I need new hardware?",
    answer:
      "No. GPS visibility is planned through the ELD and telematics providers carriers already use, and it will always show when a location was last updated.",
  },
  {
    question: "What happens when a driver has no signal?",
    answer:
      "Drivers can keep capturing documents offline. Everything syncs once they're back in coverage.",
  },
  {
    question: "Will OfficeTruck keep me compliant?",
    answer:
      "It keeps your tasks, renewals and files organized. It isn't legal advice, and you're still responsible for meeting the rules that apply to you.",
  },
  {
    question: "What counts as an active truck?",
    answer:
      "Fleet plans bill for trucks you're running. Archived equipment isn't billed.",
  },
]

export function GetStarted({ className }: { className?: string }) {
  return (
    <Link
      href="/signup"
      className={cn(buttonVariants({ size: "lg" }), amberButton, className)}
    >
      Join the pilot
      <ArrowRightIcon data-icon="inline-end" />
    </Link>
  )
}

export function Hero() {
  return (
    <section className="px-3 sm:px-4">
      <div
        className={cn(
          "mx-auto max-w-[1400px] overflow-hidden rounded-3xl text-primary-foreground",
          deepPanel
        )}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 sm:py-20 lg:grid-cols-[1.1fr_minmax(0,0.9fr)] lg:py-24">
          <div>
            <p className="text-sm font-medium text-[#f4b740]">
              Now recruiting pilot carriers
            </p>
            <h1 className="mt-4 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              Your trucking business.
              <br />
              One office.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-pretty text-primary-foreground/80">
              Loads, drivers, paperwork, invoices and cash flow in one connected
              place, built for owner-operators and fleets of 1 to 20 trucks.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <GetStarted />
              <a
                href="#how-it-works"
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                See how it works
              </a>
            </div>
          </div>
          <div className="duration-700 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6">
            <LoadSheet />
          </div>
        </div>
      </div>
    </section>
  )
}

export function Problem() {
  return (
    <section className={cn(container, "py-20 sm:py-28")}>
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          The load is delivered. The paperwork isn&apos;t.
        </h2>
        <ul className="divide-y border-y">
          {pains.map((pain) => (
            <li key={pain.title} className="py-5">
              <h3 className="font-medium">{pain.title}</h3>
              <p className="mt-1 text-muted-foreground">{pain.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-6 bg-muted py-20 sm:py-28">
      <div className={container}>
        <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          One load record, from rate con to paid
        </h2>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Every document, status and dollar stays attached to the load, so
          nothing has to be entered twice.
        </p>
        <ol className="mt-14 grid gap-8 lg:grid-cols-6 lg:gap-5">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="group relative pl-12 lg:pt-12 lg:pl-0"
            >
              <span
                aria-hidden
                className="absolute top-9 -bottom-8 left-[15px] border-l-2 border-dashed border-primary/40 group-last:hidden lg:top-[15px] lg:right-[-1.25rem] lg:bottom-auto lg:left-10 lg:border-t-2 lg:border-l-0"
              />
              <span
                aria-hidden
                className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full bg-primary font-mono text-sm font-medium text-primary-foreground"
              >
                {index + 1}
              </span>
              <h3 className="font-medium">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function DocumentsCard() {
  return (
    <div className="rounded-2xl border p-6 sm:p-8 lg:col-span-3">
      <h3 className="text-2xl font-semibold tracking-tight">
        Paperwork that files itself
      </h3>
      <p className="mt-2 text-muted-foreground">
        Rate cons, BOLs, PODs and receipts are sorted and matched to the right
        load. Missing signatures and pages get flagged before the invoice does.
      </p>
      <ul className="mt-6 divide-y rounded-xl border font-mono text-xs sm:text-sm">
        {documents.map((document) => (
          <li
            key={document.file}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <span className="truncate text-muted-foreground">
              {document.file}
            </span>
            <span
              className={cn(
                "shrink-0",
                document.flag &&
                  "rounded bg-[#f4b740] px-1.5 py-0.5 text-neutral-950"
              )}
            >
              {document.type}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfitCard() {
  const max = Math.max(...lanes.map((lane) => Math.abs(lane.value)))

  return (
    <div className="rounded-2xl border p-6 sm:p-8 lg:col-span-3">
      <h3 className="text-2xl font-semibold tracking-tight">
        See what actually made money
      </h3>
      <p className="mt-2 text-muted-foreground">
        Profit by load, truck, driver, broker and lane, with fuel, driver pay,
        tolls, deadhead and other costs counted.
      </p>
      <div className="mt-6">
        <p className="text-xs text-muted-foreground">
          Example lanes, profit per mile
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {lanes.map((lane) => (
            <li key={lane.lane} className="text-sm">
              <div className="flex justify-between gap-4">
                <span>{lane.lane}</span>
                <span
                  className={cn(
                    "font-mono",
                    lane.value < 0 && "text-destructive"
                  )}
                >
                  {lane.value < 0 ? "-" : ""}${Math.abs(lane.value).toFixed(2)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    lane.value < 0 ? "bg-destructive" : "bg-primary"
                  )}
                  style={{ width: `${(Math.abs(lane.value) / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function Features() {
  return (
    <section
      id="features"
      className={cn(container, "scroll-mt-6 py-20 sm:py-28")}
    >
      <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Everything the office does, connected
      </h2>
      <div className="mt-12 grid gap-4 lg:grid-cols-6">
        <DocumentsCard />
        <ProfitCard />
        {smallFeatures.map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border p-6 lg:col-span-2"
          >
            <feature.icon className="size-5 text-primary" />
            <h3 className="mt-4 font-medium">{feature.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
        <div className="flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center lg:col-span-6">
          <MessageSquareTextIcon className="size-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-medium">Ask your business a plain question</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              &ldquo;Which loads are missing PODs?&rdquo; &ldquo;Which lanes
              lost money last month?&rdquo; Answers link back to the records
              behind them.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Control() {
  return (
    <section className="px-3 sm:px-4">
      <div
        className={cn(
          "mx-auto max-w-[1400px] rounded-3xl text-primary-foreground",
          deepPanel
        )}
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              AI does the typing. You make the calls.
            </h2>
            <p className="mt-4 max-w-md text-lg text-primary-foreground/80">
              Every extracted value links back to its source document, and every
              change is kept in an audit trail.
            </p>
          </div>
          <div>
            <p className="font-medium text-[#f4b740]">
              OfficeTruck&apos;s AI will never, on its own:
            </p>
            <ul className="mt-2 divide-y divide-primary-foreground/20">
              {guarantees.map((guarantee) => (
                <li key={guarantee} className="py-4 text-xl font-medium">
                  {guarantee}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Roadmap() {
  return (
    <section
      id="roadmap"
      className={cn(container, "scroll-mt-6 py-20 sm:py-28")}
    >
      <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Starts in the back office. Built to run the whole operation.
      </h2>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        We&apos;re building this with pilot carriers, so the order may shift
        based on what they need most.
      </p>
      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {roadmap.map((phase, index) => (
          <li key={phase.stage} className="bg-background p-6">
            <p
              className={cn(
                "text-sm font-medium",
                index === 0 ? "text-primary" : "text-muted-foreground"
              )}
            >
              {phase.stage}
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              {phase.title}
            </h3>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
              {phase.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-6 bg-muted py-20 sm:py-28">
      <div className={container}>
        <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Pay for the trucks you run
        </h2>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Early pricing, which may change as we learn from pilot carriers.
          Archived equipment is never billed.
        </p>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col rounded-2xl bg-card p-6 text-card-foreground ring-1 ring-border sm:p-8"
            >
              <h3 className="font-medium">{plan.name}</h3>
              <p className="mt-4 text-5xl font-semibold tracking-tight">
                {plan.price}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{plan.unit}</p>
              <p className="text-sm text-muted-foreground">{plan.note}</p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 border-t pt-6 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "mt-8 h-11"
                )}
              >
                Join the pilot
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          For example, 10 active trucks would be $250 a month on Fleet Basic or
          $350 on Fleet Plus, before any taxes.
        </p>
      </div>
    </section>
  )
}

export function Solutions() {
  return (
    <section className={cn(container, "pt-20 sm:pt-28")}>
      <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Start with what hurts most
      </h2>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {solutions.map((solution) => (
          <li key={solution.slug} className="bg-background">
            <Link
              href={`/solutions/${solution.slug}`}
              className="group flex h-full flex-col p-6 transition-colors hover:bg-muted"
            >
              <span className="font-medium">{solution.name}</span>
              <span className="mt-1 flex-1 text-sm text-muted-foreground">
                {solution.summary}
              </span>
              <ArrowRightIcon className="mt-4 size-4 text-primary transition-transform group-hover:translate-x-1" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Faq({ items = questions }: { items?: typeof questions }) {
  return (
    <section className={cn(container, "py-20 sm:py-28")}>
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Straight answers
        </h2>
        <div className="divide-y border-y">
          {items.map((item) => (
            <details key={item.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden
                  className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-2 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="px-3 pb-3 sm:px-4 sm:pb-4">
      <div
        className={cn(
          "mx-auto max-w-[1400px] rounded-3xl px-6 py-16 text-center text-primary-foreground sm:py-24",
          deepPanel
        )}
      >
        <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Help build the office your trucks deserve
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-primary-foreground/80">
          We&apos;re looking for carriers with 1 to 20 trucks to run real loads
          with us.
        </p>
        <GetStarted className="mt-8" />
      </div>
    </section>
  )
}
