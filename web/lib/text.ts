/** Text that must stay on one line: any run of line breaks (and the spaces around it) becomes one space. */
export function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ');
}

/**
 * A quote that ends a sentence inside its quotation marks: adds a full stop
 * unless it already ends with one, a question mark, an exclamation mark or an
 * ellipsis.
 */
export function asSentence(quote: string): string {
  const q = quote.trim();
  return /[.!?…]$/.test(q) ? q : `${q}.`;
}

/**
 * Splits text around each "LiveKit", so a label set in capitals can keep the
 * name in its own case: LiveKit's brand guide never writes it "LIVEKIT".
 * The odd-numbered parts are the name.
 */
export function splitBrand(text: string): string[] {
  return text.split(/(LiveKit)/);
}
