# Архитектура веб-консоли

Внутреннее устройство `apps/console`. Общая картина системы — в [корневом ARCHITECTURE.md](../../ARCHITECTURE.md).

## Стек

React 18 + Vite + TypeScript + Tailwind. UI — Radix + `class-variance-authority`. Данные с сервера — TanStack Query. Роутинг — react-router 7. Локализация — i18next (ru/en).

## Структура

Feature-based: `src/features/<feature>/` — на фичу свои `api.ts` (HTTP-вызовы), `hooks.ts` (TanStack Query), компоненты.

```
src/
├── App.tsx                 маршруты + провайдеры (Query, Auth, Theme, Toast, Confirm)
├── features/
│   ├── auth/               логин/регистрация, AuthProvider, RequireAuth
│   ├── projects/           основной модуль: проекты, БД, секреты, теги, data-explorer, AI-SQL
│   ├── subscription/       планы/квоты
│   └── user/               профиль
├── components/
│   ├── ui/                 общие примитивы (Radix + cva)
│   └── layout/             каркас (header, sidebar, app-layout)
└── lib/
    ├── api-client.ts       HTTP-ядро: 4 базовых URL + refresh токена
    ├── query-client.ts     конфиг TanStack Query
    ├── auth-store.ts        хранение токена
    └── i18n.ts             i18next
```

## Данные и HTTP

Весь HTTP идёт через `src/lib/api-client.ts` — он знает про **четыре бэкенда** (env `VITE_*`):

| Базовый URL | Назначение | Эндпоинты |
| --- | --- | --- |
| `VITE_API_BASE_URL` (auth) | auth-сервис | `/auth/login`, `/signup`, `/refresh`, `/user` |
| `VITE_RESOURCE_API_BASE_URL` | Platform API (`apps/api`) | проекты, БД, секреты, теги |
| `VITE_QUERY_RUNNER_BASE_URL` | proxy-ql-executor | `/query` (выполнение SQL) |
| `VITE_NL2SQL_BASE_URL` | nl2sql | NL→SQL для AI-фичи |

Клиент сам обновляет access-токен через `/auth/refresh` при 401. Новые вызовы добавляются туда, базовые адреса не дублируются. Данные с сервера запрашиваются только через TanStack Query (`hooks.ts`), не голым `fetch` в компонентах.

## AI-генерация SQL

Заметная фича в `features/projects` (`ai-query-chat-*`, `use-ai-query-chat.ts`, `api.ts`): ассистент, генерирующий и правящий SQL. Работает с **OpenAI-совместимым API напрямую из браузера** — пользователь задаёт свой `LLM_BASE_URL` + `LLM_API_KEY`. Уровни «reasoning» (low/medium/high) определяют число проходов: генерация → проверка корректности → оптимизация → объяснение. Сгенерированный SQL выполняется через proxy-ql-executor.

> `api.ts` и `use-ai-query-chat.ts` в этом модуле крупные и со сложным состоянием — кандидаты на рефакторинг (см. план улучшений).

## Конвенции

- Любой пользовательский текст — через i18next (ru и en сразу), без захардкоженных строк в JSX.
- Общий UI — в `components/ui` (не плодить дубли кнопок/диалогов).
- Запуск: `npm run dev` (Vite). Без auth-сервиса логин не пройдёт — см. [корневой ARCHITECTURE.md](../../ARCHITECTURE.md).
