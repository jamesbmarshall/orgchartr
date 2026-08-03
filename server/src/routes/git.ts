import { Router } from 'express';
import { gitStatus, gitCommit, gitPush } from '../lib/git';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await gitStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/commit', async (req, res) => {
  const { message } = req.body ?? {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Commit message is required' });
  }
  try {
    const result = await gitCommit(message.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/push', async (_req, res) => {
  try {
    const output = await gitPush();
    res.json({ pushed: true, output });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
