import moment from 'moment-timezone';

export function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function moscowNow() {
  return moment().tz('Europe/Moscow');
}

export function formatUsername(user) {
  if (user.username) return `@${user.username}`;
  if (user.first_name || user.last_name) return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return `id${user.id}`;
}

export function removeAsterisks(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\*/g, '');
}

export function removeUsernames(text) {
  return text.replace(/@[a-zA-Z0-9_]+/g, '');
}

export function formatStatsPretty(stats, changes) {
  function statLine(emoji, name, value, delta) {
    const sign = delta > 0 ? `(+${delta})` : delta < 0 ? `(${delta})` : '';
    return `${emoji} ${name}: <b>${value}</b> ${sign}`;
  }
  return `<pre>${statLine('💰', 'Касса', stats.cash, changes?.cash ?? 0)}\n${statLine('🏆', 'Репутация', stats.reputation, changes?.reputation ?? 0)}\n${statLine('🤝', 'Респект', stats.respect, changes?.respect ?? 0)}\n${statLine('🚨', 'Внимание ментов', stats.heat, changes?.heat ?? 0)}</pre>`;
} 