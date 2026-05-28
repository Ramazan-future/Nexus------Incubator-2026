# Connect4: Nexus — Details

Расширенное описание режимов, мутаций, монетизации и цен.

## 1) Основные игровые режимы

- `Classic Arena` — стандартная доска 7x6, базовые правила.
- `Nexus Lab (Sandbox)` — песочница с размером доски от 5x4 до 15x15.
- `Cyber Ranked` — соревновательный пресет с жестким темпом.
- `Sector Casual` — быстрые и более легкие матчи.
- `AI Academy` — тренировка против AI.
- `Ghost Matrix` — tactical-пресет с визуальным "обманом" и усложнением восприятия.
- `Grid Bracket` — турнирный пресет.
- `Data Node Puzzle` — puzzle-ориентированный темп и условия.
- `Tactical Hub` — тактический пресет с альтернативными условиями.
- `Discovery Mode` — упрощенный режим для обучения.

## 2) Типы матчей

- `AI` — против Minimax-бота (`easy / medium / hard`).
- `Local 1v1` — 2 игрока на одном компьютере (pass-and-play).
- `Online Beta` — матч с другом через WebSocket room (beta-формат).

## 3) Mutators (stackable)

- `Gravity Shift`
- `Wormhole Portals`
- `Tectonic Earthquake`
- `Matrix Tetris`
- `Singularity Black Hole`
- `Fog of War`
- `Mirage Tokens`
- `Chameleon`
- `Blind Sniper`
- `Minefield`
- `Gobblet Overdrive`
- `Infection Mode`
- `Laser Beam`
- `Blitz Panic`
- `Pinball Bounce`
- `Quantum Drop`

## 4) Текущий статус реализации механик

Полностью заметно в текущем геймплее:

- `Blitz Panic` (таймер + автодроп),
- `Fog of War`,
- `Chameleon`,
- режимные таймеры,
- настройка размеров доски в `Nexus Lab`,
- `AI / Local 1v1 / Online Beta` каркас.

Часть mutators уже есть в registry/UI и готовы для дальнейшего углубления физики/логики.

## 5) Supabase и аккаунт

- Реализованы `Register / Login`.
- Сохранение сессии в `localStorage`.
- Профиль, история матчей и leaderboard подключены к Supabase REST/Auth API.
- При первом входе профиль создается автоматически (upsert fallback).

## 6) Монетизация и магазин

Косметический магазин (без pay-to-win):

- скины поля,
- токены,
- эффекты,
- звуки.

Донат-пакеты Nexus Coins:

- `100 NC` — `$0.99`
- `550 NC` — `$4.99`
- `1200 NC` — `$9.99`
- `2500 NC` — `$19.99`
- `7000 NC` — `$49.99`

## 7) Кастомизация UI/текста

В `Settings` доступны:

- пресеты темы (`Dark`, `Light`, `Neon`, `Sunset`),
- кастомный background accent,
- размер шрифта,
- стиль шрифта,
- кастомные тексты для локальных игроков и главной CTA-кнопки.

Все настройки сохраняются в `localStorage`.
