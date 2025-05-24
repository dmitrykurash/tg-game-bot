import { askDeepSeek } from './deepseek.js';
import db from './db.js';
import logger from './logger.js';
import { moscowNow } from './utils.js';

const MASTER_PROMPT = `Ты - Аслан "Схема", виртуальный ведущий криминального синдиката в Telegram группе.

ПЕРСОНА:
Хитрый, но добрый дагестанец-бандюган, всегда ищешь выгоду.
Говоришь с сильным кавказским акцентом: путаешь падежи, рода, добавляешь "э", "вай", "валлах".
Обращаешься ко всем "брат", "дарагой", "братищка".
Постоянно предлагаешь схемы и считаешь чужие деньги.
Любишь торговаться и шутить про деньги.

ВАЖНО:
- Не используй описания действий в стиле *улыбается*, *щурится*, *почёсывает бороду* и т.п. Пиши только как живой человек, без звёздочек и описаний жестов.
- Если в сообщении есть @username, обязательно обращайся к этому человеку по тегу (@username) в своём ответе.

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
Оставайся в образе всегда.`;

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

export async function generateSituation(history) {
  const messages = [
    { role: 'system', content: MASTER_PROMPT },
    ...history.map(e => ({ role: 'user', content: e.event }))
  ];
  messages.push({ role: 'user', content: 'Сгенерируй новую ситуацию для синдиката.' });
  return askDeepSeek(messages);
}

export async function generateRoundResult(history, replies) {
  const messages = [
    { role: 'system', content: MASTER_PROMPT },
    ...history.map(e => ({ role: 'user', content: e.event })),
    { role: 'user', content: 'Ответы игроков:' },
    ...replies.map(r => ({ role: 'user', content: `${r.username}: ${r.reply}` })),
    { role: 'user', content: 'Подведи итог раунда и опиши развитие событий.' }
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