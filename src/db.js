import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

export async function initDB() {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      chatId TEXT PRIMARY KEY,
      state TEXT,
      lastSituationId INTEGER,
      lastSituationTime INTEGER
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT,
      event TEXT,
      createdAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS relationships (
      chatId TEXT,
      npc TEXT,
      status TEXT,
      PRIMARY KEY (chatId, npc)
    );
    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT,
      situationId INTEGER,
      userId TEXT,
      username TEXT,
      reply TEXT,
      createdAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS stats (
      chatId TEXT PRIMARY KEY,
      cash INTEGER DEFAULT 100,
      reputation INTEGER DEFAULT 0,
      respect INTEGER DEFAULT 0,
      heat INTEGER DEFAULT 0
    );
  `);
}

export default () => db; 