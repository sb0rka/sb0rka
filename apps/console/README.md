# console

Веб-консоль платформы Sb0rka — управление проектами, базами данных, секретами; интерактивный SQL и AI-ассистент.

React 18 + Vite + TypeScript + Tailwind + Radix + TanStack Query + react-router + i18next.

Устройство фронта — [ARCHITECTURE.md](ARCHITECTURE.md). Общая картина системы — [корневой ARCHITECTURE.md](../../ARCHITECTURE.md).

## Разработка

```bash
npm install
npm run dev      # Vite dev-сервер
npm run build    # tsc + сборка
npm run lint     # eslint
```

## Конфигурация (env)

Консоль ходит на 4 бэкенда — задаются переменными `VITE_*` (см. `src/lib/api-client.ts`):

| Переменная | Назначение | Дефолт |
| --- | --- | --- |
| `VITE_API_BASE_URL` | auth-сервис (логин/refresh) | `https://auth.sb0rka.ru` |
| `VITE_RESOURCE_API_BASE_URL` | Platform API | `https://api.sb0rka.ru` |
| `VITE_QUERY_RUNNER_BASE_URL` | proxy-ql-executor (выполнение SQL) | `https://psql-executor.proxy.sb0rka.ru` |

Для локальной разработки положи их в `.env.local`. Без запущенного auth-сервиса логин не пройдёт (его нет в репозитории — см. корневой ARCHITECTURE.md).

> AI-генерация SQL работает с OpenAI-совместимым API напрямую из браузера: URL и ключ берутся из секретов проекта `LLM_BASE_URL` / `LLM_API_KEY`, а не из env консоли.
