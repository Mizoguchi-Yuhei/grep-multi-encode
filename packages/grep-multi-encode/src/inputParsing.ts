/**
 * Parses comma-separated glob/path segments from the search UI (include, exclude, roots).
 */
export function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}
