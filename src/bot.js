import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { initDB } from './db.js';
import logger from './logger.js';
import { setupCommands } from './commands.js';
import { setupCron } from './cron.js';
import { getHistory, addReply, getReplies, generateComment, generateRoundResult, addHistory, getStats, applyRoundEffects } from './gameLogic.js';
import { formatUsername, removeAsterisks, removeUsernames, formatStatsPretty } from './utils.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Получаем username бота при старте
const me = await bot.getMe();
const botUsername = me.username ? `@${me.username}` : '';

await initDB();
logger.info('DB initialized');

setupCommands(bot);
setupCron(bot);

// --- Логика сбора ответов и автоматического движения сюжета ---
const activeRounds = new Map(); // chatId -> { timer, repliedUserIds, situationId }
const lonelyTimers = new Map(); // chatId -> timer

async function handleRoundAdvance(chatId, bot) {
  const history = await getHistory(chatId, 1);
  const situationId = history[0]?.id;
  const replies = await getReplies(chatId, situationId);
  const allReplies = replies || [];
  const roundResult = await generateRoundResult(history, allReplies);
  await addHistory(chatId, roundResult);
  // --- Применяем эффекты к статам ---
  const { changes, newStats } = await applyRoundEffects(chatId, roundResult);
  logBotAction('Подведение итогов', { chatId, roundResult });
  bot.sendMessage(chatId, removeAsterisks(removeUsernames(roundResult)));
  logBotAction('Отправка статов', { chatId, stats: newStats });
  bot.sendMessage(chatId, formatStatsPretty(newStats, changes), { parse_mode: 'HTML' });
  activeRounds.delete(chatId);
}

async function handleNoReplies(chatId, bot) {
  // Никто не ответил за 30 минут
  const history = await getHistory(chatId, 1);
  const situationId = history[0]?.id;
  const roundResult = 'Вай, братва... Никто даже не ответил на схему! Я тут один тяну всё на себе, а вы даже не поддержали. Ну что ж, сам решу, как быть.';
  await addHistory(chatId, roundResult);
  const { changes, newStats } = await applyRoundEffects(chatId, roundResult);
  logBotAction('Подведение итогов (никто не ответил)', { chatId, roundResult });
  bot.sendMessage(chatId, removeAsterisks(removeUsernames(roundResult)));
  logBotAction('Отправка статов', { chatId, stats: newStats });
  bot.sendMessage(chatId, formatStatsPretty(newStats, changes), { parse_mode: 'HTML' });
  activeRounds.delete(chatId);
  lonelyTimers.delete(chatId);
}

// Пример логирования действий бота
export function logBotAction(action, details = {}) {
  logger.info(`[BOT_ACTION] ${action} ${JSON.stringify(details)}`);
}

// Обработка реплаев на сообщения бота
bot.on('message', async (msg) => {
  if (!msg.reply_to_message || !msg.text) return;
  if (msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = formatUsername(msg.from);
  const replyText = msg.text;
  const repliedMsg = msg.reply_to_message;
  // Проверяем, что реплай на сообщение бота
  if (repliedMsg.from && (repliedMsg.from.username === (botUsername.replace('@','')) || repliedMsg.from.id === me.id)) {
    const history = await getHistory(chatId, 5);
    logBotAction('Реплай на сообщение бота', { chatId, userId, username, replyText });
    const comment = await generateComment(history, replyText, username);
    if (comment && comment.length > 5) {
      bot.sendMessage(chatId, removeAsterisks(removeUsernames(comment)), { reply_to_message_id: msg.message_id });
    }
  }
});

// Приветствие при добавлении в чат
bot.on('new_chat_members', async (msg) => {
  const chatId = msg.chat.id;
  for (const member of msg.new_chat_members) {
    if (member.username === bot.me?.username) {
      bot.sendMessage(chatId, 'Вай, братва! Я теперь с вами. Готов вести ваши схемы и истории! Пишите /start чтобы начать.');
      // Краткая инструкция
      bot.sendMessage(chatId, `Как играть:\n— Я ведущий вашей криминальной истории.\n— Чтобы начать — напишите /start.\n— Я буду присылать ситуации, отвечайте на них реплаем (ответом на моё сообщение) — так ваш голос будет учтён.\n— Для личного диалога со мной — упомяните меня через @ или ответьте реплаем на мой ответ.\n— Я не вмешиваюсь в ваши обычные разговоры, только если вы явно обращаетесь ко мне.\n— Статы банды (касса, репутация и др.) зависят от ваших решений и влияют на сюжет.\n— В любой момент можно перезапустить историю через /restart или меню.\n\nВсё просто, братва! Погнали!`);
      break;
    }
  }
});

// Добавляю команду /stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const stats = await getStats(chatId);
  logBotAction('Отправка статов по запросу', { chatId, stats });
  bot.sendMessage(chatId, formatStatsPretty(stats), { parse_mode: 'HTML' });
});

// Обработка явных обращений к боту через @username (не команда, не реплай)
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/') || msg.reply_to_message) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = formatUsername(msg.from);
  if (botUsername && msg.text.includes(botUsername)) {
    logBotAction('Явное обращение к боту через @', { chatId, userId, username, text: msg.text });
    // Получаем историю для контекста
    const history = await getHistory(chatId, 5);
    // Генерируем ответ
    const comment = await generateComment(history, msg.text, username);
    if (comment && comment.length > 5) {
      bot.sendMessage(chatId, removeAsterisks(removeUsernames(comment)), { reply_to_message_id: msg.message_id });
    }
  }
});

// Добавляю команду /miniapp
bot.onText(/\/miniapp/, async (msg) => {
  const chatId = msg.chat.id;
  // Автоматически определяем адрес (Railway подставит свой домен)
  const url = `${process.env.PUBLIC_URL || ''}/miniapp.html?chatId=${chatId}`;
  bot.sendMessage(chatId, `Открыть миниприложение-хронологию: ${url}`);
});

// --- Express API и миниапп ---
const app = express();
const PORT = process.env.PORT || 3000;

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
  })).reverse();
  res.json({ chatId, history: result });
});

// Отдаём miniapp.html
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.get('/miniapp.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'miniapp.html'));
});

app.listen(PORT, () => {
  logger.info(`Express API+miniapp listening on port ${PORT}`);
}); 