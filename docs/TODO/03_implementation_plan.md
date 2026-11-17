# TODOアプリ（V1）実装計画書 (`03_implementation_plan.md`)

## 0. 実装の基本方針と前提
* **根拠ドキュメント**: `01_requirements.md` および `02_design.md`
* **既存機能の保護**: 既存の `/` および `/api/db-check` のルーティング・挙動を一切壊さない。
* **ディレクトリ分離**: 新規実装は `src/apps/todo/`、`views/todo/`、`public/todo/` に集約し、既存の `index.ts` への変更は `todoRouter` の `import` とマウント登録の最小限に留める。
* **設計書（`02_design.md`）と要件定義書（`01_requirements.md`）の差分調整**:
  * APIベースURLは要件定義書準拠の `/api/v1/todos`、画面URLは `/todo` とする。
  * ステータスコードは要件定義書準拠（一覧・更新:`200`、登録:`201`、削除:`204`、形式不正:`400`、存在しないID:`404`、バリデーション違反:`422`、DBエラー:`500`/`503`）とする。

---

## 工程1: 現状確認と既存サーバーの正常稼働ベースライン確認
実装前に既存の `package.json`、`tsconfig.json`、`db.ts`、`index.ts` の仕様を確認し、既存ルートが正常に動作していることを担保する。

* **対象ファイル**:
  * `package.json`（scripts、依存ライブラリ `express`, `ejs`, `pg` 等）
  * `tsconfig.json`（`rootDir`, `outDir`, `moduleResolution` 等）
  * `src/db.ts`（または `db.ts`：DBクライアントのエクスポート形式）
  * `src/index.ts`（または `index.ts`：EJSの `views` パス、静的ファイル `public` パス、JSONパーサー `express.json()` の有無）
* **作業内容**:
  1. 上記4ファイルを開き、DB接続関数の呼び出し方・ビルド先ディレクトリ・`express.json()` が有効になっているかを確認する。
  2. ローカルサーバーを起動し、既存エンドポイントの疎通を確認する。
* **確認コマンド**:
  ```bash
  npm run build
  npm run dev # または npm start（package.jsonの起動スクリプトに合わせる）
  # 別ターミナルで実行
  curl -i http://localhost:3000/
  curl -i http://localhost:3000/api/db-check