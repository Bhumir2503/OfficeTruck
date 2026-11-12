/**
 * Live formatting for a US dollar amount input: "2450.5" → "2,450.5" while
 * typing, then "2,450.50" when the field loses focus. Only digits and one
 * decimal point are kept, with at most 2 digits after it and `maxDigits`
 * before it (8 matches the rate column, up to $99,999,999.99).
 */

const MAX_DIGITS = 8

/** Keeps digits and the first ".", and trims to the allowed lengths. */
function clean(value: string, maxDigits: number) {
  const point = value.indexOf(".")
  const whole = (point === -1 ? value : value.slice(0, point))
    .replace(/\D/g, "")
    // No leading zeros, but keep a single 0 ("0.50").
    .replace(/^0+(?=\d)/, "")
    .slice(0, maxDigits)
  if (point === -1) {
    return whole
  }
  const cents = value
    .slice(point + 1)
    .replace(/\D/g, "")
    .slice(0, 2)
  return `${whole || "0"}.${cents}`
}

function group(clean: string) {
  const [whole, cents] = clean.split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return cents === undefined ? grouped : `${grouped}.${cents}`
}

/** Formats `value` and works out where a caret at `caret` should land afterwards. */
function formatWithCaret(value: string, caret: number, maxDigits: number) {
  const cleaned = clean(value, maxDigits)
  const formatted = group(cleaned)

  // Count the digits and point before the caret, then find the spot just
  // after as many of them in the result. Commas don't count.
  const kept = clean(value.slice(0, caret), maxDigits).length
  let position = 0
  for (let seen = 0; position < formatted.length && seen < kept; position++) {
    if (formatted[position] !== ",") seen++
  }
  return { value: formatted, caret: position }
}

/** "2450" or "2,450.5" → "2,450.50"; blank stays blank. */
export function formatCurrency(value: string, maxDigits = MAX_DIGITS) {
  const cleaned = clean(value, maxDigits)
  if (!cleaned) {
    return ""
  }
  const [whole, cents = ""] = cleaned.split(".")
  return group(`${whole || "0"}.${cents.padEnd(2, "0")}`)
}

/** Reformats a currency input in place as the user types, keeping the caret steady. */
export function handleCurrencyInput(
  event: React.ChangeEvent<HTMLInputElement>
) {
  const input = event.currentTarget
  const { value, caret } = formatWithCaret(
    input.value,
    input.selectionStart ?? input.value.length,
    MAX_DIGITS
  )
  if (value !== input.value) {
    input.value = value
    input.setSelectionRange(caret, caret)
  }
}

/** Pads to cents when the field loses focus: "2,450" → "2,450.00". */
export function handleCurrencyBlur(event: React.FocusEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const value = formatCurrency(input.value)
  // Cosmetic only: the schema accepts the unpadded value too.
  if (value !== input.value) {
    input.value = value
  }
}

/** Backspace right after a comma deletes the digit before it, not the comma. */
export function handleCurrencyKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>
) {
  const input = event.currentTarget
  if (
    event.key !== "Backspace" ||
    input.selectionStart !== input.selectionEnd
  ) {
    return
  }
  const caret = input.selectionStart ?? 0
  if (caret > 0 && input.value[caret - 1] === ",") {
    input.setSelectionRange(caret - 1, caret - 1)
  }
}
