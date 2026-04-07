# Grep Multi Encode

Grep Multi Encode is a VS Code / Cursor extension that searches text across mixed-encoding files in one pass.

It is designed for repositories that contain both modern UTF-8 text and legacy Japanese encodings.

## Features

- Search with multiple encodings in order:
  - `utf8`
  - `shift_jis`
  - `cp932` / `windows-31j`
  - `euc-jp`
  - optional: `utf16le`, `utf16be`, `latin1`, `windows-1252`, `gb18030`, `gbk`, `big5`, `euc-kr`
- Exclusion support:
  - extension settings (`excludeGlobs`, `excludeExtensions`, `excludeFileNames`)
  - `.gitignore` rules
  - temporary per-search exclude patterns in the Search view
- Dedicated sidebar UI:
  - Search form and status metrics
  - Tree results grouped by file
  - Click a match to open file and jump to line
- Performance guardrails:
  - max files, max matches, max file size, and concurrency controls

## Requirements

- VS Code `^1.90.0` compatible host (including Cursor builds based on this API level)

## How To Use

1. Open the workspace/folder you want to search.
2. Open the `Grep Multi Encode` view from Activity Bar.
3. Enter query text in `Search Query`.
4. (Optional) Enter temporary exclude globs as comma-separated patterns, for example:
   - `**/*.min.js, **/vendor/**`
5. Click `Search` (or press `Enter`).
6. Open results from the `RESULTS` tree and click a line item to jump.

## Commands

- `Grep Multi Encode: Search in Workspace`
- `Grep Multi Encode: Cancel Search`
- `Grep Multi Encode: Clear Results`

## Configuration

All settings are under `multiEncodeSearch.*`.

### Core settings

- `enabledEncodings`: ordered encodings to try per file
- `excludeGlobs`: glob patterns to skip
- `excludeExtensions`: file extensions to skip
- `excludeFileNames`: file names/patterns to skip
- `useGitIgnore`: respect `.gitignore`
- `caseSensitive`: case-sensitive matching
- `followSymlinks`: follow symlinks during discovery

### Limits

- `maxInitialMatchedFiles`
- `maxMatchesPerFile`
- `maxTotalMatches`
- `maxFileSizeBytes`
- `concurrency`

## Status Metrics

The Search view exposes lightweight metrics:

- `Hits`: total matched lines and matched files
- `Skipped`: total skipped files (with optional breakdown)
- `Scanned`: scanned file count (shown in English UI and in Results metrics)
- `Elapsed`: elapsed search time

## Known Limitations

- `ISO-2022-JP` is currently not supported (depends on `iconv-lite` support).
- In rare cases, the same byte sequence can be interpreted by multiple encodings and may produce unintended matches.
- Binary/corruption detection is heuristic-based, so borderline files may result in false positives or false negatives.
