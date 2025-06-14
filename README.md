# Aslan "Skhema" Telegram Bot

Telegram-бот для групповых D&D-историй с кавказским колоритом и чёрным юмором.

## Функционал
- Ведёт криминальный синдикат "Восемь пальцев" в стиле 90-х
- Генерирует ситуации и комментарии с помощью DeepSeek API
- Хранит историю и состояние по chatId (SQLite)
- Работает в нескольких группах одновременно
- Автоматически публикует новые ситуации утром и вечером (node-cron)
- Поддержка Railway (или любого Node.js-хостинга)

## Запуск локально

1. Клонируйте репозиторий:
   ```bash
   git clone <your-repo-url>
   cd aslan-bot
   ```
2. Установите зависимости:
   ```bash
   npm install
   ```
3. Создайте файл `.env` на основе `.env.example` и заполните токены.
4. Запустите бота:
   ```bash
   npm start
   ```

## Деплой на Railway

1. Зарегистрируйтесь на [Railway](https://railway.app/).
2. Создайте новый проект, выберите "Deploy from GitHub" и подключите репозиторий.
3. В настройках проекта Railway добавьте переменные окружения из `.env.example`.
4. Railway автоматически установит зависимости и запустит `npm start`.

## Структура проекта

```
aslan-bot/
├── src/
│   ├── bot.js
│   ├── commands.js
│   ├── gameLogic.js
│   ├── deepseek.js
│   ├── db.js
│   ├── cron.js
│   ├── logger.js
│   └── utils.js
├── .env.example
├── package.json
├── README.md
└── database.sqlite
```

## Лицензия
MIT 

## Миниприложение-хронология

- Миниапп и API работают из одного процесса вместе с ботом.
- Просто деплой на Railway, как обычно (`npm start`).
- В чате напиши /miniapp — бот пришлёт ссылку на миниприложение с хронологией событий.
- API: /api/history?chatId=... — отдаёт историю чата.
- Миниапп: /miniapp.html?chatId=... — открывает хронологию. 