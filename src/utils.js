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