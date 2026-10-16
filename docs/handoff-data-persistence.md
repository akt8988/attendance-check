# 出欠アプリのローカル永続化と起動まわり（handoff）

## 概要
Windows（Surface 想定）向けの完全ローカル出欠管理ウェブアプリで、名簿・座席・出欠が再起動後に消える問題を修正した。原因は File System Access API による「データフォルダ」手動選択依存で、未選択や許可復元失敗時にデータが残らなかったこと。ローカルサーバーの `GET/PUT /api/data` で `data/attendance-data.json` へ自動保存する方式に切り替え、背面起動用 `AttendanceCheck.vbs` と停止用 `stop.bat` を追加した。日本語ファイル名は文字化け回避のため英語化した。配布物はデスクトップの `shutseki-kanri-YYYYMMDD` フォルダ／ZIP として出力済み。

## ゴール / 非ゴール
- ゴール:
  - `start.bat` / `AttendanceCheck.vbs` 起動後、名簿・座席・出欠入力・出欠修正が再起動後も残ること
  - 黒いコンソールを出さずに起動できること
  - 配布用ファイル名が英語のみであること
- 非ゴール（やらないと決めたこと）:
  - クラウド同期・外部 API・認証の導入
  - トレイ常駐アプリ化や Windows サービス化
  - 既存ユーザーの「データフォルダ」運用を強制廃止すること（任意の追加保存先として残している）

## 現状
- できたこと
  - サーバー側永続化 API（`/api/data`）を Go / PowerShell / Python に実装
  - フロント `js/storage.js` がサーバー保存を優先し、IndexedDB バックアップも併用
  - 出欠修正のプルダウン変更時も `saveData()` → 同上の保存経路
  - `AttendanceCheck.vbs`（背面起動）、`stop.bat`（停止）、英語ファイル名への統一
  - README / HOW_TO_START の手順更新
  - デスクトップへ配布パッケージ出力（例: `~/Desktop/shutseki-kanri-20260801(.zip)`）
- 未完了 / 途中のもの
  - リポジトリ内の古い `shutseki-kanri.zip` が最新内容と一致しているかは未確認（推測: 古い可能性が高い）
  - Git コミット／PR は未実施（ユーザー依頼なし）
- 既知の問題・制約
  - 利用中はサーバープロセスが必要（背面起動時はウィンドウが無いので `stop.bat` で止める）
  - `index.html` を `file://` で直接開くと保存 API が使えない
  - Chrome / Edge 前提
  - Python フォールバックは `server.py` 経由（素の `python -m http.server` ではない）
  - antivirus が `server.exe` / `.vbs` をブロックする可能性（既存 HOW_TO_START 記載）

## 重要な決定
| 決定 | 理由 | 代替案（あれば） |
|---|---|---|
| 永続化の主経路をローカルサーバー API（`data/attendance-data.json`）にする | バッチ起動の期待値と一致し、File System Access の許可復元問題を回避できる | IndexedDB のみ／フォルダ選択のみ |
| File System Access の「データフォルダ」は任意の追加保存先として残す | 既存 UI・運用を壊しすぎない | 完全削除してサーバーのみ |
| IndexedDB に payload バックアップも書く | サーバー API 一時不通時の保険 | サーバーのみ |
| 背面起動は `.vbs`（`AttendanceCheck.vbs`） | コンソール非表示が簡単。停止は `stop.bat` | `start /min`、トレイ常駐 |
| 日本語ファイル名を廃止し英語化 | Windows 環境で文字化けする報告があった | ローマ字ファイル名のみ残す |

## 変更・成果物
- 触った主なファイル / モジュール
  - `js/storage.js` … `init` / `save` / `ensureReady`、サーバー＋IDB＋任意フォルダ
  - `js/app.js` … boot で `Storage.init()`、`ensureFolder` がサーバー利用時も通過
  - `tools/localserve/main.go` … `GET/PUT /api/data`、`server.exe` 再ビルド元
  - `server.exe` … Windows 向けクロスコンパイル成果物
  - `server.ps1` / `server.py` / `start.sh` / `start.bat` … 同 API 対応
  - `AttendanceCheck.vbs` / `stop.bat` / `start-powershell.bat`
  - 削除: `背面で起動.vbs`, `起動.bat`, `start-silent.vbs`
  - `README.md`, `HOW_TO_START.txt`
- 追加・変更した機能や設定
  - API:
    - `GET /api/data` → `data/attendance-data.json` を返す
    - `PUT /api/data` → JSON（`version`, `courses` 配列必須）を同ファイルへ原子的に書き込み（tmp + rename）
  - 画面右上ステータス例: `保存先: data/attendance-data.json（自動）`
  - 起動エントリ:
    - 常用: `AttendanceCheck.vbs`
    - トラブル時: `start.bat`
    - 停止（背面時）: `stop.bat`
- コマンド、マイグレーション、外部サービス連携などがあれば
  - `server.exe` 再ビルド例:
    - `cd tools/localserve && GOOS=windows GOARCH=amd64 go build -o ../../server.exe .`
  - 外部サービス連携なし（127.0.0.1 のみ）
  - DB マイグレーションなし（JSON ファイル）

## 詰まった点と解決
- 症状 → 原因 → 対処（あれば）
  - 再起動で名簿・出欠が消える → 保存がフォルダ手動選択＋権限復元に依存／未選択時はメモリのみ → サーバーへ自動保存＋IDB バックアップ
  - （推測）次回起動時にフォルダ許可ダイアログが出ず空表示 → `requestPermission` がユーザー操作なしだと失敗しうる → サーバー主経路で回避
  - 日本語 `.vbs` 名が文字化け → 配布先の文字コード／展開環境の問題（推測含む） → `AttendanceCheck.vbs` 等へ英語化
  - コンソールを常時出したくない → `AttendanceCheck.vbs` で `WshShell.Run ..., 0, False`（非表示）＋ `stop.bat` で `taskkill /IM server.exe`

## 今後やること
- [ ] P0: 実機 Windows で `AttendanceCheck.vbs` → 名簿読込 → 出欠記録／修正 → `stop.bat` → 再起動でデータ残存を確認
- [ ] P1: 配布 ZIP を最新内容で作り直し、リポジトリ内の古い `shutseki-kanri.zip` を更新するか削除方針を決める
- [ ] P1: antivirus ブロック時の手順を現場向けに短縮した読み物があるか確認
- [ ] P2: 必要なら Git コミット（ユーザー依頼時のみ）
- [ ] P3: （任意）トレイ常駐やポート競合時の UI 改善

## 再開用メモ
このプロジェクトは完全ローカルの出欠ウェブアプリ。永続化はブラウザのフォルダ選択ではなく、ローカルサーバーの `GET/PUT /api/data` が `data/attendance-data.json` を読み書きする方式に変更済み。フロントは `js/storage.js` が起動時にサーバー／任意フォルダ／IndexedDB から復元し、名簿・座席・出欠記録・出欠修正はいずれも `saveData()` 経由で保存する。常用起動は `AttendanceCheck.vbs`（コンソール非表示）、停止は `stop.bat`。日本語ランチャー名は廃止済み。配布確認用にデスクトップへ `shutseki-kanri-YYYYMMDD` を出力した経緯あり。次作業は Windows 実機での保存往復確認と、配布 ZIP の最新化が主。
