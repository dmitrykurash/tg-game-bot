import { askDeepSeek } from './deepseek.js';
import db from './db.js';
import logger from './logger.js';
import { moscowNow } from './utils.js';
import { removeUsernames } from './utils.js';

const MASTER_PROMPT = `Ты - Аслан "Схема", виртуальный ведущий криминального синдиката в Telegram группе.

ПЕРСОНА:
Хитрый, но добрый дагестанец-бандюган, всегда ищешь выгоду.
Говоришь с сильным кавказским акцентом: путаешь падежи, рода, добавляешь "э", "вай", "валлах".
Обращаешься ко всем "брат", "дарагой", "братищка".
Постоянно предлагаешь схемы и считаешь чужие деньги.
Любишь торговаться и шутить про деньги.

ВАЖНО:
- Не используй описания действий в стиле *улыбается*, *щурится*, *почёсывает бороду* и т.п. Пиши только как живой человек, без звёздочек и описаний жестов.
- Если в сообщении есть @username, обязательно обращайся к этому человеку по тегу (@username) в своём ответе. Не используй в своих ответах форматирование текста звездочками или жирным текстом.

ИГРОВАЯ МЕХАНИКА:
Ты ведёшь интерактивную историю про криминальный синдикат "Восемь пальцев" в России 90-х.
1-2 раза в день публикуешь ситуации БЕЗ вариантов ответа.
Игроки отвечают через реплай — что угодно, любые идеи и предложения.
Ты анализируешь ВСЕ ответы и создаёшь развитие сюжета на их основе.
Помнишь всю историю: решения, последствия, отношения с НПС.

ПАМЯТЬ И СЮЖЕТ:
Помни ВСЕ предыдущие решения и их последствия.
НПС помнят отношения с группой (майор Петров, конкуренты, крыши).
События развиваются логично из прошлых решений.
Упоминай старые долги, обещания, врагов и друзей.

АНАЛИЗ ОТВЕТОВ:
Учитывай ВСЕ реплаи от игроков.
Если идеи противоречат — создавай компромисс или конфликт.
Необычные идеи могут привести к неожиданным поворотам.
Комментируй особенно смешные или глупые предложения.

ВАЖНО:
НЕ давай готовые варианты ответов.
Жди творческие решения от игроков.
Связывай новые события с прошлыми решениями.
Оставайся в образе всегда.

ИНСТРУКЦИЯ ДЛЯ ИГРОКОВ:
— Я ведущий вашей криминальной истории.
— Чтобы начать — напишите /start.
— Я буду присылать ситуации, отвечайте на них реплаем (ответом на моё сообщение) — так ваш голос будет учтён.
— Для личного диалога со мной — упомяните меня через @ или ответьте реплаем на мой ответ.
— Я не вмешиваюсь в ваши обычные разговоры, только если вы явно обращаетесь ко мне.
— Статы банды (касса, репутация и др.) зависят от ваших решений и влияют на сюжет.
— В любой момент можно перезапустить историю через /restart или меню.

Всё просто, братва! Погнали!`;

const PROMPT_ROUND_RESULT = `Ты — Аслан "Схема", ведущий криминальной истории. Тебе нужно только подвести итог раунда, проанализировать действия игроков, последствия и статы. Не придумывай новую ситуацию, не продолжай сюжет, не задавай новых вопросов. Просто подведи итог и прокомментируй, что произошло.

ВАЖНО:
- Пиши итог живым языком, как кавказский ведущий, с акцентом и юмором.
- Не используй шаблонные списки, пункты, квадратные скобки, не пиши по пунктам.
- Не повторяй формулировки из этого промпта.
- Итог должен быть как рассказ или комментарий, а не как отчёт.
- Не вставляй шаблоны типа "1. Действия игроков", "2. Последствия" и т.д.
- Просто расскажи, что произошло, и прокомментируй, как это повлияло на банду и статы.`;

export async function getGameState(chatId) {
  const dbConn = db();
  const row = await dbConn.get('SELECT * FROM games WHERE chatId = ?', chatId);
  return row;
}

export async function setGameState(chatId, state, lastSituationId, lastSituationTime) {
  const dbConn = db();
  await dbConn.run(
    'INSERT OR REPLACE INTO games (chatId, state, lastSituationId, lastSituationTime) VALUES (?, ?, ?, ?)',
    chatId, state, lastSituationId, lastSituationTime
  );
}

export async function addHistory(chatId, event) {
  const dbConn = db();
  await dbConn.run(
    'INSERT INTO history (chatId, event, createdAt) VALUES (?, ?, ?)',
    chatId, event, moscowNow().unix()
  );
}

export async function getHistory(chatId, limit = 10) {
  const dbConn = db();
  return dbConn.all(
    'SELECT * FROM history WHERE chatId = ? ORDER BY createdAt DESC LIMIT ?',
    chatId, limit
  );
}

export async function addReply(chatId, situationId, userId, username, reply) {
  const dbConn = db();
  await dbConn.run(
    'INSERT INTO replies (chatId, situationId, userId, username, reply, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    chatId, situationId, userId, username, reply, moscowNow().unix()
  );
}

export async function getReplies(chatId, situationId) {
  const dbConn = db();
  return dbConn.all(
    'SELECT * FROM replies WHERE chatId = ? AND situationId = ?',
    chatId, situationId
  );
}

function removeStatsLines(text) {
  return text.replace(/(^|\n)(\s*\(*\s*(Касса|Репутация|Респект|Внимание ментов|Долг|Статы|Баланс)[^\n]*\)*\s*)/gmi, '\n').replace(/\n{2,}/g, '\n\n').trim();
}

function removeFakeUsernames(text) {
  // Удаляет @username1, @username2, @user1, @игрок1 и подобные шаблонные теги
  return text.replace(/@(?:username|user|игрок)\d+/gi, '').replace(/\s{2,}/g, ' ');
}

export async function generateSituation(history, stats) {
  // 20% шанс на личную ситуацию
  const isPersonal = Math.random() < 0.2;
  const promptText = isPersonal
    ? 'Сгенерируй личный или социальный вопрос для банды, который не связан напрямую с делом, а касается отношений, личных проблем или конфликтов между игроками.'
    : 'Сгенерируй новую ситуацию для синдиката.';
  const messages = [
    { role: 'system', content: MASTER_PROMPT },
    ...history.map(e => ({ role: 'user', content: e.event })),
    { role: 'user', content: promptText }
  ];
  const situation = await askDeepSeek(messages);
  return removeFakeUsernames(removeStatsLines(removeUsernames(situation)));
}

export async function generateRoundResult(history, replies) {
  const messages = [
    { role: 'system', content: PROMPT_ROUND_RESULT },
    ...history.map(e => ({ role: 'user', content: e.event })),
    { role: 'user', content: 'Ответы игроков:' },
    ...replies.map(r => ({ role: 'user', content: `${removeUsernames(r.username)}: ${removeUsernames(r.reply)}` })),
    { role: 'user', content: 'Подведи итог раунда и опиши последствия. Не придумывай новую ситуацию.' }
  ];
  return askDeepSeek(messages);
}

export async function generateComment(history, reply, username) {
  const messages = [
    { role: 'system', content: MASTER_PROMPT },
    ...history.map(e => ({ role: 'user', content: e.event })),
    { role: 'user', content: `${username}: ${reply}` },
    { role: 'user', content: 'Дай короткий саркастичный комментарий (или промолчи).' }
  ];
  return askDeepSeek(messages);
}

export async function clearGameState(chatId) {
  const dbConn = db();
  await dbConn.run('DELETE FROM games WHERE chatId = ?', chatId);
  await dbConn.run('DELETE FROM history WHERE chatId = ?', chatId);
  await dbConn.run('DELETE FROM replies WHERE chatId = ?', chatId);
  await dbConn.run('DELETE FROM relationships WHERE chatId = ?', chatId);
}

export async function getStats(chatId) {
  const dbConn = db();
  let stats = await dbConn.get('SELECT * FROM stats WHERE chatId = ?', chatId);
  if (!stats) {
    await dbConn.run('INSERT INTO stats (chatId) VALUES (?)', chatId);
    stats = await dbConn.get('SELECT * FROM stats WHERE chatId = ?', chatId);
  }
  return stats;
}

export async function updateStats(chatId, changes) {
  const dbConn = db();
  const stats = await getStats(chatId);
  const newStats = {
    cash: (stats.cash || 0) + (changes.cash || 0),
    reputation: (stats.reputation || 0) + (changes.reputation || 0),
    respect: (stats.respect || 0) + (changes.respect || 0),
    heat: (stats.heat || 0) + (changes.heat || 0)
  };
  await dbConn.run(
    'UPDATE stats SET cash = ?, reputation = ?, respect = ?, heat = ? WHERE chatId = ?',
    newStats.cash, newStats.reputation, newStats.respect, newStats.heat, chatId
  );
  return newStats;
}

export async function applyRoundEffects(chatId, roundResult) {
  const prompt = `Вот итог раунда:
${roundResult}

На основе этого итога определи, как изменились статы банды:
- cash: +/- число
- reputation: +/- число
- respect: +/- число
- heat: +/- число
Ответь в формате JSON, пример: {"cash": 50, "reputation": 1, "respect": 0, "heat": -1}`;
  const effectStr = await askDeepSeek([{ role: 'user', content: prompt }]);
  let changes = { cash: 0, reputation: 0, respect: 0, heat: 0 };
  try {
    changes = JSON.parse(effectStr.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch (e) {}
  const newStats = await updateStats(chatId, changes);
  return { changes, newStats };
} 