import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { initDB } from './db.js';
import logger from './logger.js';
import { setupCommands } from './commands.js';
import { setupCron } from './cron.js';
import { getHistory, addReply, getReplies, generateComment, generateRoundResult, addHistory, getStats, applyRoundEffects } from './gameLogic.js';
import { formatUsername, removeAsterisks, removeUsernames, formatStatsPretty } from './utils.js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

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

// Обработка реплаев на ситуации
bot.on('message', async (msg) => {
  if (!msg.reply_to_message || !msg.text) return;
  if (msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = formatUsername(msg.from);
  const replyText = msg.text;
  const repliedText = msg.reply_to_message.text;
  // Только если реплай на ситуацию
  if (repliedText && repliedText.includes('братва')) {
    const history = await getHistory(chatId, 1);
    const situationId = history[0]?.id;
    await addReply(chatId, situationId, userId, '', replyText);
    logBotAction('Получен ответ игрока', { chatId, userId, username, replyText });
    logger.info(`[${chatId}] Реплай от ${username}: ${replyText}`);
    // Генерируем саркастичный комментарий
    const comment = await generateComment(history, replyText, username);
    if (comment && comment.length > 5) {
      bot.sendMessage(chatId, removeAsterisks(removeUsernames(comment)), { reply_to_message_id: msg.message_id });
    }
    // --- Сбор ответов и запуск таймера ---
    let round = activeRounds.get(chatId);
    if (!round || round.situationId !== situationId) {
      round = { timer: null, repliedUserIds: new Set(), situationId };
      activeRounds.set(chatId, round);
      if (lonelyTimers.has(chatId)) {
        clearTimeout(lonelyTimers.get(chatId));
      }
      lonelyTimers.set(chatId, setTimeout(() => handleNoReplies(chatId, bot), 30 * 60 * 1000));
    }
    round.repliedUserIds.add(userId);
    // Получаем список участников чата (без бота)
    let membersCount = 2; // fallback
    try {
      const admins = await bot.getChatAdministrators(chatId);
      const isGroup = msg.chat.type.endsWith('group');
      if (isGroup) {
        const memberUserIds = admins.map(a => a.user.id);
        membersCount = memberUserIds.length;
        if (bot.getChatMemberCount) {
          membersCount = await bot.getChatMemberCount(chatId);
        }
      }
    } catch (e) { /* ignore */ }

    // Если ответили хотя бы 2 или все (кроме бота)
    const repliedCount = round.repliedUserIds.size;
    const botId = bot.me?.id;
    let allUsersReplied = false;
    if (membersCount > 1) {
      allUsersReplied = (repliedCount >= (membersCount - 1));
    }
    if ((repliedCount >= 2 || allUsersReplied)) {
      // Если уже был таймер — отменяем его
      if (round.timer) {
        clearTimeout(round.timer);
      }
      round.timer = setTimeout(() => handleRoundAdvance(chatId, bot), 2 * 60 * 1000);
      logBotAction('Запуск таймера на 2 минуты', { chatId });
      bot.sendMessage(chatId, 'Вай, братва! Через 2 минуты подведу итог и расскажу, что дальше.');
      // Если был таймер одиночки — отменяем
      if (lonelyTimers.has(chatId)) {
        clearTimeout(lonelyTimers.get(chatId));
        lonelyTimers.delete(chatId);
      }
    } else if (repliedCount === 1 && !round.timer) {
      // Если только один ответ — запускаем таймер на 30 минут
      round.timer = setTimeout(() => handleRoundAdvance(chatId, bot), 30 * 60 * 1000);
      logBotAction('Запуск таймера на 30 минут', { chatId });
      bot.sendMessage(chatId, 'Вай, братва! Если никто больше не ответит, через 30 минут подведу итог по одному мнению!');
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
  const botUser = bot.me?.username ? `@${bot.me.username}` : '';
  if (botUser && msg.text.includes(botUser)) {
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