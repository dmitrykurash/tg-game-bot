import { getGameState, setGameState, addHistory, getHistory, generateSituation, clearGameState } from './gameLogic.js';
import logger from './logger.js';
import { getStats } from './statsLogic.js';

export function setupCommands(bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /start by ${msg.from.username}`);
    const state = JSON.stringify({});
    await setGameState(chatId, state, 1, Date.now());
    const stats = await getStats(chatId);
    const situation = await generateSituation([], stats);
    await addHistory(chatId, situation);
    bot.sendMessage(chatId, `Вай, братва! Начинаем новую историю!\n\n${situation}`);
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
    bot.sendMessage(chatId, `Вай, братва! Всё по новой! Начинаем новую историю!\n\n${situation}`);
  });

  bot.onText(/\/next/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /next by ${msg.from.username}`);
    const history = await getHistory(chatId, 10);
    const stats = await getStats(chatId);
    const situation = await generateSituation(history.reverse(), stats);
    await addHistory(chatId, situation);
    bot.sendMessage(chatId, `Вай, братва! Вот новая ситуация!\n\n${situation}`);
  });

  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /menu by ${msg.from.username}`);
    bot.sendMessage(chatId, 'Меню:', {
      reply_markup: {
        keyboard: [
          ['История', 'Союзники и враги'],
          ['Позвать Аслана', 'Баланс и репутация'],
          ['Справка', 'Перезапустить', 'Следующая ситуация']
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  });

  bot.onText(/\/callaslan/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info(`[${chatId}] /callaslan by ${msg.from.username}`);
    const history = await getHistory(chatId, 10);
    const stats = await getStats(chatId);
    const situation = await generateSituation(history.reverse(), stats);
    await addHistory(chatId, situation);
    bot.sendMessage(chatId, `Вай, братва! Аслан тут как тут!\n\n${situation}`);
  });

  bot.on('message', async (msg) => {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    if (msg.text === 'История') {
      const history = await getHistory(chatId, 10);
      if (!history.length) return bot.sendMessage(chatId, 'История пуста, брат.');
      const text = history.map(e => `• ${e.event}`).join('\n\n');
      bot.sendMessage(chatId, `10 последних событий:\n\n${text}`);
    } else if (msg.text === 'Союзники и враги') {
      bot.sendMessage(chatId, 'Союзники и враги скоро появятся, брат.');
    } else if (msg.text === 'Позвать Аслана') {
      const history = await getHistory(chatId, 10);
      const stats = await getStats(chatId);
      const situation = await generateSituation(history.reverse(), stats);
      await addHistory(chatId, situation);
      bot.sendMessage(chatId, `Вай, братва! Аслан тут как тут!\n\n${situation}`);
    } else if (msg.text === 'Баланс и репутация') {
      const stats = await getStats(chatId);
      bot.sendMessage(chatId, `Касса: ${stats.cash}\nРепутация: ${stats.reputation}\nРеспект: ${stats.respect}\nВнимание ментов: ${stats.heat}`);
    } else if (msg.text === 'Справка') {
      bot.sendMessage(chatId, 'Я — Аслан "Схема", ведущий вашей криминальной истории. Пиши /start чтобы начать, /history — посмотреть события, /callaslan — позвать меня. Отвечай на ситуации реплаем!');
    } else if (msg.text === 'Перезапустить') {
      logger.info(`[${chatId}] Перезапуск истории через меню`);
      await clearGameState(chatId);
      const state = JSON.stringify({});
      await setGameState(chatId, state, 1, Date.now());
      const stats = await getStats(chatId);
      const situation = await generateSituation([], stats);
      await addHistory(chatId, situation);
      bot.sendMessage(chatId, `Вай, братва! Всё по новой! Начинаем новую историю!\n\n${situation}`);
    } else if (msg.text === 'Следующая ситуация') {
      logger.info(`[${chatId}] Следующая ситуация через меню`);
      const history = await getHistory(chatId, 10);
      const stats = await getStats(chatId);
      const situation = await generateSituation(history.reverse(), stats);
      await addHistory(chatId, situation);
      bot.sendMessage(chatId, `Вай, братва! Вот новая ситуация!\n\n${situation}`);
    }
  });
} 