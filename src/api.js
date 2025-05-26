import express from 'express';
import { getHistory } from './gameLogic.js';

const app = express();
const PORT = process.env.API_PORT || 3000;

// Короткое саммари (первые 100 символов, без переносов)
function shortSummary(text) {
  return text.replace(/\n/g, ' ').slice(0, 100) + (text.length > 100 ? '…' : '');
}

app.get('/api/history', async (req, res) => {
  const chatId = req.query.chatId;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });
  const history = await getHistory(chatId, 50);
  const result = history.map(e => ({
    id: e.id,
    createdAt: e.createdAt,
    summary: shortSummary(e.event),
    full: e.event
  })).reverse(); // хронологически
  res.json({ chatId, history: result });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
}); 