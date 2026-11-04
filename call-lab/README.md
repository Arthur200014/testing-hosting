# Call Lab — тест видеосвязи и Яндекс Телемоста

Сайт: https://arthur200014.github.io/testing-hosting/call-lab/
Код: https://github.com/Arthur200014/testing-hosting/tree/main/call-lab

## Что работает
- Собственная видеосвязь в браузере: WebRTC + PeerJS, до 2 человек, камера/микрофон/экран, ссылка-приглашение, выход.
- Яндекс Телемост: кнопка создания настоящей встречи через отдельный Node.js-сервер; ссылка `join_url`, копирование, вход во встречу.
- На GitHub Pages работает только статическая часть. Яндекс API **не заработает**, пока не поднят backend и не прописан адрес API-сервера в форме.
- Для API нужен токен с разрешением `telemost-api:conferences.create`. Он никогда не добавляется в публичный GitHub.

## 1. Проверить токен на Mac (простейший способ)
Открой Terminal:
```bash
git clone https://github.com/Arthur200014/testing-hosting.git
cd testing-hosting/call-lab
bash test-token.sh
```
Вставь OAuth-токен в терминал: ввод скрыт. При успехе Яндекс ответит HTTP 201 и вернёт `join_url` (тест создаст реальную встречу). При 401/403 смотри JSON ошибки. Не присылай токен и не публикуй вывод с секретами.

## 2. Запуск полного сайта локально (Mac)
В той же папке:
```bash
bash start-local.sh
```
Скрипт скрыто запросит OAuth-токен и отдельный `ADMIN_PIN` (не менее 8 символов) и запустит Node.js-сервер. Секреты останутся в окружении текущего процесса и не записываются в файлы.
Затем открой http://localhost:3000, раскрой «Создать встречу через Яндекс Телемост». Оставь поле адреса API-сервера пустым, введи `ADMIN_PIN`, нажми кнопку создания. Получишь реальную ссылку на встречу. Требуется Node.js 20+.

## 3. Публичный запуск через Dokku
В GitHub Pages нельзя хранить OAuth-токен или запускать Node.js. Для публичной кнопки Телемоста нужен HTTPS-сервер; можно использовать уже настроенную виртуальную машину с Dokku.

На ВМ с Dokku создайте приложение:
```bash
sudo dokku apps:create call-lab
```
Настрой секреты **на виртуальной машине**, а не в GitHub, через `dokku config:set call-lab TELEMOST_TOKEN=... ADMIN_PIN=... ALLOWED_ORIGINS=https://arthur200014.github.io`. Учти, что явные секреты в команде могут попасть в shell history: для безопасного ввода используй `read -s` и передавай значение из переменной. Выбери длинный `ADMIN_PIN`. Убедись, что настроены домен и HTTPS (сертификат).

На компьютере с SSH-доступом к Dokku:
```bash
git clone https://github.com/Arthur200014/testing-hosting.git
cd testing-hosting
git subtree split --prefix=call-lab -b call-lab-deploy
git push dokku@YOUR_SERVER:call-lab call-lab-deploy:master
```
`YOUR_SERVER` — адрес твоей Dokku VM, а команда требует SSH-доступа к ней. После развёртывания в форме на GitHub Pages укажи HTTPS-адрес этого сервера и `ADMIN_PIN`.

## Техническая схема
Браузер (публичный статический сайт) -> HTTPS POST на `/api/telemost/create` с `X-Admin-Pin` -> Node.js backend (читает `TELEMOST_TOKEN` из окружения) -> POST `https://cloud-api.yandex.net/v1/telemost-api/conferences` с `{ "waiting_room_level": "PUBLIC" }` и `Authorization: OAuth ...` -> возвращает только `id` и `join_url`.

Для создания встреч Телемоста нужно быть уверенным, что пользователь имеет доступ к API; хотя документация конкретного метода допускает личный Яндекс ID, общий раздел описывает ограничение для бизнес-аккаунтов. Реальный ответ решает этот вопрос.

**Ограничение:** кнопка «Завершить для всех» реализована в собственном WebRTC-режиме, но не для Яндекс Телемоста. API создания/просмотра/изменения встреч не предоставляет задокументированного принудительного отключения всех участников.

## API
- `GET /api/health` — статус Node.js-сервера и конфигурации (без секретов).
- `POST /api/telemost/create` — создание встречи, требует заголовок `X-Admin-Pin`.
- `TELEMOST_TOKEN` — обязательный секрет серверного процесса; `ADMIN_PIN` — второй обязательный секрет.
- `ALLOWED_ORIGINS` — список допустимых браузерных origin, через запятую; по умолчанию адрес GitHub Pages и localhost.

**Не отправляй OAuth-токен в чат или браузерную форму; не добавляй `.env` в GitHub.**
