import { NextFunction, Request, Response } from 'express';
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