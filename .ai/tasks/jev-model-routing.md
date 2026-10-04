# Маршрутизация агентов через Jev

Status: DONE

## Цель

Сделать Jev обязательным диспетчером каждой software-engineering задачи и
исключить случайное наследование дорогой модели подагентами.

## Область работы

`AGENTS.md`, `.codex/skills/orchestrate/` и этот task-memory файл.

## Вне области работы

Application-файлы, Firebase, Google Apps Script, UI и изменение доступных
моделей платформы.

## Текущее состояние

Jev через официальный TypeSafe SDK и Polza доступен. Для этой задачи он выбрал
`MEDIUM`, `ORCHESTRATOR_ONLY`, `DETERMINISTIC_COMMANDS`, `NO_AGENT_REVIEW`.
Текущий API запуска агентов публикует Luna, Sol и Astra, но не публикует Terra,
хотя Terra предусмотрена skill и может отображаться в пользовательском UI.

## Принятые решения

- Один обязательный bounded-вызов Jev выполняется до реализации/делегирования.
- Jev получает только реально callable модели и выбирает минимальную модель на
  каждую роль; fallback всегда сообщается.
- Terra — предпочтительная implementation-модель, когда её идентификатор
  доступен launcher. Иначе routine-код получает Luna medium, сложный — не выше
  GPT-5.6 Sol.
- Тесты выполняются командами без агента, если этого достаточно; иначе первым
  выбирается Luna low.

## Связанные файлы

`AGENTS.md`, `.codex/skills/orchestrate/SKILL.md`,
`.codex/skills/orchestrate/README.md`,
`.codex/skills/orchestrate/agents/openai.yaml`.

## Выполнено

- Проверены официальный TypeSafe SDK и переменные окружения без вывода секретов.
- Получено bounded routing-решение Jev для текущей задачи.
- Подготовлены правила обязательного routing и явного выбора моделей.
- Обновлены `AGENTS.md`, skill, его README и default prompt.

## Следующий шаг

Применять новый routing со следующей software-engineering задачи. Если launcher
начнёт публиковать Terra, передавать Jev её точный model identifier.

## Проверка

`git diff --check`, проверка YAML и точечные assertions обязательного Jev,
Terra fallback, Luna tester, implementation cap и запрета неявного наследования
дорогой модели прошли.

## Открытые вопросы и риски

Terra нельзя запустить из этой сессии, пока launcher не опубликует её точный
model identifier. Отображение модели в UI само по себе не даёт API-доступа.

## Последнее обновление

2026-10-04: routing policy обновлена и проверена.
