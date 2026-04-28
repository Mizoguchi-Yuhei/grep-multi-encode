export interface MatchItem {
  line: number;
  preview: string;
  encoding: string;
}

export interface FileResultItem {
  filePath: string;
  relativePath: string;
  encoding: string;
  matches: MatchItem[];
}

export interface SearchStats {
  scannedFiles: number;
  matchedFiles: number;
  totalMatches: number;
  skippedBinaryFiles: number;
  skippedLargeFiles: number;
  skippedExcludedPaths: number;
  skippedIncludeFilter: number;
  erroredFiles: number;
}

export function createEmptySearchStats(): SearchStats {
  return {
    scannedFiles: 0,
    matchedFiles: 0,
    totalMatches: 0,
    skippedBinaryFiles: 0,
    skippedLargeFiles: 0,
    skippedExcludedPaths: 0,
    skippedIncludeFilter: 0,
    erroredFiles: 0
  };
}
