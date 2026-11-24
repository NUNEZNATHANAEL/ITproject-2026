# AI質問機能 設計書 (`03_design.md`)

## 1. 文書情報・設計方針

- **関連文書**:
  - `docs/ai/01_request.md`（AI質問機能 追加要望書）
  - `docs/ai/02_requirements.md`（AI質問機能 要件定義書）
- **目的**: AI質問機能のアーキテクチャ、ディレクトリ・モジュール構成、API仕様、入出力JSONスキーマ、例外・エラーハンドリングフローを定義する。
- **基本設計方針**:
  - 既存の `src/apps/todo/` に倣い、`Router`（ルーティング）／`Controller`（入力検証・HTTP入出力制御）／`Service`（外部AI API呼び出し・業務ロジック）の3層に責務を分離する。
  - Gemini SDK（`@google/genai`）の呼び出しは `aiService.ts` に閉じ込め、HTTPリクエストやEJS描画の関心事を混在させない。
  - 既存アプリのミドルウェア、404ハンドラー、グローバルエラーハンドラーの順序を崩さず `/ai` プレフィックスでマウントする。

---

## 2. ディレクトリ・モジュール構成

### 2.1. 配置ファイル一覧

```text
<project-root>/
├── index.ts                      # [修正] aiRouter のマウント（app.use('/ai', aiRouter)）
├── .env                          # [追加/更新] AI_API_KEY（および任意のモデル指定）
├── docs/
│   └── ai/
│       ├── 01_request.md
│       ├── 02_requirements.md
│       └── 03_design.md
├── public/
│   └── ai/
│       └── ai.js                 # [新規] フロントエンド非同期送信・状態管理・DOM描画
├── src/
│   └── apps/
│       └── ai/
│           ├── aiRouter.ts       # [新規] ルート定義（GET /ai, POST /ai/ask）
│           ├── aiController.ts   # [新規] バリデーション・HTTPレスポンス整形・エラー委譲
│           └── aiService.ts      # [新規] @google/genai 呼び出し・タイムアウト・エラー変換
└── views/
    └── ai/
        └── index.ejs             # [新規] AI質問画面テンプレート
2.2. モジュール責務と依存関係Plaintext[Browser: views/ai/index.ejs + public/ai/ai.js]
       │  GET /ai              POST /ai/ask (JSON)
       ▼                         ▼
[index.ts] ──► [src/apps/ai/aiRouter.ts]
                        │
                        ▼
               [src/apps/ai/aiController.ts]
                        │  question (validated string)
                        ▼
               [src/apps/ai/aiService.ts] ──► [Google Gemini API (@google/genai)]
モジュール責務依存対象aiRouter.ts/ai 配下のルート定義と aiController メソッドへのルーティング。express, aiControlleraiController.ts画面描画の委譲、POST /ai/ask のリクエストボディ検証（型・必須・文字数上限1,000文字）、正常JSON返却、エラー時のステータス決定または next(err) 委譲。express, aiServiceaiService.tsprocess.env.AI_API_KEY を用いた Gemini クライアント生成、プロンプト送信、タイムアウト制御（30秒）、SDK/ネットワーク例外のドメインエラー変換。@google/genai, 環境変数（AI_API_KEY）views/ai/index.ejs質問フォーム、文字数カウンター、ローディング表示、回答エリア、エラーエリアのHTML構造定義。既存共通レイアウト/スタイル（該当する場合）public/ai/ai.js4状態（Idle / Loading / Success / Error）の遷移制御、二重送信防止、fetch('/ai/ask') 実行、textContent による安全なテキスト描画。なし（Vanilla JS / Fetch API）3. API仕様3.1. GET /ai（AI質問画面表示）概要: AI質問画面（views/ai/index.ejs）をレンダリングして返却する。メソッド / パス: GET /ai（aiRouter 上は GET /）リクエスト: クエリ・ボディパラメータなしレスポンス:200 OK: Content-Type: text/html; charset=utf-8 — 質問画面HTML3.2. POST /ai/ask（質問送信・AI回答取得）概要: ユーザーの質問テキストを受け取り、Gemini API から生成された回答をJSONで返却する。メソッド / パス: POST /ai/ask（aiRouter 上は POST /ask）リクエストヘッダー:Content-Type: application/jsonリクエストボディ: JSONオブジェクト（第4章のスキーマに準拠）レスポンス:200 OK: AI回答を返却400 Bad Request: 入力値不正（未入力、非文字列、空白のみ、1,000文字超過、不正JSON）429 Too Many Requests: Gemini API レート制限超過500 Internal Server Error: 設定不備（APIキー未設定等）または予期せぬサーバー例外502 Bad Gateway / 504 Gateway Timeout: 外部AI API 障害またはタイムアウト4. 入出力JSONスキーマ4.1. リクエストスキーマ（POST /ai/ask）JSON{
  "question": "ExpressとTypeScriptでレイヤー分離するメリットは何ですか？"
}
フィールド名型必須制約・バリデーションルールquestionstring必須・typeof question === "string" であること・question.trim().length >= 1 であること・question.length <= 1000 であること（送信元の原文長で評価）4.2. 正常レスポンススキーマ（200 OK）JSON{
  "answer": "責務が明確になり、テストや機能追加・修正時の影響範囲を局所化できる点が主なメリットです。"
}
フィールド名型必須説明answerstring必須Gemini API が生成した回答テキスト（空文字の場合はエラーとして扱う）4.3. エラーレスポンススキーマ（4xx / 5xx）クライアント表示およびログ・デバッグ識別用に、以下の構造で統一する。JSON{
  "error": {
    "code": "INVALID_INPUT",
    "message": "質問は1,000文字以内で入力してください。"
  }
}
フィールド名型必須説明error.codestring必須機械判別用のエラーコード（下記一覧参照）error.messagestring必須画面にそのまま表示可能なユーザー向け日本語メッセージエラーコード一覧error.codeHTTPステータス発生条件error.message 例INVALID_INPUT400question 欠落、型不一致、空文字/空白のみ、1,000文字超過、JSON構文エラー「質問を入力してください。」「質問は1,000文字以内で入力してください。」AI_CONFIG_ERROR500AI_API_KEY 未設定、またはSDK認証エラー「現在AI機能を利用できません。管理者にお問い合わせください。」AI_RATE_LIMIT429Gemini API のレート制限（429）到達「アクセスが集中しています。しばらく時間をおいて再度お試しください。」AI_TIMEOUT504Gemini API 呼び出しのタイムアウト（30秒超過等）「AIからの応答がタイムアウトしました。時間をおいて再度お試しください。」AI_UPSTREAM_ERROR502Gemini API 側の5xx障害・通信失敗・空回答「AIサービスとの通信に失敗しました。時間をおいて再度お試しください。」INTERNAL_ERROR500想定外の例外・未処理エラー「システムエラーが発生しました。時間をおいて再度お試しください。」5. 例外・エラーハンドリングフロー5.1. 処理・例外フロー概要Plaintext[POST /ai/ask]
   │
   ├─► JSONパース失敗（Express body-parser SyntaxError）
   │       └─► 400 / INVALID_INPUT として返却
   │
   ├─► aiController バリデーション
   │       ├─ NG ─► 400 / INVALID_INPUT を即時返却（aiService は呼ばない）
   │       └─ OK ─► aiService.askQuestion(question.trim()) 呼び出し
   │
   ├─► aiService 実行（タイムアウト制御: 30,000ms）
   │       ├─ AI_API_KEY 未設定 ─► AiServiceError('AI_CONFIG_ERROR', 500)
   │       ├─ Gemini API 正常応答（テキストあり） ─► 回答文字列を返却
   │       ├─ Gemini API 正常応答だがテキスト空 ─► AiServiceError('AI_UPSTREAM_ERROR', 502)
   │       ├─ タイムアウト / AbortError ─► AiServiceError('AI_TIMEOUT', 504)
   │       ├─ レート制限（429 / RESOURCE_EXHAUSTED） ─► AiServiceError('AI_RATE_LIMIT', 429)
   │       ├─ 認証エラー（401 / 403 / UNAUTHENTICATED） ─► AiServiceError('AI_CONFIG_ERROR', 500)
   │       └─ その他外部API/通信エラー ─► AiServiceError('AI_UPSTREAM_ERROR', 502)
   │
   └─► aiController catch (err)
           ├─ AiServiceError ─► err.status と { error: { code, message } } でJSON返却
           └─ 想定外エラー ─► サーバーログ出力後、next(err) でグローバルエラーハンドラーへ委譲
5.2. 重要ガードレールプロセス非クラッシュ: aiRouter の非同期ルートハンドラーは try / catch（または非同期ラッパー）で囲み、例外が unhandled rejection にならないようにする。機密情報・内部詳細の秘匿: error.message およびクライアント返却JSONに AI_API_KEY の値、内部ファイルパス、スタックトレースを含めない。詳細なエラー原因はサーバー側ログ（console.error または既存ロガー）に記録する。フロントエンドのフェイルセーフ: public/ai/ai.js は fetch 失敗・JSONパース失敗・非 200 レスポンスのすべてを try / catch で捕捉し、入力テキストを保持したまま Error 状態へ遷移させる。6. 既存アプリ（index.ts・src/apps/todo/）との統合設計環境変数読み込み: アプリ起動エントリ（index.ts 等）で dotenv が読み込まれている前提を確認し、AI_API_KEY を参照する。ルーターマウント位置: index.ts において、ボディパーサー（express.json() 等）の適用後、かつ 404 Not Found ハンドラーおよびグローバルエラーハンドラーの前に app.use('/ai', aiRouter) を配置する。既存機能への非干渉: src/apps/todo/ 配下のファイルおよび既存ルートには変更を加えない。
---

<ElicitationsGroup message="設計書（03_design.md）の次は、実装フェーズへ進めます。">
  <Elicitation label="実装コード一式（Router/Controller/Service/View/JS）を作成する" query="設計書（docs/ai/03_design.md）に基づき、AI質問機能の実装コード（src/apps/ai/aiRouter.ts、aiController.ts、aiService.ts、views/ai/index.ejs、public/ai/ai.js、index.tsへの組み込み例）を作成してください。"/>
  <Elicitation label="実装手順書（04_implementation.md）を作成する" query="設計書（docs/ai/03_design.md）に基づき、セットアップ手順と実装手順書（docs/ai/04_implementation.md）のドラフトを作成してください。"/>
  <Elicitation label="設計の細部（エンドポイント名・エラーコード・モデル名）を調整する" query="設計書（docs/ai/03_design.md）のエンドポイントパス、エラーコード体系、またはGeminiモデル選定の前提を見直して再作成してください。"/>
</ElicitationsGroup>