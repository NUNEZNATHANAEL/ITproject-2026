import express, { Request, Response } from 'express';
import path from 'path';
import { pool } from './db';
import { todoRouter } from './todoRouter'; // 同じ階層の todoRouter.ts をインポート
import 'dotenv/config';
import aiRouter from './src/apps/ai/aiRouter';

const app = express();
const port: number = 3000;

// ------------------------------
// Expressの基本設定
// ------------------------------
app.use(express.json()); // JSONリクエストのパースに必須
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/ai', aiRouter);
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));


// ------------------------------
// ルーティング
// ------------------------------

app.get('/', (req: Request, res: Response): void => {
  res.send(`
    <h1>目次</h1>
    <ul>
      <li><a href="https://itproject-2026-snowy.vercel.app/ai_test.html">api疎通確認ページへ</a></li>
      <li><a href="https://itproject-2026-snowy.vercel.app/todo/">Todoテストページへ</a></li>
    </ul>
  `);
});

app.get('/api/db-check', async (_req, res) => {
  try {
    const result = await pool.query('SELECT 1 AS connection_test');
    res.json({
      status: 'ok',
      database: result.rows[0].connection_test === 1 ? 'connected' : 'error',
    });
  } catch (error) {
    console.error('DB接続確認に失敗しました', error);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

// TODOアプリ用ルーターのマウント
app.use('/', todoRouter);

// サーバー起動
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});