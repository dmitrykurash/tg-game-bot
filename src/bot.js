import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { initDB } from './db.js';
import logger from './logger.js';
import { setupCommands } from './commands.js';
import { setupCron } from './cron.js';
import { getHistory, addReply, getReplies, generateComment, generateRoundResult, addHistory } from './gameLogic.js';
import { formatUsername } from './utils.js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

await initDB();
logger.info('DB initialized');

setupCommands(bot);
setupCron(bot);

// Обработка реплаев на ситуации
bot.on('message', async (msg) => {
  if (!msg.reply_to_message || !msg.text) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = formatUsername(msg.from);
  const replyText = msg.text;
  const repliedText = msg.reply_to_message.text;

  // Проверяем, что реплай на ситуацию (можно добавить маркер в тексте ситуации)
  if (repliedText && repliedText.includes('братва')) {
    // Получаем номер ситуации (можно хранить в state, тут упрощённо)
    const history = await getHistory(chatId, 1);
    const situationId = history[0]?.id;
    await addReply(chatId, situationId, userId, username, replyText);
    logger.info(`[${chatId}] Реплай от ${username}: ${replyText}`);
    // Генерируем саркастичный комментарий
    const comment = await generateComment(history, replyText, username);
    if (comment && comment.length > 5) {
      bot.sendMessage(chatId, comment, { reply_to_message_id: msg.message_id });
    }
    // TODO: запускать итог раунда через 2 минуты после первого ответа (или сразу, если все ответили)
  }
});

// Персональный ответ на @ или реплай на любое сообщение бота
bot.on('message', async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const username = formatUsername(msg.from);
  if (msg.text.includes('@') || (msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.username === bot.me?.username)) {
    const history = await getHistory(chatId, 10);
    const comment = await generateComment(history.reverse(), msg.text, username);
    if (comment && comment.length > 5) {
      bot.sendMessage(chatId, comment, { reply_to_message_id: msg.message_id });
    }
  }
}); 