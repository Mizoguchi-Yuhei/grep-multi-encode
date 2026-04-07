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
  - Click a match line to open the file and jump to that line
  - **Right-click a file row** in Results to copy absolute path, copy workspace-relative path, or reveal in Explorer / Finder
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
6. In the `RESULTS` tree, click a **match line** to jump to that line in the file.
7. (Optional) **Right-click the file row** (the parent row with the file name) to copy paths or reveal in the OS file manager (see below).

### Results tree: context menu (file row)

On the file name row (parent of match lines), the context menu offers:

| Action | What it does |
|--------|----------------|
| **Copy Absolute Path** | Copies the full file path to the clipboard |
| **Copy Relative Path** | Copies the path relative to the **workspace folder that contains the file** (in multi-root workspaces, that folder is the root; path separators are normalized to `/`) |
| **Reveal in File Explorer / Finder** | Opens the OS file manager at that file |

If the file is not under any workspace folder, **Copy Relative Path** shows a warning and does not copy.

## Commands (Command Palette)

The copy / reveal actions are also available from the Command Palette (typically with a file row focused in Results).

- `Grep Multi Encode: Search in Workspace`
- `Grep Multi Encode: Cancel Search`
- `Grep Multi Encode: Clear Results`
- `Grep Multi Encode: Focus Search View` (opens the Grep Multi Encode sidebar)
- `Grep Multi Encode: Open Settings`
- `Grep Multi Encode: Copy Absolute Path`
- `Grep Multi Encode: Copy Relative Path`
- `Grep Multi Encode: Reveal in File Explorer / Finder`

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
