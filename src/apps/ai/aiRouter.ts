import { Router } from 'express';
import { postAskAi, renderAiPage } from './aiController';

const aiRouter = Router();

aiRouter.get('/', renderAiPage);
aiRouter.post('/ask', postAskAi);

export default aiRouter;