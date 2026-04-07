# Grep Multi Encode

Grep Multi Encode は、複数エンコードが混在するファイル群を一度に検索するための VS Code / Cursor 拡張機能です。  
UTF-8 だけでなく、Shift_JIS や EUC-JP などのレガシー日本語エンコードを含むリポジトリ向けに設計しています。

## 主な機能

- 複数エンコードを順番に試行して検索
  - `utf8`
  - `shift_jis`
  - `cp932` / `windows-31j`
  - `euc-jp`
  - （任意）`utf16le`, `utf16be`, `latin1`, `windows-1252`, `gb18030`, `gbk`, `big5`, `euc-kr`
- 除外設定
  - 拡張設定（`excludeGlobs`, `excludeExtensions`, `excludeFileNames`）
  - `.gitignore` の反映
  - Searchビューでの一時除外パターン入力（検索ごと）
- サイドバー UI
  - 検索フォーム
  - ステータス / メトリクス表示
  - ファイル単位の結果ツリー表示
  - 一致行をクリックして該当ファイル・行へジャンプ
  - **結果ツリーでファイル行を右クリック**し、絶対パス / ワークスペース相対パスのコピー、エクスプローラー・Finder での表示が可能
- パフォーマンス制御
  - 最大対象ファイル数
  - 最大マッチ数
  - 最大ファイルサイズ
  - 並列数（concurrency）

## 動作要件

- VS Code API `^1.90.0` 相当のホスト
  - Cursor（該当 API ベース版）を含む

## 使い方

1. 検索対象のワークスペース / フォルダを開く
2. Activity Bar から `Grep Multi Encode` を開く
3. `Search Query` に検索語を入力
4. （任意）一時除外グロブをカンマ区切りで入力  
   例: `**/*.min.js, **/vendor/**`
5. `Search` を実行（または `Enter`）
6. `RESULTS` ツリーで **一致行** をクリックし、該当行へジャンプ
7. （任意）`RESULTS` ツリーで **ファイル行**（ファイル名の行）を右クリックし、パスをコピーしたり OS のファイルマネージャで開く（下記）

### 結果ツリーでの右クリック（ファイル行）

ファイル名の行（一致行の親）に対して、コンテキストメニューから次が使えます。

| 操作 | 内容 |
|------|------|
| **絶対パスをコピー** | ファイルのフルパスをクリップボードへ |
| **相対パスをコピー** | そのファイルを含む**ワークスペースフォルダ**からの相対パス（マルチルートでは該当ルートが基準。区切りは `/`） |
| **エクスプローラー / Finder で表示** | OS のファイルマネージャで該当ファイルを表示 |

ワークスペースに含まれないパスの場合、相対パスは警告のうえコピーしません。

## コマンド（コマンドパレット）

上記のコピー・表示は、コマンドパレットからも実行できます（結果ツリーでファイル行を選んだ状態で実行する想定）。

- `Grep Multi Encode: Search in Workspace`
- `Grep Multi Encode: Cancel Search`
- `Grep Multi Encode: Clear Results`
- `Grep Multi Encode: Focus Search View`（サイドバーの Grep Multi Encode を開く）
- `Grep Multi Encode: Open Settings`（表示言語が日本語のときは「設定を開く」と表示されます）
- `Grep Multi Encode: Copy Absolute Path`
- `Grep Multi Encode: Copy Relative Path`
- `Grep Multi Encode: Reveal in File Explorer / Finder`

## 設定項目

設定キーはすべて `multiEncodeSearch.*` 配下です。

### 基本設定

- `enabledEncodings`: ファイルごとに試すエンコード順
- `excludeGlobs`: 除外グロブ
- `excludeExtensions`: 除外拡張子
- `excludeFileNames`: 除外ファイル名 / パターン
- `useGitIgnore`: `.gitignore` を反映するか
- `caseSensitive`: 大文字小文字を区別するか
- `followSymlinks`: シンボリックリンクを辿るか

### 上限系設定

- `maxInitialMatchedFiles`
- `maxMatchesPerFile`
- `maxTotalMatches`
- `maxFileSizeBytes`
- `concurrency`

## メトリクス表示

Search ビューでは次のメトリクスを表示します。

- `ヒット`: 一致行の総数と一致ファイル数
- `スキップ`: スキップされたファイル数（必要に応じて内訳）
- `Scanned`: 走査したファイル数（Results 側メトリクスにも表示）
- `経過`: 検索に要した時間

## 既知の制約

- `ISO-2022-JP` は現状未対応です（`iconv-lite` の対応状況に依存）。
- 同一バイト列が複数エンコードで解釈可能な場合、まれに意図しない一致が発生することがあります。
- バイナリ判定・文字化け判定はヒューリスティックのため、境界ケースでは取りこぼしや誤検知が起こる可能性があります。
