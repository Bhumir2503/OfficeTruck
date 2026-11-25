/**
 * Formats a US phone number as it's typed: "5551234567" → "(555) 123-4567".
 * A leading country code 1 is dropped and anything past 10 digits ignored.
 * Numbers starting with + (other than +1) are left alone, for international
 * numbers.
 */
export function formatPhone(value: string) {
  return formatWithCaret(value, value.length).value
}

function isInternational(value: string) {
  const trimmed = value.trimStart()
  return trimmed.startsWith("+") && !trimmed.startsWith("+1")
}

function layout(digits: string) {
  if (!digits) return ""
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/** Formats `value` and works out where a caret at `caret` should land afterwards. */
function formatWithCaret(value: string, caret: number) {
  if (isInternational(value)) {
    return { value, caret }
  }

  let digits = value.replace(/\D/g, "")
  let digitsBeforeCaret = value.slice(0, caret).replace(/\D/g, "").length

  // US area codes never start with 1, so a leading 1 is the country code.
  if (digits.startsWith("1")) {
    digits = digits.slice(1)
    digitsBeforeCaret = Math.max(0, digitsBeforeCaret - 1)
  }
  digits = digits.slice(0, 10)
  digitsBeforeCaret = Math.min(digitsBeforeCaret, digits.length)

  const formatted = layout(digits)

  // Put the caret just after the same number of digits as before.
  let position = 0
  for (
    let seen = 0;
    position < formatted.length && seen < digitsBeforeCaret;
    position++
  ) {
    if (/\d/.test(formatted[position])) seen++
  }
  // Skip past formatting that follows, e.g. ") " after the area code.
  if (digitsBeforeCaret === digits.length) position = formatted.length

  return { value: formatted, caret: position }
}

/** Reformats a phone input in place as the user types, keeping the caret steady. */
export function handlePhoneInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const { value, caret } = formatWithCaret(
    input.value,
    input.selectionStart ?? input.value.length
  )
  if (value !== input.value) {
    input.value = value
    input.setSelectionRange(caret, caret)
  }
}

/**
 * Backspace right after a bracket, space or dash deletes the digit before it,
 * rather than the formatting character (which formatting would just put back).
 */
export function handlePhoneKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>
) {
  const input = event.currentTarget
  if (
    event.key !== "Backspace" ||
    isInternational(input.value) ||
    input.selectionStart !== input.selectionEnd
  ) {
    return
  }
  let caret = input.selectionStart ?? 0
  while (caret > 0 && !/\d/.test(input.value[caret - 1])) caret--
  input.setSelectionRange(caret, caret)
}
