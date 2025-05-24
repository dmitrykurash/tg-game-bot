import cron from 'node-cron';
import { randomDelay, moscowNow } from './utils.js';
import { getHistory, generateSituation, addHistory } from './gameLogic.js';
import logger from './logger.js';

export function setupCron(bot) {
  // Утро: 10:00–10:15 по Москве
  cron.schedule('0 10 * * *', async () => {
    setTimeout(async () => {
      await publishSituationToAllChats(bot, 'Утро, братва!');
    }, randomDelay(0, 15 * 60 * 1000));
  }, { timezone: 'Europe/Moscow' });

  // Вечер: 19:00–19:15 по Москве
  cron.schedule('0 19 * * *', async () => {
    setTimeout(async () => {
      await publishSituationToAllChats(bot, 'Вечер, братва!');
    }, randomDelay(0, 15 * 60 * 1000));
  }, { timezone: 'Europe/Moscow' });
}

async function publishSituationToAllChats(bot, prefix) {
  // Получаем все активные чаты
  const dbConn = (await import('./db.js')).default();
  const chats = await dbConn.all('SELECT chatId FROM games');
  for (const { chatId } of chats) {
    try {
      const history = await getHistory(chatId, 10);
      const situation = await generateSituation(history.reverse());
      await addHistory(chatId, situation);
      bot.sendMessage(chatId, `${prefix}\n\n${situation}`);
      logger.info(`[${chatId}] Автоматическая ситуация отправлена.`);
    } catch (e) {
      logger.error(`[${chatId}] Ошибка при автоситуации: ${e.message}`);
    }
  }
} 