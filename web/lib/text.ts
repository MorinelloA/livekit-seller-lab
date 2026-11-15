/** Text that must stay on one line: any run of line breaks (and the spaces around it) becomes one space. */
export function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ');
}

/**
 * Splits text around each "LiveKit", so a label set in capitals can keep the
 * name in its own case: LiveKit's brand guide never writes it "LIVEKIT".
 * The odd-numbered parts are the name.
 */
export function splitBrand(text: string): string[] {
  return text.split(/(LiveKit)/);
}
