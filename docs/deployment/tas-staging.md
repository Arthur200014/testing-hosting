# TAS — изолированный staging PostgreSQL + ASP.NET API (M02-01)

**Статус:** подготовлена воспроизводимая конфигурация. **Фактический VPS/Timeweb и публичный HTTPS ещё НЕ проверены**. Это не production и не разрешение переносить живых учеников.

## Архитектура

```text
Internet :80/:443 -> Caddy (ingress network) -> ASP.NET API :8080
                                           API (database network) -> PostgreSQL 17
PostgreSQL (database/internal network) -> НЕ имеет опубликованного порта
```

- `compose.yaml` — исходная проверенная локальная конфигурация, не изменена.
- `compose.staging.yaml` — отдельный overlay: `db/migrate/importers` только в internal `database` network; `api` доступен из `ingress` и `database`; `caddy` — только из `ingress`.
- Caddy управляет TLS-сертификатами и HTTP→HTTPS. API из базового compose по-прежнему доступен **только с loopback VPS** через `127.0.0.1:${API_PORT}`, не из Интернета. PostgreSQL **никогда** не публикует 5432.
- Docker volume `postgres-data` сохраняет staging DB. Дополнительные `caddy-data` и `caddy-config` сохраняют TLS. **Это не резервное копирование** — M02-03 отдельно.
- Преподаватели и предметы изолируются приложением; составная схема `Subject/Enrollment` ещё не мигрирована. Staging не должен содержать реальные данные учеников.

## Требования к VPS (Timeweb VPS или другой выделенный сервер с Docker Compose)

Один принадлежащий владельцу домен вида `api-staging.example.org` с A/AAAA DNS на IP VPS; доступ администратора по SSH; Docker Engine + **Docker Compose v2**, Python 3 и `curl` на Linux-хосте. Открыть firewall **только TCP 80/443 и ограниченный по IP SSH 22**; 443/udp опционален. Не открывать PostgreSQL 5432, API 8080/18080 или pgAdmin.

Если выбран управляемый Timeweb App с ограниченной Docker-конфигурацией, **этот overlay там может быть недоступен**; нужен VPS, где разрешены собственные compose-сервисы, сети, persistent volumes и порты. Предыдущая [попытка Timeweb](../../.ai/tasks/timeweb-deployment.md) была BLOCKED — не считать сервер работающим без нового доступа/health checks.

## Создать секреты *на сервере*, вне Git

Из корня checkout репозитория на staging VPS:

```bash
umask 077
cp .env.staging.example .env.staging
chmod 600 .env.staging
# Вручную задать реальный STAGING_DOMAIN и значения .env.staging.
# Секреты генерировать независимо, например:
openssl rand -hex 24
openssl rand -base64 48
openssl rand -base64 48
# Не копировать вывод генератора в чат, Git или логи. Не сохранять секреты в shell history.
```

Заполнить `POSTGRES_PASSWORD` (минимум 16 случайных символов), `JWT_SIGNING_KEY` и `STUDENT_CODE_PEPPER` (**разные**, Base64 минимум 32 байта), `PGADMIN_DEFAULT_PASSWORD` отдельным случайным значением. CORS — точный HTTPS origin клиентского сайта, **не `*`**. Примерный `STAGING_DOMAIN=staging.example.invalid` обязательно заменить на своё имя до запуска.

```bash
bash platform/scripts/staging-preflight.sh .env.staging
```

Скрипт делает проверку Docker Compose без распечатки секрета: отсутствие открытого порта PostgreSQL, internal network, loopback API, HTTPS ingress, заглушек и коротких/совпадающих секретов. Если он сообщает ошибку — не выполнять дальнейшее развёртывание.

## Развёртывание только staging

```bash
# В корне приватного checkout на VPS
dc=(docker compose --env-file .env.staging -f compose.yaml -f compose.staging.yaml)

# Образ API и одноразовой миграции строится из существующего backend.
"${dc[@]}" build api migrate
"${dc[@]}" up -d db
"${dc[@]}" run --rm migrate

# Только после успешного выхода мигратора:
"${dc[@]}" up -d --no-deps api caddy

# Сначала loopback (не через Интернет), затем через свой HTTPS-домен:
curl --fail --silent --show-error http://127.0.0.1:18080/health/live
curl --fail --silent --show-error http://127.0.0.1:18080/health/ready
curl --fail --silent --show-error https://YOUR_STAGING_DOMAIN/health/ready
```

Caddy выпускает сертификат только если DNS и входящие TCP 80/443 уже настроены и домен принадлежит владельцу. `/health/ready` подтверждает соединение с БД, **но не целостность всех таблиц**; успешный выход отдельного мигратора — отдельное обязательное условие.

**Не запускать** `docker compose down -v` или `docker volume rm`: это удаляет PostgreSQL-данные. Для остановки использовать `"${dc[@]}" stop`, для проверки сервисов — `"${dc[@]}" ps`. Пароли из `.env.staging` не отправлять в issue, PR или chat.

## Проверка и эксплуатационная граница

- CI [staging-config.yml](../../.github/workflows/staging-config.yml) проверяет структуру Docker Compose и синтаксис Caddy **только на синтетическом примере**. Прохождение CI не подтверждает развёртывание VPS.
- Настоящий server PASS для M02-01 требует одновременно: SSH-доступ к выбранному VPS, приватный volume PG, `db` без published ports, `api` без публичного 8080, запуск из staging env, успешный ответ по HTTPS на своём домене. DNS/сертификат/сервер остаются `NOT_RUN` без доступа.
- M02-02: проверка repeatable startup/migrate и фактического `/health/live`/`/health/ready` после рестарта. M02-03: отдельные backup+restore, ротация/мониторинг, проверка восстановления на **другой** БД.
- **Никакого импорта из Google Sheets и подключения `manage.html`**: production GAS остаётся единственным источником записи до завершения M03–M05 и отдельного разрешения владельца.
