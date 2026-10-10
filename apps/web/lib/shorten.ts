/** The first and last characters of a long on-chain value, joined by an ellipsis. */
export function shorten(value: string, head = 14, tail = 8): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
