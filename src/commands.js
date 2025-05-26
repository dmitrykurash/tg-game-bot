import { getGameState, setGameState, addHistory, getHistory, generateSituation, clearGameState, getStats } from './gameLogic.js';
import logger from './logger.js';
import { removeAsterisks, removeUsernames, formatStatsPretty } from './utils.js';
import { logBotAction } from './bot.js';

const INSTRUCTION_TEXT = `Как играть:\n— Я ведущий вашей криминальной истории.\n— Чтобы начать — напишите /start.\n— Я буду присылать ситуации, отвечайте на них реплаем (ответом на моё сообщение) — так ваш голос будет учтён.\n— Для личного диалога со мной — упомяните меня через @ или ответьте реплаем на мой ответ.\n— Я не вмешиваюсь в ваши обычные разговоры, только если вы явно обращаетесь ко мне.\n— Статы банды (касса, репутация и др.) зависят от ваших решений и влияют на сюжет.\n— В любой момент можно перезапустить историю через /restart или меню.\n\nВсё просто, братва! Погнали!`;

export function setupCommands(bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /start by ${msg.from.username}`);
    bot.sendMessage(chatId, INSTRUCTION_TEXT);
    const state = JSON.stringify({});
    await setGameState(chatId, state, 1, Date.now());
    const stats = await getStats(chatId);
    const situation = await generateSituation([], stats);
    await addHistory(chatId, situation);
    logBotAction('Отправка новой ситуации', { chatId, situation: removeAsterisks(removeUsernames(situation)) });
    bot.sendMessage(chatId, `Вай, братва! Начинаем новую историю!\n\n${removeAsterisks(removeUsernames(situation))}`);
    bot.sendMessage(chatId, formatStatsPretty(stats), { parse_mode: 'HTML' });
  });

  bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /history by ${msg.from.username}`);
    const history = await getHistory(chatId, 10);
    if (!history.length) return bot.sendMessage(chatId, 'История пуста, брат.');
    const text = history.map(e => `• ${e.event}`).join('\n\n');
    bot.sendMessage(chatId, `10 последних событий:\n\n${text}`);
  });

  bot.onText(/\/relationships/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /relationships by ${msg.from.username}`);
    // TODO: реализовать вывод союзников и врагов
    bot.sendMessage(chatId, 'Союзники и враги скоро появятся, брат.');
  });

  bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /restart by ${msg.from.username}`);
    await clearGameState(chatId);
    const state = JSON.stringify({});
    await setGameState(chatId, state, 1, Date.now());
    const stats = await getStats(chatId);
    const situation = await generateSituation([], stats);
    await addHistory(chatId, situation);
    logBotAction('Перезапуск истории через меню', { chatId });
    bot.sendMessage(chatId, `Вай, братва! Всё по новой! Начинаем новую историю!\n\n${removeAsterisks(removeUsernames(situation))}`);
    bot.sendMessage(chatId, formatStatsPretty(stats), { parse_mode: 'HTML' });
  });

  bot.onText(/\/next/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /next by ${msg.from.username}`);
    const history = await getHistory(chatId, 10);
    const stats = await getStats(chatId);
    const situation = await generateSituation(history.reverse(), stats);
    await addHistory(chatId, situation);
    logBotAction('Отправка новой ситуации', { chatId, situation: removeAsterisks(removeUsernames(situation)) });
    bot.sendMessage(chatId, `Вай, братва! Вот новая ситуация!\n\n${removeAsterisks(removeUsernames(situation))}`);
    bot.sendMessage(chatId, formatStatsPretty(stats), { parse_mode: 'HTML' });
  });

  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /menu by ${msg.from.username}`);
    logBotAction('Открытие меню', { chatId, text: msg.text });
    bot.sendMessage(chatId, 'Меню:', {
      reply_markup: {
        keyboard: [
          [{ text: '📜 Хронология', web_app: { url: `https://tg-game-bot-production.up.railway.app/miniapp.html?chatId=${chatId}` } }],
          ['Статы'],
          ['Перезапустить']
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  });

  bot.onText(/\/instructions/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, INSTRUCTION_TEXT);
  });

  bot.onText(/\/miniapp/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /miniapp by ${msg.from.username}`);
    logBotAction('Вызов /miniapp', { chatId });
    const url = `https://tg-game-bot-production.up.railway.app/miniapp.html?chatId=${chatId}`;
    bot.sendMessage(chatId, 'Открыть миниприложение-хронологию:', {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📜 Хронология',
            web_app: { url }
          }
        ]]
      }
    });
  });

  bot.on('message', async (msg) => {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    if (msg.text.startsWith('/') && msg.text.includes('@')) return;
    if (msg.text === 'Статы') {
      const stats = await getStats(chatId);
      logBotAction('Отправка статов по запросу', { chatId, stats });
      bot.sendMessage(chatId, formatStatsPretty(stats), { parse_mode: 'HTML' });
    } else if (msg.text === 'Перезапустить') {
      logger.info(`[${chatId}] Перезапуск истории через меню`);
      await clearGameState(chatId);
      const state = JSON.stringify({});
      await setGameState(chatId, state, 1, Date.now());
      const stats = await getStats(chatId);
      const situation = await generateSituation([], stats);
      await addHistory(chatId, situation);
      logBotAction('Перезапуск истории через меню', { chatId });
      bot.sendMessage(chatId, `Вай, братва! Всё по новой! Начинаем новую историю!\n\n${removeAsterisks(removeUsernames(situation))}`);
      bot.sendMessage(chatId, formatStatsPretty(stats), { parse_mode: 'HTML' });
    }
  });
} 