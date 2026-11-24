# AI質問機能 実装手順書 (`04_implementation.md`)

## 1. 文書情報・目的

- **関連文書**:
  - `docs/ai/01_request.md`（AI質問機能 追加要望書）
  - `docs/ai/02_requirements.md`（AI質問機能 要件定義書）
  - `docs/ai/03_design.md`（AI質問機能 設計書）
- **目的**: Express / TypeScript / EJS 製既存Webアプリケーションに、Gemini（`@google/genai`）を用いた「AI質問機能」を安全かつ再現性高く導入するためのセットアップ手順および実装内容を記録する。
- **前提条件**:
  - 既存の TODO アプリ（`src/apps/todo/`）および Express サーバー（`index.ts`）が動作する環境であること。
  - Google AI Studio 等で発行された Gemini API キーを取得済みであること。

---

## 2. セットアップ手順

### 2.1. 必要な外部パッケージのインストール

プロジェクトルートで以下のコマンドを実行し、Gemini 公式 SDK をインストールする。

```bash
npm install @google/genai
※ dotenv が未導入または package.json に未記載の場合は、あわせてインストールする。Bashnpm install dotenv
2.2. 環境変数の設定（.env）プロジェクトルートの .env（および管理対象に .env.example がある場合はそちらにも）に環境変数を追加する。コード スニペットAI_API_KEY=your_gemini_api_key_here
# 任意: 使用するモデルを上書きしたい場合（デフォルト: gemini-2.5-flash）
# GEMINI_MODEL=gemini-2.5-flash
注意: .env は .gitignore に含まれていることを確認し、実際のAPIキーをリポジトリにコミットしないこと。3. ファイル配置・実装内容3.1. 新規作成・修正対象ファイル一覧区分ファイルパス概要サービスsrc/apps/ai/aiService.tsGemini SDK 呼び出し、30秒タイムアウト制御、エラー変換コントローラーsrc/apps/ai/aiController.ts入力検証（型・必須・空白のみ・1,000文字上限）、JSON応答、next(err) 連携ルーティングsrc/apps/ai/aiRouter.tsGET / および POST /ask のルート定義ビューviews/ai/index.ejs質問入力フォーム、文字数カウンター、ローディング・エラー・回答表示領域静的ファイルpublic/ai/ai.js4状態（Idle / Loading / Success / Error）制御、fetch('/ai/ask')、安全な描画サーバー統合index.tsapp.use('/ai', aiRouter) のマウント（既存ミドルウェア・エラーハンドラー順を維持）3.2. サービス層（src/apps/ai/aiService.ts）process.env.AI_API_KEY を読み込み、未設定時は AiServiceError('AI_CONFIG_ERROR', 500, ...) を送出する。REQUEST_TIMEOUT_MS = 30_000（30秒）でタイムアウトを制御し、超過時は AI_TIMEOUT（504）へ変換する。レート制限（429）、認証エラー（401/403）、その他外部API/通信障害を AiServiceError にマッピングし、機密情報を含まないユーザー向けメッセージへ統一する。TypeScriptimport { GoogleGenAI } from '@google/genai';

export type AiErrorCode =
  | 'AI_CONFIG_ERROR'
  | 'AI_RATE_LIMIT'
  | 'AI_TIMEOUT'
  | 'AI_UPSTREAM_ERROR';

export class AiServiceError extends Error {
  public readonly code: AiErrorCode;
  public readonly status: number;

  constructor(code: AiErrorCode, status: number, message: string) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('GEMINI_REQUEST_TIMEOUT'));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function mapToAiServiceError(err: unknown): AiServiceError {
  if (err instanceof AiServiceError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();
  const statusLike =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : undefined;

  if (
    lowerMessage.includes('gemini_request_timeout') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('deadline exceeded') ||
    statusLike === 504
  ) {
    return new AiServiceError(
      'AI_TIMEOUT',
      504,
      'AIからの応答がタイムアウトしました。時間をおいて再度お試しください。'
    );
  }

  if (
    statusLike === 429 ||
    lowerMessage.includes('429') ||
    lowerMessage.includes('resource_exhausted') ||
    lowerMessage.includes('quota') ||
    lowerMessage.includes('rate limit')
  ) {
    return new AiServiceError(
      'AI_RATE_LIMIT',
      429,
      'アクセスが集中しています。しばらく時間をおいて再度お試しください。'
    );
  }

  if (
    statusLike === 401 ||
    statusLike === 403 ||
    lowerMessage.includes('api key') ||
    lowerMessage.includes('permission_denied') ||
    lowerMessage.includes('unauthenticated')
  ) {
    return new AiServiceError(
      'AI_CONFIG_ERROR',
      500,
      '現在AI機能を利用できません。管理者にお問い合わせください。'
    );
  }

  return new AiServiceError(
    'AI_UPSTREAM_ERROR',
    502,
    'AIサービスとの通信に失敗しました。時間をおいて再度お試しください。'
  );
}

export async function askGemini(question: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiServiceError(
      'AI_CONFIG_ERROR',
      500,
      '現在AI機能を利用できません。管理者にお問い合わせください。'
    );
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: question,
      }),
      REQUEST_TIMEOUT_MS
    );

    const answer = response.text?.trim();
    if (!answer) {
      throw new AiServiceError(
        'AI_UPSTREAM_ERROR',
        502,
        'AIサービスとの通信に失敗しました。時間をおいて再度お試しください。'
      );
    }

    return answer;
  } catch (err) {
    const mapped = mapToAiServiceError(err);
    console.error('[aiService.askGemini] error:', {
      code: mapped.code,
      status: mapped.status,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw mapped;
  }
}
3.3. コントローラー層（src/apps/ai/aiController.ts）GET /ai 向けハンドラー renderAiPage で views/ai/index.ejs を描画する。POST /ai/ask 向けハンドラー postAskAi で question の型（string）、最大文字数（1,000文字）、空文字/空白のみを検証し、不正時は 400（INVALID_INPUT）を返却する。想定外の例外は next(err) へ渡し、Express のグローバルエラーハンドラーへ委譲する。TypeScriptimport { NextFunction, Request, Response } from 'express';
import { AiServiceError, askGemini } from './aiService';

const MAX_QUESTION_LENGTH = 1000;

function sendErrorResponse(
  res: Response,
  status: number,
  code: string,
  message: string
): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

export function renderAiPage(_req: Request, res: Response, next: NextFunction): void {
  try {
    res.render('ai/index', {
      title: 'AI質問',
      maxLength: MAX_QUESTION_LENGTH,
    });
  } catch (err) {
    next(err);
  }
}

export async function postAskAi(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawQuestion: unknown = req.body?.question;

    if (typeof rawQuestion !== 'string') {
      sendErrorResponse(
        res,
        400,
        'INVALID_INPUT',
        '質問は文字列で入力してください。'
      );
      return;
    }

    if (rawQuestion.length > MAX_QUESTION_LENGTH) {
      sendErrorResponse(
        res,
        400,
        'INVALID_INPUT',
        `質問は${MAX_QUESTION_LENGTH.toLocaleString()}文字以内で入力してください。`
      );
      return;
    }

    const trimmedQuestion = rawQuestion.trim();
    if (trimmedQuestion.length === 0) {
      sendErrorResponse(
        res,
        400,
        'INVALID_INPUT',
        '質問を入力してください。'
      );
      return;
    }

    const answer = await askGemini(trimmedQuestion);
    res.status(200).json({ answer });
  } catch (err) {
    if (err instanceof AiServiceError) {
      sendErrorResponse(res, err.status, err.code, err.message);
      return;
    }

    console.error('[aiController.postAskAi] unexpected error:', err);
    next(err);
  }
}
3.4. ルーター層（src/apps/ai/aiRouter.ts）TypeScriptimport { Router } from 'express';
import { postAskAi, renderAiPage } from './aiController';

const aiRouter = Router();

aiRouter.get('/', renderAiPage);
aiRouter.post('/ask', postAskAi);

export default aiRouter;
3.5. ビュー・フロントエンドスクリプト（views/ai/index.ejs / public/ai/ai.js）views/ai/index.ejs: 質問フォーム、文字数カウンター、ローディング表示、エラー表示、回答表示領域を配置し、/ai/ai.js を読み込む。public/ai/ai.js: 送信中の二重送信防止・入力保持・textContent による安全なテキスト描画を行う。views/ai/index.ejsHTML<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><%= typeof title !== 'undefined' ? title : 'AI質問' %></title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 760px;
      margin: 2rem auto;
      padding: 0 1rem;
      line-height: 1.6;
      color: #1f2937;
    }
    .ai-form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    textarea {
      width: 100%;
      min-height: 120px;
      padding: 0.75rem;
      font-size: 1rem;
      box-sizing: border-box;
    }
    .ai-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
      color: #4b5563;
    }
    .ai-char-count.is-over {
      color: #b91c1c;
      font-weight: 700;
    }
    button {
      padding: 0.6rem 1.25rem;
      font-size: 1rem;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .ai-loading {
      margin-top: 1rem;
      color: #374151;
    }
    .ai-error {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-left: 4px solid #dc2626;
      background: #fef2f2;
      color: #991b1b;
    }
    .ai-answer {
      margin-top: 1.5rem;
      padding: 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #f9fafb;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <main>
    <h1>AI質問</h1>
    <p>質問を入力すると、Gemini が回答を生成します（最大 <%= typeof maxLength !== 'undefined' ? maxLength : 1000 %> 文字）。</p>

    <form id="ai-question-form" data-max-length="<%= typeof maxLength !== 'undefined' ? maxLength : 1000 %>" novalidate>
      <div class="ai-form-group">
        <label for="ai-question-input">質問内容</label>
        <textarea
          id="ai-question-input"
          name="question"
          placeholder="例: ExpressとTypeScriptでレイヤー分離するメリットは何ですか？"
        ></textarea>
        <div class="ai-meta">
          <span id="ai-char-count" class="ai-char-count">0 / 1,000文字</span>
          <button id="ai-submit-btn" type="submit">質問する</button>
        </div>
      </div>
    </form>

    <div id="ai-loading" class="ai-loading" hidden aria-live="polite">
      AIが回答を生成しています...
    </div>

    <div id="ai-error" class="ai-error" hidden role="alert" aria-live="assertive"></div>

    <section id="ai-answer-section" class="ai-answer" hidden aria-live="polite">
      <h2>回答</h2>
      <div id="ai-answer-text"></div>
    </section>
  </main>

  <script src="/ai/ai.js" defer></script>
</body>
</html>
public/ai/ai.jsJavaScript(() => {
  const form = document.getElementById('ai-question-form');
  const input = document.getElementById('ai-question-input');
  const charCountEl = document.getElementById('ai-char-count');
  const submitBtn = document.getElementById('ai-submit-btn');
  const loadingEl = document.getElementById('ai-loading');
  const errorEl = document.getElementById('ai-error');
  const answerSectionEl = document.getElementById('ai-answer-section');
  const answerTextEl = document.getElementById('ai-answer-text');

  if (!form || !input || !submitBtn || !loadingEl || !errorEl || !answerSectionEl || !answerTextEl) {
    return;
  }

  const maxLength = Number(form.dataset.maxLength) || 1000;
  let isSubmitting = false;

  function updateCharCount() {
    const currentLength = input.value.length;
    const isOver = currentLength > maxLength;
    if (charCountEl) {
      charCountEl.textContent = `${currentLength.toLocaleString()} / ${maxLength.toLocaleString()}文字`;
      charCountEl.classList.toggle('is-over', isOver);
    }
  }

  function setLoadingState(loading) {
    isSubmitting = loading;
    input.disabled = loading;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? '回答生成中...' : '質問する';
    loadingEl.hidden = !loading;

    if (loading) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function showAnswer(answer) {
    answerTextEl.textContent = answer;
    answerSectionEl.hidden = false;
  }

  input.addEventListener('input', updateCharCount);
  updateCharCount();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const rawQuestion = input.value;
    const trimmedQuestion = rawQuestion.trim();

    if (trimmedQuestion.length === 0) {
      showError('質問を入力してください。');
      input.focus();
      return;
    }

    if (rawQuestion.length > maxLength) {
      showError(`質問は${maxLength.toLocaleString()}文字以内で入力してください。`);
      input.focus();
      return;
    }

    setLoadingState(true);

    try {
      const response = await fetch('/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: rawQuestion }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const message =
          data?.error?.message ||
          '回答の取得中にエラーが発生しました。時間をおいて再度お試しください。';
        showError(message);
        return;
      }

      if (!data || typeof data.answer !== 'string' || data.answer.trim().length === 0) {
        showError('AIから有効な回答を取得できませんでした。');
        return;
      }

      showAnswer(data.answer);
    } catch {
      showError('通信エラーが発生しました。ネットワーク接続を確認してください。');
    } finally {
      setLoadingState(false);
      input.focus();
    }
  });
})();
3.6. サーバー統合（index.ts）既存の express.json()、静的ファイル配信、TODOルーターの後に aiRouter をマウントし、404ハンドラーやグローバルエラーハンドラーの前に配置する。TypeScriptimport 'dotenv/config';
import express from 'express';
import aiRouter from './src/apps/ai/aiRouter';

// ... 既存の app 初期化・ミドルウェア・TODOルーター登録 ...

app.use(express.json());
app.use('/ai', aiRouter);

// ... 既存の 404 ハンドラー・グローバルエラーハンドラー ...
4. ビルド・起動確認手順TypeScript のコンパイル確認（npm run build または npx tsc --noEmit 等、既存スクリプトに準拠）を実行し、型エラーがないことを確認する。サーバーを起動し、ブラウザで http://<host>:<port>/ai にアクセスして画面が表示されることを確認する。既存の TODO 機能画面・API にアクセスし、影響がないことを確認する。
---

<ElicitationsGroup message="実装手順書（04_implementation.md）の次は、テスト・検証フェーズに進めます。">
  <Elicitation label="テスト仕様書（05_test_spec.md）を作成する" query="実装したAI質問機能（GET /ai および POST /ai/ask、画面状態遷移、異常系・エラーハンドリング、既存TODO機能への非干渉）を検証するためのテスト仕様書（docs/ai/05_test_spec.md）を作成してください。"/>
  <Elicitation label="既存の index.ts や todo 構成に合わせて微調整する" query="既存のExpressアプリのミドルウェア構成やEJSレイアウトに合わせて、index.tsへの組み込み方やviews/ai/index.ejsを調整してください。"/>
</ElicitationsGroup>