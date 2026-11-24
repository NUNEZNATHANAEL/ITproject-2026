import { GoogleGenAI } from '@google/genai';

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