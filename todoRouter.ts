import { Router, Request, Response } from 'express';
import { pool } from './db';

export const todoRouter = Router();

// ------------------------------
// 画面用ルート
// ------------------------------
todoRouter.get('/todo', (req: Request, res: Response) => {
  res.render('todo/index');
});

// ------------------------------
// APIエンドポイント
// ------------------------------

// 1. 一覧取得 (GET /api/v1/todos)
todoRouter.get('/api/v1/todos', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, title, completed, created_at FROM todos ORDER BY id DESC'
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('TODO一覧取得エラー:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. 新規登録 (POST /api/v1/todos)
todoRouter.post('/api/v1/todos', async (req: Request, res: Response) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    res.status(422).json({ error: 'Title is required and must be a non-empty string' });
    return;
  }

  try {
    const result = await pool.query(
      'INSERT INTO todos (title, completed) VALUES ($1, FALSE) RETURNING id, title, completed, created_at',
      [title.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('TODO登録エラー:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. 更新 (PUT /api/v1/todos/:id)
todoRouter.put('/api/v1/todos/:id', async (req: Request, res: Response) => {
  const idNum = Number(req.params.id);
  if (isNaN(idNum)) {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }

  const { title, completed } = req.body;

  try {
    const check = await pool.query('SELECT * FROM todos WHERE id = $1', [idNum]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'TODO not found' });
      return;
    }

    const current = check.rows[0];
    const newTitle = title !== undefined ? title : current.title;
    const newCompleted = completed !== undefined ? completed : current.completed;

    const updateResult = await pool.query(
      'UPDATE todos SET title = $1, completed = $2 WHERE id = $3 RETURNING id, title, completed, created_at',
      [newTitle, newCompleted, idNum]
    );

    res.status(200).json(updateResult.rows[0]);
  } catch (error) {
    console.error('TODO更新エラー:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. 削除 (DELETE /api/v1/todos/:id)
todoRouter.delete('/api/v1/todos/:id', async (req: Request, res: Response) => {
  const idNum = Number(req.params.id);
  if (isNaN(idNum)) {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }

  try {
    const check = await pool.query('SELECT * FROM todos WHERE id = $1', [idNum]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'TODO not found' });
      return;
    }

    await pool.query('DELETE FROM todos WHERE id = $1', [idNum]);
    res.status(204).send();
  } catch (error) {
    console.error('TODO削除エラー:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});