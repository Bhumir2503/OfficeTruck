import { z } from "zod"

/*
 * Input checks for the DQ file endpoints. Every endpoint parses its input
 * with one of these before doing anything. Keep them in step with the checks
 * on the dq_* tables.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date, "YYYY-MM-DD". */
export const dateString = z
  .string()
  .regex(DATE, "Enter a date as YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    )
  }, "Enter a real date.")

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`)

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z
      .string()
      .trim()
      .max(max, `${label} must be ${max} characters or fewer.`)
      .nullable()
      .default(null)
  )

export const uuid = z.uuid("That isn't a valid id.")

export const DQ_FILE_TYPES = ["dq", "investigation", "drug_alcohol"] as const
export const dqFileTypeSchema = z.enum(DQ_FILE_TYPES, "Choose a file.")

export const DQ_FILE_LABELS: Record<(typeof DQ_FILE_TYPES)[number], string> = {
  dq: "Driver qualification file",
  investigation: "Investigation history file",
  drug_alcohol: "Drug and alcohol file",
}

// ------------------------------------------------------------- Uploads --

/** What can be uploaded to an item. HEIC photos are converted first. */
export const DQ_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const
export const DQ_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const uploadSchema = z.object({
  file_name: text(1, 200, "The file name"),
  content_type: z.enum(DQ_UPLOAD_TYPES, "Upload a photo or a PDF."),
  size_bytes: z
    .number()
    .int()
    .min(1, "The file is empty.")
    .max(DQ_MAX_UPLOAD_BYTES, "Files can be up to 10 MB."),
})

// -------------------------------------------------------- Confirmation --

export const QUERY_RESULTS = ["no_record", "record_found"] as const

/**
 * Confirming (or correcting) a document's details. What the AI read is only
 * a suggestion; these are the values a person accepts.
 */
export const confirmDocumentSchema = z
  .object({
    issue_date: dateString,
    expiry_date: dateString.nullable().default(null),
    query_result: z
      .enum(QUERY_RESULTS, "Choose what the query showed.")
      .nullable()
      .default(null),
  })
  .refine(
    (value) => !value.expiry_date || value.expiry_date >= value.issue_date,
    {
      message: "The expiry date can't be before the issue date.",
      path: ["expiry_date"],
    }
  )

// ------------------------------------------------------------ Signing --

/** A person tapping to sign: their typed name, and that they mean it. */
const signature = {
  signer_name: text(1, 120, "Your name"),
  agree: z.literal(true, "Tick the box to sign."),
}

export const annualReviewSignSchema = z.object(signature)

export const registrySignSchema = z.object({
  ...signature,
  examiner_name: text(1, 120, "The examiner's name"),
  registry_number: z
    .string()
    .trim()
    .regex(/^\d{4,12}$/, "Enter the examiner's registry number, digits only."),
  verified_on: dateString,
})

export const applicationSignSchema = z.object(signature)

// ------------------------------------------------ Employment application --

const US_STATE = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use the 2-letter state code.")

const address = z.object({
  street: text(1, 200, "The street"),
  city: text(1, 100, "The city"),
  state: US_STATE,
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code."),
  from: dateString,
  to: dateString.nullable().default(null),
})

const license = z.object({
  state: US_STATE,
  number: text(1, 30, "The license number"),
  class: text(1, 10, "The license class"),
  endorsements: optionalText(50, "Endorsements"),
  expires_on: dateString,
})

const experience = z.object({
  equipment: text(1, 100, "The equipment"),
  from: dateString,
  to: dateString.nullable().default(null),
  approximate_miles: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .nullable()
    .default(null),
})

const accident = z.object({
  date: dateString,
  nature: text(1, 300, "What happened"),
  fatalities: z.number().int().min(0).max(100),
  injuries: z.number().int().min(0).max(100),
})

const conviction = z.object({
  date: dateString,
  location: text(1, 200, "Where"),
  charge: text(1, 200, "The charge"),
  penalty: text(1, 200, "The penalty"),
})

const employer = z.object({
  name: text(1, 200, "The employer's name"),
  address: text(1, 300, "The employer's address"),
  phone: optionalText(30, "The phone number"),
  position: text(1, 100, "The position"),
  from: dateString,
  to: dateString.nullable().default(null),
  reason_for_leaving: text(1, 300, "The reason for leaving"),
  subject_to_fmcsrs: z.boolean(),
  safety_sensitive_testing: z.boolean(),
})

/**
 * The application's answers (391.21), apart from the SSN and date of birth,
 * which are sent separately and encrypted before saving.
 */
export const applicationAnswersSchema = z.object({
  full_name: text(1, 120, "Your full name"),
  phone: optionalText(30, "Your phone number"),
  addresses: z
    .array(address)
    .min(1, "Add where you've lived for the past 3 years.")
    .max(20),
  licenses: z.array(license).min(1, "Add your driver's license.").max(10),
  license_denied_or_suspended: z.boolean(),
  license_denial_explanation: optionalText(1000, "The explanation"),
  experience: z.array(experience).max(20),
  accidents: z.array(accident).max(20),
  convictions: z.array(conviction).max(20),
  employers: z.array(employer).max(30),
  employment_gaps: optionalText(1000, "The explanation of gaps"),
})
export type ApplicationAnswers = z.infer<typeof applicationAnswersSchema>

/** A save of the application: the answers, and the two sensitive fields. */
export const applicationDraftSchema = z.object({
  answers: applicationAnswersSchema,
  ssn: z.string().trim().max(20).nullable().default(null),
  date_of_birth: dateString.nullable().default(null),
})

// ----------------------------------------------- Not applicable, end date --

export const notApplicableSchema = z.object({
  reason: text(3, 500, "The reason"),
})

export const endDateSchema = z.object({ end_date: dateString })

// ------------------------------------------------ Previous-employer log --

export const EMPLOYER_CHECK_METHODS = [
  "phone",
  "email",
  "fax",
  "mail",
  "in_person",
  "other",
] as const

export const EMPLOYER_CHECK_OUTCOMES = [
  "response_received",
  "no_response",
  "declined",
  "no_record_of_driver",
  "attempt_failed",
] as const

/** A contact with a previous employer, failed attempts included. */
const employerContactSchema = z.object({
  outcome: z.enum(EMPLOYER_CHECK_OUTCOMES, "Choose what happened."),
  employer_name: text(1, 200, "The employer's name"),
  employer_address: optionalText(500, "The address"),
  contacted_at: z.iso.datetime({
    offset: true,
    message: "Enter when you contacted them.",
  }),
  method: z.enum(EMPLOYER_CHECK_METHODS, "Choose how you contacted them."),
  response_summary: optionalText(5000, "What they said"),
  response_document_id: uuid.nullable().default(null),
})

/** The driver had no DOT-regulated employer in the past 3 years. */
export const NO_PREVIOUS_EMPLOYERS = "no_previous_employers"

const noPreviousEmployersSchema = z.object({
  outcome: z.literal(NO_PREVIOUS_EMPLOYERS),
  // How it was confirmed, e.g. "New CDL holder; see the application."
  response_summary: optionalText(500, "The note"),
})

export const employerCheckSchema = z.discriminatedUnion(
  "outcome",
  [employerContactSchema, noPreviousEmployersSchema],
  "Choose what happened."
)

/** The first issue's message, for an endpoint's error response. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the details and try again."
}

// ------------------------------------------------------- Driver facts --

export const LICENSE_CLASSES = ["cdl", "clp", "non_cdl"] as const
/**
 * "(405) 555-0118", "405-555-0118" or "+14055550118" → "+14055550118".
 * US numbers only, or any number already written with its + country code.
 */
export function toE164(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.startsWith("+") && !trimmed.startsWith("+1")) {
    const digits = trimmed.slice(1).replace(/\D/g, "")
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
  }
  let digits = trimmed.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1)
  return /^[2-9]\d{9}$/.test(digits) ? `+1${digits}` : null
}

// ---------------------------------------------------------- Voiding --

export const voidSignatureSchema = z.object({
  reason: text(3, 500, "The reason"),
})
