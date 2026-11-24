1. 要望書の整理・確認ポイント
要望書の内容から、採用技術と設計の軸は以下のように確定しています。

AIプロバイダ / SDK: Gemini AI を利用（公式SDKとして @google/genai を採用するのが自然です）

レイヤー構成: Router → Controller → Service の責務分離を徹底し、既存の src/apps/todo/ や index.ts（ミドルウェア・404・グローバルエラーハンドラー）に影響を与えない構成とします。

環境変数: dotenv 経由で AI_API_KEY（および必要に応じて GEMINI_MODEL 等）を読み込み、未設定時は起動時またはリクエスト時に安全に検知できるようにします。

2. レイヤー別 設計・実装の要点
ルーティング（src/apps/ai/aiRouter.ts）
GET /ai：質問画面（views/ai/index.ejs）の描画

POST /ai/ask（または POST /ai/query）：質問テキストを受け取り、AI回答をJSONで返却

index.ts 側では既存のルート・404ハンドラー・エラーハンドラーの配置順を確認したうえで app.use('/ai', aiRouter) をマウントします。

コントローラー（src/apps/ai/aiController.ts）
入力検証:

質問文字列（question 等）が未指定・空文字・空白のみの場合は 400 Bad Request で分かりやすいメッセージを返却します。

最大文字数制限（例: 1,000〜2,000文字程度）を設け、超過時も 400 Bad Request を返します。

例外連携:

非同期ハンドラーで例外をキャッチし、next(err) 経由でExpressのグローバルエラーハンドラーへ渡すか、想定済みの入力・APIエラーを適切なステータスとメッセージに整形して返却します。

サービス（src/apps/ai/aiService.ts）
AI_API_KEY を環境変数から取得し、SDKクライアントを初期化します。

外部API呼び出しのタイムアウトやレート制限・認証エラー・ネットワーク障害を捕捉し、画面表示やログ出力に適したエラーへ変換します。

フロントエンド（views/ai/index.ejs / public/ai/ai.js）
画面要素:

質問入力フォーム（テキストエリア・文字数表示・送信ボタン）

ローディング表示（送信中の二重送信防止・スピナー/文言表示）

AI回答表示エリアとエラーメッセージ表示エリア

非同期通信:

fetch('/ai/ask', { method: 'POST', ... }) で送信し、通信エラーや非200系レスポンス時も例外を握りつぶさず画面にエラーメッセージを表示します。

3. 推奨される進行順
docs/ai/02_requirements.md の作成: 入力文字数上限、HTTPステータスコード仕様、画面状態（初期表示・送信中・回答表示・エラー表示）、非機能要件を明文化します。

docs/ai/03_design.md の作成: エンドポイント仕様、リクエスト/レスポンスJSONスキーマ、エラーコード・例外フロー、src/apps/ai/ 内の型定義を確定します。

04_implementation.md およびコード実装: パッケージ導入、.env.example / 環境変数追加、src/apps/ai/*、views/ai/index.ejs、public/ai/ai.js、index.ts の順に実装します。

テスト実施・記録（05_test_spec.md / 04_test_results.md）: 正常系（質問送信〜回答表示）、異常系（空文字、文字数超過、APIキー不正/通信失敗）、既存TODO機能の回帰確認を行います。