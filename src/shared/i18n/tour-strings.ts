import type { Tree } from "./tree";

/** Copy for the guided tours: [English, Russian, Chinese]. */
export const tourStrings = {
  skip: ["Skip tour", "Пропустить", "跳过"],
  showMe: ["Show me around", "Показать, где что", "带我看看"],
  done: ["Got it!", "Понятно!", "明白了！"],
  whatHere: ["What you can do here", "Что здесь можно делать", "这里可以做什么"],
  replay: ["Show the guided tour", "Показать тур по разделу", "显示引导"],
  welcomeTitle: ["Welcome to Bloom 🌱", "Добро пожаловать в Bloom 🌱", "欢迎来到 Bloom 🌱"],
  welcomeBody: ["How well do you know Bloom?", "Насколько хорошо ты знаешь Bloom?", "你对 Bloom 熟悉吗？"],
  newbie: ["I'm new here — show me everything", "Я тут впервые — покажи всё", "我是新来的，带我了解一切"],
  newbieBody: ["A short friendly tour in every space: what it's for and where to tap.", "Короткий тур в каждом разделе: зачем он и куда нажимать.", "每个空间都有简短引导：它的用途和该点哪里。"],
  recommended: ["Recommended", "Рекомендуется", "推荐"],
  expert: ["I'm already a seasoned bloomer", "Я уже опытный блумер", "我已经是资深 Bloomer"],
  expertBody: ["Skip the tours. You can turn them on in Settings.", "Без туров. Их можно включить в настройках.", "跳过引导，可在设置中重新开启。"],
  settingsTitle: ["Guided tours", "Туры-подсказки", "引导提示"],
  settingsOn: ["Show a tour the first time I open a space", "Показывать тур при первом входе в раздел", "首次进入空间时显示引导"],
  settingsReset: ["Replay all tours", "Пройти все туры заново", "重新查看所有引导"],
  settingsResetDone: ["Tours will show again in every space", "Туры снова появятся в каждом разделе", "每个空间都会再次显示引导"],

  home: {
    intro: {
      t: ["This is your Today screen", "Это экран «Сегодня»", "这是「今天」页面"],
      b: ["Everything that matters today is collected here, so you rarely need to go anywhere else.", "Здесь собрано всё главное на сегодня — чаще всего больше никуда ходить не нужно.", "今天最重要的事都汇集在这里，通常无需再去别处。"],
      list: [
        ["See your day's progress and the next small step", "Видеть прогресс дня и следующий маленький шаг", "查看今日进度和下一小步"],
        ["Log mood and energy in one tap", "Отмечать настроение и энергию в одно касание", "一键记录心情和精力"],
        ["Pick your Top 3 tasks and tick habits", "Выбирать Топ‑3 задачи и отмечать привычки", "选出三件要事、打卡习惯"],
        ["Start a focus timer and water your plant", "Запускать таймер фокуса и растить растение", "开启专注计时，培育你的植物"],
        ["Open any of the 9 spaces", "Открывать любое из 9 пространств", "进入 9 个空间中的任何一个"],
      ],
    },
    day: {
      t: ["Your day at a glance", "Твой день одним взглядом", "一眼看清今天"],
      b: ["The ring counts today's small steps: mood, Top 3, habits and the evening review. Below it Bloom suggests the next step — tap it and it takes you right there.", "Кольцо считает маленькие шаги дня: настроение, Топ‑3, привычки и вечерний итог. Ниже Bloom подсказывает следующий шаг — нажми, и он сразу туда приведёт.", "圆环统计今天的小步骤：心情、三件要事、习惯和晚间复盘。下方是 Bloom 建议的下一步，点一下就会带你过去。"],
    },
    checkin: {
      t: ["How are you?", "Как ты?", "你好吗？"],
      b: ["Tap a face to log your mood and pick your energy from 1 to 5. Takes 3 seconds and later shows you what affects how you feel.", "Нажми на лицо, чтобы отметить настроение, и выбери энергию от 1 до 5. Это 3 секунды, а потом Bloom покажет, что влияет на твоё самочувствие.", "点一个表情记录心情，再选择 1–5 的精力值。只需 3 秒，之后 Bloom 会告诉你什么影响了你的感受。"],
    },
    top: {
      t: ["Top 3 for today", "Топ‑3 на сегодня", "今日三件要事"],
      b: ["Write up to three things that would make today good. Type and press Enter. Everything else can wait in Tasks.", "Запиши до трёх дел, которые сделают день хорошим. Напиши и нажми Enter. Всё остальное подождёт в «Задачах».", "写下最多三件能让今天美好的事，输入后按回车。其余的可以在「任务」里等待。"],
    },
    habits: {
      t: ["Today's habits", "Привычки на сегодня", "今日习惯"],
      b: ["Tap the circle on the right to tick a habit. The ⋯ button opens the “minimum version” for hard days.", "Нажми на кружок справа, чтобы отметить привычку. Кнопка ⋯ открывает «минимальную версию» для тяжёлых дней.", "点击右侧圆圈即可打卡。⋯ 按钮可打开低谷日的「最小版本」。"],
    },
    focus: {
      t: ["Focus in one tap", "Фокус в одно касание", "一键专注"],
      b: ["Press play to start a Pomodoro right from here. Tap the card to open the full timer.", "Нажми «плей», чтобы запустить помодоро прямо отсюда. Нажми на карточку — откроется полный таймер.", "点击播放即可在这里开始番茄钟。点击卡片打开完整计时器。"],
    },
    garden: {
      t: ["Your plant", "Твоё растение", "你的植物"],
      b: ["Everything you do earns points, and the plant grows through 8 stages. Points can be spent on rewards you choose.", "Всё, что ты делаешь, приносит очки, и растение проходит 8 стадий роста. Очки можно тратить на свои награды.", "你做的每件事都会获得积分，植物会经历 8 个成长阶段。积分可兑换你自己设定的奖励。"],
    },
    evening: {
      t: ["Evening review", "Итог дня", "晚间复盘"],
      b: ["In the evening answer three short questions — what went well, what was hard, the next small step. Two minutes that make tomorrow easier.", "Вечером ответь на три коротких вопроса: что получилось, что было сложно, какой следующий шаг. Две минуты, которые облегчают завтра.", "晚上回答三个小问题：什么顺利、什么困难、下一小步是什么。两分钟，让明天更轻松。"],
    },
    spaces: {
      t: ["All 9 spaces", "Все 9 пространств", "全部 9 个空间"],
      b: ["Each card is a whole section of Bloom with its own tour. The little label shows live numbers, so you see what's going on without opening it.", "Каждая карточка — целый раздел Bloom со своим туром. Маленькая плашка показывает живые цифры, чтобы видеть, что происходит, не открывая раздел.", "每张卡片都是 Bloom 的一个完整空间，并有自己的引导。小标签显示实时数据，无需打开就能了解情况。"],
    },
    create: {
      t: ["Add anything", "Добавить что угодно", "随手添加"],
      b: ["This button is the quickest way to add a task, habit, goal, mood, journal entry, countdown or good thing — from any screen.", "Эта кнопка — самый быстрый способ добавить задачу, привычку, цель, настроение, запись в дневник, отсчёт или хорошее — с любого экрана.", "这个按钮能在任何页面快速添加任务、习惯、目标、心情、日记、倒计时或美好小事。"],
    },
    nav: {
      t: ["Getting around", "Навигация", "如何切换"],
      b: ["Today, Habits and Tasks are always one tap away. “All” opens every space plus Settings. Each space has a “?” that explains it again.", "«Сегодня», «Привычки» и «Задачи» всегда в одно касание. «Всё» открывает все пространства и настройки. В каждом разделе есть «?», который объяснит его ещё раз.", "「今天」「习惯」「任务」随时一键可达。「全部」打开所有空间和设置。每个空间都有「?」可再次查看说明。"],
    },
  },

  goals: {
    intro: {
      t: ["Goals & countdowns", "Цели и отсчёты", "目标与倒计时"],
      b: ["Turn big dreams into steps small enough for today.", "Превращай большие мечты в шаги, которые помещаются в сегодня.", "把大梦想变成今天就能完成的小步骤。"],
      list: [
        ["Set goals for a year, quarter, month or week", "Ставить цели на год, квартал, месяц или неделю", "设定年、季、月、周目标"],
        ["Break a goal into smaller goals and steps", "Разбивать цель на цели поменьше и шаги", "把目标拆成子目标和步骤"],
        ["Progress bars fill in by themselves", "Прогресс считается сам", "进度条自动更新"],
        ["Link habits that feed a goal", "Привязывать привычки, которые ведут к цели", "关联推动目标的习惯"],
        ["Count down to exams, trips and birthdays", "Вести обратный отсчёт до экзамена, поездки, дня рождения", "倒数考试、旅行和生日"],
      ],
    },
    tabs: {
      t: ["Goals or countdowns", "Цели или отсчёты", "目标或倒计时"],
      b: ["Switch here between your goals and the countdowns to important dates.", "Здесь переключаешься между целями и обратными отсчётами до важных дат.", "在这里切换目标与重要日期倒计时。"],
    },
    ladder: {
      t: ["The goal ladder", "Лестница целей", "目标阶梯"],
      b: ["A year goal holds month goals, a month goal holds week goals, and weeks hold steps for today. Small enough to actually start.", "Цель на год содержит цели на месяц, месяц — цели на неделю, а неделя — шаги на сегодня. Достаточно маленькие, чтобы реально начать.", "年度目标包含月度目标，月度包含周目标，周目标包含今天的步骤。小到足以真正开始。"],
    },
    card: {
      t: ["A goal card", "Карточка цели", "目标卡片"],
      b: ["Tap a goal to open it: tick steps, add a smaller goal, link habits, set progress or mark it achieved.", "Нажми на цель, чтобы открыть её: отмечать шаги, добавить цель поменьше, привязать привычки, задать прогресс или отметить достигнутой.", "点击目标即可打开：勾选步骤、添加子目标、关联习惯、设置进度或标记完成。"],
    },
    add: {
      t: ["Create a goal", "Создать цель", "创建目标"],
      b: ["Name it, say why it matters, pick an icon and a deadline and add the first steps. Start with just one goal.", "Дай название, напиши, почему это важно, выбери иконку, срок и первые шаги. Начни с одной цели.", "写下名称和意义，选择图标、截止日期并添加第一步。先从一个目标开始。"],
    },
    help: {
      t: ["Need a reminder?", "Нужно напомнить?", "需要提醒？"],
      b: ["The “?” button explains this space again and can replay this tour any time.", "Кнопка «?» снова объяснит раздел и может повторить этот тур в любой момент.", "「?」按钮会再次说明这个空间，并可随时重播引导。"],
    },
  },

  habits: {
    intro: {
      t: ["Habits", "Привычки", "习惯"],
      b: ["Small actions you repeat, tracked kindly — a missed day never ruins everything.", "Маленькие повторяющиеся действия, которые отслеживаются бережно, — один пропуск ничего не рушит.", "温柔地追踪重复的小行动——错过一天不会毁掉一切。"],
      list: [
        ["Tick habits daily or on chosen weekdays", "Отмечать привычки каждый день или в выбранные дни", "每天或在指定日子打卡"],
        ["Count habits like “8 glasses of water”", "Считать привычки вроде «8 стаканов воды»", "计数型习惯，如「8 杯水」"],
        ["A minimum version for bad days keeps the chain", "«Минимум» для плохих дней сохраняет цепочку", "低谷日的「最小版本」保住连续"],
        ["Make up a forgotten day", "Восстанавливать забытый день", "补打漏掉的一天"],
        ["Streaks, best streak and an 18-week heatmap", "Серии, рекорд и календарь за 18 недель", "连续天数、最佳纪录与 18 周热力图"],
        ["Vacation mode freezes streaks", "Режим отпуска замораживает серии", "假期模式冻结连续天数"],
      ],
    },
    hero: {
      t: ["Today's progress", "Прогресс дня", "今日进度"],
      b: ["How many planned habits you've done today and your strongest current streak.", "Сколько запланированных привычек уже сделано сегодня и твоя самая длинная текущая серия.", "今天已完成多少计划中的习惯，以及当前最长的连续天数。"],
    },
    item: {
      t: ["A habit", "Привычка", "一个习惯"],
      b: ["Tap the name to open its page with the heatmap, streaks and settings. The 🔥 number is the streak; the little bars are the last 7 days.", "Нажми на название — откроется страница с календарём, сериями и настройками. Число с 🔥 — серия, полоски — последние 7 дней.", "点击名称可打开详情页，含热力图、连续天数和设置。🔥 数字是连续天数，小条是最近 7 天。"],
    },
    check: {
      t: ["Tick it off", "Отметить", "打卡"],
      b: ["Tap the circle when it's done. For counted habits each tap adds one, and the ring fills up. Tap a full one again to undo.", "Нажми на кружок, когда сделано. Для привычек со счётчиком каждое нажатие добавляет одну единицу, и кольцо заполняется. Повторное нажатие отменяет.", "完成后点击圆圈。计数型习惯每点一次加一，圆环逐渐填满。再次点击可撤销。"],
    },
    menu: {
      t: ["The ⋯ menu", "Меню ⋯", "⋯ 菜单"],
      b: ["Here is the “minimum version” for hard days — 5 minutes still keeps your streak. You can also undo today or open details.", "Здесь «минимальная версия» для тяжёлых дней — 5 минут тоже сохраняют серию. Ещё можно снять отметку или открыть подробности.", "这里有低谷日的「最小版本」——5 分钟也能保住连续。也可以撤销今天或打开详情。"],
    },
    week: {
      t: ["Your week", "Твоя неделя", "你的一周"],
      b: ["Each square is a day. Forgot to tick yesterday? Tap that square to make it up. Green — done, light — minimum, blue — rest.", "Каждый квадрат — день. Забыла отметить вчера? Нажми на квадрат — отметка восстановится. Зелёный — сделано, светлый — минимум, голубой — отдых.", "每个方格是一天。昨天忘了打卡？点那个方格即可补卡。绿色是完成，浅色是最小版本，蓝色是休息。"],
    },
    vacation: {
      t: ["Vacation mode", "Режим отпуска", "假期模式"],
      b: ["Going away or ill? Switch this on — streaks freeze instead of breaking. Switch it off when you're back.", "Уезжаешь или заболела? Включи — серии замрут, а не сгорят. Выключи, когда вернёшься.", "出门或生病？打开它，连续天数会冻结而不是中断。回来后再关闭。"],
    },
    add: {
      t: ["Add a habit", "Добавить привычку", "添加习惯"],
      b: ["Pick a ready idea (water, reading, early rise…) or create your own: icon, color, days, times per day and the minimum version.", "Выбери готовую идею (вода, чтение, ранний подъём…) или создай свою: иконка, цвет, дни, сколько раз в день и минимальная версия.", "选择现成的点子（喝水、阅读、早起…）或自定义：图标、颜色、日期、每日次数和最小版本。"],
    },
    help: {
      t: ["Need a reminder?", "Нужно напомнить?", "需要提醒？"],
      b: ["The “?” button explains this space again and can replay this tour any time.", "Кнопка «?» снова объяснит раздел и может повторить этот тур в любой момент.", "「?」按钮会再次说明这个空间，并可随时重播引导。"],
    },
  },

  tasks: {
    intro: {
      t: ["Tasks & focus", "Задачи и фокус", "任务与专注"],
      b: ["A calm way to plan the day without a to-do list that never ends.", "Спокойный способ планировать день без бесконечного списка дел.", "不被无尽清单压垮的从容规划方式。"],
      list: [
        ["Top 3 — the things that matter most today", "Топ‑3 — самое важное на сегодня", "三件要事——今天最重要的事"],
        ["A to-do list; unfinished tasks wait for you", "Список дел; незаконченное не пропадает", "待办清单，未完成的会保留"],
        ["Priority matrix: urgent vs important", "Матрица приоритетов: срочно или важно", "四象限：紧急与重要"],
        ["Day plan with time blocks", "План дня по часам", "按时间块规划一天"],
        ["Projects with steps and progress", "Проекты с шагами и прогрессом", "带步骤和进度的项目"],
        ["Pomodoro timer for any task", "Помодоро‑таймер для любой задачи", "为任何任务开启番茄钟"],
      ],
    },
    focus: {
      t: ["Focus timer", "Таймер фокуса", "专注计时"],
      b: ["Opens the Pomodoro timer, your focus stats and a kind log for procrastination.", "Открывает помодоро‑таймер, статистику фокуса и добрый журнал прокрастинации.", "打开番茄钟、专注统计和温柔的拖延日志。"],
    },
    tabs: {
      t: ["Four views", "Четыре вида", "四种视图"],
      b: ["Today — Top 3 and the list. Matrix — sort by urgent/important. Day plan — tasks on a timeline. Projects — bigger things with steps.", "Сегодня — Топ‑3 и список. Матрица — по срочности и важности. План дня — задачи на шкале времени. Проекты — большие дела с шагами.", "今天——三件要事和清单。四象限——按紧急/重要排序。日程——时间轴上的任务。项目——带步骤的大事。"],
    },
    quick: {
      t: ["Add in a second", "Добавить за секунду", "一秒添加"],
      b: ["Type and press Enter. Tap a task later to add a time, a day, a priority or a project.", "Напиши и нажми Enter. Потом нажми на задачу, чтобы добавить время, день, приоритет или проект.", "输入后按回车。之后点击任务即可添加时间、日期、优先级或项目。"],
    },
    top: {
      t: ["Your Top 3", "Твой Топ‑3", "你的三件要事"],
      b: ["Tap the ★ on any task to put it here. Only three fit — that's the point.", "Нажми ★ у любой задачи, чтобы поставить её сюда. Помещается только три — в этом и смысл.", "点击任意任务的 ★ 即可放到这里。只能放三件——这正是重点。"],
    },
    list: {
      t: ["The list", "Список", "清单"],
      b: ["Tick tasks as you go. Tap one to edit, move it to tomorrow, delete it or start a focus session on it.", "Отмечай задачи по ходу дня. Нажми на задачу, чтобы изменить, перенести на завтра, удалить или начать фокус на ней.", "边做边勾选。点击任务可编辑、移到明天、删除或开始专注。"],
    },
    help: {
      t: ["Need a reminder?", "Нужно напомнить?", "需要提醒？"],
      b: ["The “?” button explains this space again and can replay this tour any time.", "Кнопка «?» снова объяснит раздел и может повторить этот тур в любой момент.", "「?」按钮会再次说明这个空间，并可随时重播引导。"],
    },
  },

  focus: {
    intro: {
      t: ["Focus", "Фокус", "专注"],
      b: ["Work in calm blocks with breaks in between — the Pomodoro way.", "Работай спокойными блоками с перерывами — по методу помодоро.", "以番茄工作法，专注一段，休息一下。"],
      list: [
        ["25/5, 50/10, 15/3 or your own minutes", "25/5, 50/10, 15/3 или свои минуты", "25/5、50/10、15/3 或自定义"],
        ["Focus on a task from your list", "Фокус на задаче из списка", "专注于清单中的任务"],
        ["Pause, finish early or take a break", "Пауза, досрочное завершение, перерыв", "暂停、提前结束或休息"],
        ["Daily and weekly focus minutes", "Минуты фокуса за день и неделю", "每日与每周专注分钟"],
        ["A kind procrastination log", "Добрый журнал прокрастинации", "温柔的拖延日志"],
      ],
    },
    presets: {
      t: ["Choose a rhythm", "Выбери ритм", "选择节奏"],
      b: ["25/5 is classic: 25 minutes of focus, 5 of rest. “Custom” lets you set any length.", "25/5 — классика: 25 минут работы, 5 отдыха. «Свой» — любая длительность.", "25/5 是经典：专注 25 分钟，休息 5 分钟。「自定义」可设任意时长。"],
    },
    timer: {
      t: ["The timer", "Таймер", "计时器"],
      b: ["The ring empties as time passes. It keeps running even if you switch screens or close the app.", "Кольцо уменьшается по ходу времени. Таймер идёт, даже если переключить экран или закрыть приложение.", "圆环随时间减少。即使切换页面或关闭应用，计时仍会继续。"],
    },
    setup: {
      t: ["What are you working on?", "Над чем работаешь?", "你在做什么？"],
      b: ["Write it or pick a task, then press Start. When it ends you can tick that task as done in one tap.", "Напиши или выбери задачу и нажми «Старт». Когда время выйдет, задачу можно отметить сделанной одним касанием.", "写下或选择一个任务，然后开始。结束后可一键把任务标记为完成。"],
    },
    stats: {
      t: ["Your focus time", "Твоё время фокуса", "你的专注时间"],
      b: ["Minutes today, sessions and a weekly chart. Tap a bar to see the exact day.", "Минуты за сегодня, сессии и график недели. Нажми на столбик, чтобы увидеть день.", "今天的分钟数、次数和周图表。点击柱子查看具体日期。"],
    },
    procr: {
      t: ["Can't start?", "Не можешь начать?", "开始不了？"],
      b: ["No guilt. Name what you're avoiding and why, write the tiniest first step — and Bloom starts a 5‑minute focus on it.", "Без вины. Назови, что откладываешь и почему, запиши самый маленький первый шаг — и Bloom запустит 5 минут фокуса на нём.", "不自责。写下你在逃避什么、为什么，以及最小的第一步——Bloom 会为它开启 5 分钟专注。"],
    },
  },

  body: {
    intro: {
      t: ["Body & mood", "Тело и настроение", "身体与心情"],
      b: ["A gentle daily check-in for mind and body. Everything is optional — log only what helps you.", "Бережный ежедневный чек‑ин для тела и души. Всё необязательно — отмечай только то, что тебе помогает.", "温柔的身心每日记录。全部可选——只记录对你有帮助的。"],
      list: [
        ["Mood, energy and what's stressing you", "Настроение, энергия и источники стресса", "心情、精力和压力来源"],
        ["Sleep, water, movement and food", "Сон, вода, движение и еда", "睡眠、饮水、运动和饮食"],
        ["Weight and cycle tracking with predictions", "Вес и цикл с прогнозом", "体重与周期记录及预测"],
        ["Three good things and the small win of the day", "Три хорошие вещи и маленькая победа дня", "三件好事与今天的小胜利"],
        ["A one-minute breathing exercise", "Дыхательная пауза на минуту", "一分钟呼吸练习"],
        ["Mood calendar and trends in History", "Календарь настроения и графики в «Истории»", "「记录」中的心情日历与趋势"],
      ],
    },
    mood: {
      t: ["Mood", "Настроение", "心情"],
      b: ["Pick how you feel. Bloom answers with a kind line, and for tired, anxious or sad days suggests a breathing break.", "Выбери, как ты. Bloom ответит доброй фразой, а в усталые, тревожные или грустные дни предложит подышать.", "选择你的感受。Bloom 会回应一句温暖的话，在疲惫、焦虑或难过时建议呼吸练习。"],
    },
    energy: {
      t: ["Energy", "Энергия", "精力"],
      b: ["From 1 (empty) to 5 (full). Over time Stats shows how energy connects to sleep and habits.", "От 1 (на нуле) до 5 (полна сил). Со временем «Статистика» покажет связь энергии со сном и привычками.", "从 1（耗尽）到 5（充沛）。之后「统计」会显示精力与睡眠、习惯的关系。"],
    },
    stress: {
      t: ["What weighs on you", "Что давит", "压力来源"],
      b: ["Tap the sources of stress and add a private note. Only you can see it.", "Отметь источники стресса и добавь заметку. Её видишь только ты.", "点选压力来源并添加私密备注，只有你能看到。"],
    },
    trackers: {
      t: ["Body trackers", "Трекеры тела", "身体记录"],
      b: ["Sleep with +/−, water by tapping glasses, movement in minutes, meals, weight and your cycle. Goals are set in Settings.", "Сон через +/−, воду — нажимая на стаканы, движение в минутах, еду, вес и цикл. Цели меняются в настройках.", "用 +/− 记录睡眠、点杯子记录饮水、按分钟记录运动，还有饮食、体重和周期。目标可在设置中修改。"],
    },
    good: {
      t: ["Good things", "Хорошее", "美好小事"],
      b: ["Write three good things and today's small win. It saves itself while you type and slowly trains your eye for the good.", "Запиши три хорошие вещи и маленькую победу дня. Всё сохраняется само, а глаз постепенно учится замечать хорошее.", "写下三件好事和今天的小胜利。输入时自动保存，慢慢学会看见美好。"],
    },
    breath: {
      t: ["Breathing break", "Дыхательная пауза", "呼吸练习"],
      b: ["Five slow rounds: in for 4, hold 2, out for 6. Calms the nervous system in about a minute.", "Пять медленных кругов: вдох 4, задержка 2, выдох 6. Успокаивает нервную систему примерно за минуту.", "五轮慢呼吸：吸 4 秒、停 2 秒、呼 6 秒。约一分钟让神经系统平静。"],
    },
    history: {
      t: ["History", "История", "记录"],
      b: ["Switch to History for the mood calendar and charts of energy, sleep, mood and weight.", "Переключись на «Историю» — там календарь настроения и графики энергии, сна, настроения и веса.", "切换到「记录」查看心情日历以及精力、睡眠、心情和体重图表。"],
    },
  },

  reflect: {
    intro: {
      t: ["Reflection & journal", "Рефлексия и дневник", "复盘与日记"],
      b: ["Short guided questions that help you learn from your days — without judging yourself.", "Короткие вопросы, которые помогают учиться на своих днях — без самокритики.", "简短的引导问题，帮你从每一天中学习——不评判自己。"],
      list: [
        ["Daily note: what went well, what was hard, next step", "Итог дня: что получилось, что было сложно, следующий шаг", "每日小结：顺利、困难、下一步"],
        ["Weekly review with your numbers filled in", "Обзор недели с готовыми цифрами", "自动填好数据的周复盘"],
        ["Monthly review: keep or let go of habits", "Обзор месяца: какие привычки оставить", "月复盘：保留或放下习惯"],
        ["Failure log: why it happened and how to adjust", "Журнал неудач: почему и что изменить", "失败日志：原因与调整"],
        ["A private journal with prompts and search", "Личный дневник с подсказками и поиском", "带提示与搜索的私密日记"],
      ],
    },
    tabs: {
      t: ["Five kinds of reflection", "Пять видов рефлексии", "五种复盘"],
      b: ["Day, Week and Month are guided reviews. Failures is a kind log of what didn't work. Journal is free writing that is never shared.", "День, Неделя и Месяц — подсказанные итоги. Неудачи — добрый журнал того, что не сработало. Дневник — свободные записи, которые никто не увидит.", "日、周、月是引导式复盘。失败日志记录没成功的事。日记是自由书写，永不共享。"],
    },
    form: {
      t: ["Answer a few questions", "Ответь на пару вопросов", "回答几个问题"],
      b: ["A sentence each is enough. Your “smallest next step” can become a task for tomorrow with one tap.", "По одному предложению достаточно. «Самый маленький следующий шаг» можно одним касанием превратить в задачу на завтра.", "每题一句话就够了。「最小的下一步」可一键变成明天的任务。"],
    },
    save: {
      t: ["Save", "Сохранить", "保存"],
      b: ["Saved reviews appear below as your history — lovely to reread at the end of a month.", "Сохранённые итоги появляются ниже как история — их приятно перечитать в конце месяца.", "保存的复盘会显示在下方，月底重读很温暖。"],
    },
  },

  stats: {
    intro: {
      t: ["Stats & insights", "Статистика и инсайты", "统计与洞察"],
      b: ["Your progress in numbers — and patterns you might not notice yourself.", "Твой прогресс в цифрах — и закономерности, которые сама можешь не заметить.", "用数字看见进步，也发现你自己可能没注意到的规律。"],
      list: [
        ["Completion rate compared with last period", "Процент выполнения в сравнении с прошлым периодом", "完成率并与上期对比"],
        ["Streaks, focus time, tasks, check-ins, level", "Серии, фокус, задачи, чек‑ины, уровень", "连续、专注、任务、记录、等级"],
        ["Charts for habits, focus, mood and energy", "Графики привычек, фокуса, настроения и энергии", "习惯、专注、心情、精力图表"],
        ["Insights: best time of day, most skipped habit", "Инсайты: лучшее время дня, самая пропускаемая привычка", "洞察：最佳时段、最常跳过的习惯"],
        ["A ready report to share — totals only", "Готовый отчёт, чтобы поделиться, — только цифры", "可分享的报告——只含汇总"],
      ],
    },
    period: {
      t: ["Week or month", "Неделя или месяц", "周或月"],
      b: ["Everything on this screen switches between this week and this month.", "Всё на этом экране переключается между этой неделей и этим месяцем.", "本页所有内容可在本周与本月之间切换。"],
    },
    report: {
      t: ["Automatic report", "Автоматический отчёт", "自动报告"],
      b: ["Your completion rate and a summary sentence. “Share” sends only these totals — never private details.", "Процент выполнения и короткий итог. «Поделиться» отправляет только эти цифры — никаких личных деталей.", "完成率与一句汇总。「分享」只发送这些汇总，不含隐私细节。"],
    },
    tiles: {
      t: ["Key numbers", "Главные цифры", "关键数字"],
      b: ["Current and best streak, focus hours, tasks done, check-ins and your level.", "Текущая и лучшая серия, часы фокуса, сделанные задачи, чек‑ины и уровень.", "当前与最佳连续、专注时长、完成任务、记录次数和等级。"],
    },
    charts: {
      t: ["Charts", "Графики", "图表"],
      b: ["Hover or tap any bar or point to see the exact value and day.", "Наведи или нажми на столбик или точку, чтобы увидеть точное значение и день.", "悬停或点击任意柱子或点，查看具体数值和日期。"],
    },
    insights: {
      t: ["Insights", "Инсайты", "洞察"],
      b: ["Bloom notices patterns from the last 30 days — when you do the most, what you skip, how sleep affects mood.", "Bloom замечает закономерности за 30 дней: когда ты успеваешь больше, что пропускаешь, как сон влияет на настроение.", "Bloom 会发现近 30 天的规律：你何时最高效、常跳过什么、睡眠如何影响心情。"],
    },
  },

  together: {
    intro: {
      t: ["Together", "Вместе", "在一起"],
      b: ["Your shared little world: everything here works live between your two devices.", "Ваш общий маленький мир: всё здесь работает вживую между вашими устройствами.", "你们共享的小世界：这里的一切都在两台设备之间实时同步。"],
      list: [
        ["Cinema for two: share a screen, a tab or a video with sound", "Кино вдвоём: экран, вкладка или видео со звуком", "双人影院：共享屏幕、标签页或视频，带声音"],
        ["A private chat with stickers and reactions", "Личный чат со стикерами и реакциями", "带贴纸和表情的私密聊天"],
        ["30+ surprises that fly onto your partner's screen", "30+ сюрпризов, которые прилетают на экран партнёра", "30+ 种会飞到对方屏幕上的惊喜"],
        ["See when they're online and what they're doing", "Видно, когда партнёр онлайн и чем занят", "看到对方是否在线、在做什么"],
        ["Focus timer, habits and a garden for two", "Таймер фокуса, привычки и сад на двоих", "双人专注计时、习惯和花园"],
        ["A question of the day and your book of answers", "Вопрос дня и ваша книга ответов", "每日问题和你们的答案之书"],
      ],
    },
    pair: {
      t: ["Connect first", "Сначала соединитесь", "先连接"],
      b: ["Send your code or link to your partner, or type their code here. One tap and you're linked.", "Отправь партнёру свой код или ссылку — или введи здесь его код. Одно нажатие — и вы связаны.", "把你的邀请码或链接发给对方，或在这里输入对方的邀请码。一点就连上。"],
    },
    partner: {
      t: ["Your person", "Твой человек", "你的那个人"],
      b: ["Green dot — online right now; below is what they're doing. The 💗 sends “thinking of you” in one tap.", "Зелёная точка — сейчас в сети, ниже — чем занят(а). 💗 отправляет «думаю о тебе» в одно касание.", "绿点表示在线，下面显示对方正在做什么。点 💗 一键发送「在想你」。"],
    },
    watch: {
      t: ["Cinema for two", "Кино вдвоём", "双人影院"],
      b: ["Show a browser tab, your screen or a downloaded movie — your partner sees and hears it. In file mode either of you can pause.", "Покажи вкладку, экран или скачанный фильм — партнёр видит и слышит. В режиме файла пауза работает у обоих.", "共享标签页、屏幕或下载的电影——对方能看能听。文件模式下双方都能暂停。"],
    },
    chat: {
      t: ["Your chat", "Ваш чат", "你们的聊天"],
      b: ["Messages, Bloomie stickers and reactions. Tap a message to react; you'll see when it's read.", "Сообщения, стикеры с Блуми и реакции. Нажми на сообщение, чтобы отреагировать; видно, когда прочитано.", "消息、Bloomie 贴纸和表情。点击消息即可回应，能看到是否已读。"],
    },
    love: {
      t: ["Send a little love", "Отправь немного любви", "送一点爱"],
      b: ["Each button plays an animation on your partner's screen right now — hearts, hugs, “you've got this”… Right-click or long-press to preview. ✍️ sends your own words.", "Каждая кнопка запускает анимацию на экране партнёра прямо сейчас — сердечки, обнимашки, «у тебя всё получится»… Правый клик или долгое нажатие — предпросмотр. ✍️ — свои слова.", "每个按钮都会立刻在对方屏幕上播放动画——爱心、拥抱、「你可以的」……右键或长按可预览。✍️ 发送你自己的话。"],
    },
    question: {
      t: ["Question of the day", "Вопрос дня", "今日问题"],
      b: ["A new sweet question every day. Your partner's answer opens after you answer — and all of them go into your book.", "Каждый день новый милый вопрос. Ответ партнёра откроется после твоего — и всё сохранится в вашей книге.", "每天一个甜蜜的问题。你回答后才能看到对方的答案，全部收进你们的答案之书。"],
    },
    habits: {
      t: ["Habits for two", "Привычки на двоих", "两个人的习惯"],
      b: ["A habit you both do. The streak grows only when you both tick it — the letter shows if your partner already did.", "Привычка, которую делаете оба. Серия растёт, только когда отметили оба — буква показывает, сделал ли уже партнёр.", "你们都做的习惯。两人都打卡连续天数才会增加——字母显示对方是否已完成。"],
    },
    focus: {
      t: ["Focus together", "Фокус вместе", "一起专注"],
      b: ["Start a timer and it runs on both screens. Take the break together, too.", "Запусти таймер — он идёт на обоих экранах. И перерыв тоже вместе.", "开始计时后两边屏幕同步进行，休息也一起。"],
    },
    garden: {
      t: ["Your garden", "Ваш сад", "你们的花园"],
      b: ["Grows from both of your habits. Tap it to water — your partner sees a little rain. Finish a day together and a flower appears.", "Растёт от привычек вас обоих. Нажми, чтобы полить, — партнёр увидит маленький дождик. Закройте день вместе — появится цветок.", "因你们两人的习惯而成长。点一下浇水，对方会看到一场小雨。一起完成一天就会开花。"],
    },
    reminders: {
      t: ["Reminders", "Напоминания", "提醒"],
      b: ["Gentle nudges for the morning, the evening and open habits, with quiet hours.", "Мягкие напоминания утром, вечером и о неотмеченных привычках, с тихими часами.", "早晚和未完成习惯的温柔提醒，含免打扰时段。"],
    },
  },

  garden: {
    intro: {
      t: ["Garden & rewards", "Сад и награды", "花园与奖励"],
      b: ["A little play that makes consistency feel like joy.", "Немного игры, чтобы постоянство приносило радость.", "加一点游戏感，让坚持变成快乐。"],
      list: [
        ["Your plant grows through 8 stages", "Растение проходит 8 стадий роста", "植物经历 8 个成长阶段"],
        ["Points for habits, tasks, focus and check-ins", "Очки за привычки, задачи, фокус и чек‑ины", "习惯、任务、专注、记录都能得分"],
        ["Rewards for streaks: “7 days → movie night”", "Награды за серии: «7 дней → кино»", "连续奖励：「7 天 → 电影之夜」"],
        ["A wish list you buy with points", "Список желаний за очки", "用积分兑换的愿望清单"],
        ["13 badges on the achievement wall", "13 значков на стене достижений", "成就墙上的 13 枚徽章"],
        ["Mood weather for your week", "Погода настроения за неделю", "一周的心情天气"],
      ],
    },
    plant: {
      t: ["Your plant", "Твоё растение", "你的植物"],
      b: ["Tap it to water it. The bar shows how many points until the next stage. Tap the pencil to give it a name.", "Нажми, чтобы полить. Полоска показывает, сколько очков до следующей стадии. Карандаш — дать имя.", "点击浇水。进度条显示距下一阶段还差多少分。点铅笔可以起名。"],
    },
    bank: {
      t: ["Habit bank", "Банк привычек", "习惯银行"],
      b: ["Your balance, everything earned and spent. Open “How you earn” to see points for each action.", "Баланс, всё заработанное и потраченное. «Как начисляются очки» покажет цену каждого действия.", "余额、累计获得与已使用。打开「积分规则」查看每个行动的分数。"],
    },
    streak: {
      t: ["Streak rewards", "Награды за серии", "连续奖励"],
      b: ["They unlock with your best current streak. When one glows, press “Redeem” and enjoy it for real.", "Открываются твоей лучшей текущей серией. Когда награда засветится — нажми «Забрать» и порадуй себя по‑настоящему.", "用当前最长连续天数解锁。发光时点「兑换」，真的去享受它吧。"],
    },
    shop: {
      t: ["Wish list", "Список желаний", "愿望清单"],
      b: ["Add treats you'd love and their price in points. Spend points when you've earned enough.", "Добавь приятности, которые хочешь, и их цену в очках. Трать очки, когда накопишь.", "添加你想要的小奖励及其积分价格，攒够后就兑换。"],
    },
    weather: {
      t: ["Mood weather", "Погода настроения", "心情天气"],
      b: ["Your week's moods as a forecast — sunny, cloudy or rainy days at a glance.", "Настроение недели как прогноз погоды — солнечные, облачные и дождливые дни одним взглядом.", "用天气预报展示一周心情——晴天、多云或雨天一目了然。"],
    },
    badges: {
      t: ["Achievement wall", "Стена достижений", "成就墙"],
      b: ["Grey badges are still locked — the bar shows how close you are.", "Серые значки ещё закрыты — полоска показывает, сколько осталось.", "灰色徽章尚未解锁，进度条显示还差多少。"],
    },
    rule: {
      t: ["Gentle consequence", "Мягкое последствие", "温柔的约定"],
      b: ["Optional: decide what happens after a missed day — nothing, only the minimum next day, or a small donation.", "Необязательно: реши, что будет после пропуска — ничего, на следующий день только минимум или небольшое пожертвование.", "可选：决定错过一天后怎么做——什么都不做、第二天只做最小版本，或小额捐款。"],
    },
  },

  privacy: {
    intro: {
      t: ["Privacy & data", "Приватность и данные", "隐私与数据"],
      b: ["You decide who sees what — and your data is always yours to take or delete.", "Ты решаешь, кто что видит, а данные всегда можно забрать или удалить.", "你决定谁能看到什么，数据随时可以带走或删除。"],
      list: [
        ["Three sharing modes in one tap", "Три режима доступа в одно касание", "一键切换三种共享模式"],
        ["A switch for every module", "Отдельный переключатель для каждого модуля", "每个模块单独开关"],
        ["Pause all sharing instantly", "Мгновенная пауза любого доступа", "立即暂停所有共享"],
        ["A 4-digit passcode for this device", "4‑значный код на этом устройстве", "本设备的 4 位密码锁"],
        ["Export, restore and delete everything", "Экспорт, восстановление и полное удаление", "导出、恢复和彻底删除"],
      ],
    },
    mode: {
      t: ["Sharing mode", "Режим доступа", "共享模式"],
      b: ["Fully private is the default. Partial shares only goals, habits and streaks. Partner-visible adds tasks and focus time.", "По умолчанию — полностью приватно. «Частично» показывает только цели, привычки и серии. «Для партнёра» добавляет задачи и фокус.", "默认完全私密。「部分」只共享目标、习惯和连续天数。「伙伴可见」再加上任务和专注时间。"],
    },
    modules: {
      t: ["Fine-tune each module", "Точная настройка", "逐个模块调整"],
      b: ["Turn each part on or off. The journal is locked and can never be shared.", "Включай и выключай каждый раздел. Дневник закрыт навсегда и не может быть показан.", "单独开关每一部分。日记被锁定，永远无法共享。"],
    },
    sync: {
      t: ["Account & sync", "Аккаунт и синхронизация", "账户与同步"],
      b: ["Shows your account and whether everything is synced between devices. The arrow button syncs right now.", "Показывает аккаунт и синхронизированы ли устройства. Кнопка со стрелкой синхронизирует прямо сейчас.", "显示你的账户以及设备是否已同步。箭头按钮可立即同步。"],
    },
    lock: {
      t: ["Passcode", "Код на вход", "密码锁"],
      b: ["Set a 4-digit code that Bloom asks for when it opens on this device.", "Задай 4‑значный код, который Bloom будет спрашивать при открытии на этом устройстве.", "设置 4 位密码，在本设备打开 Bloom 时需要输入。"],
    },
    data: {
      t: ["Your data", "Твои данные", "你的数据"],
      b: ["Download a full backup file, restore it any time, and find “Delete account” at the bottom if you ever need it.", "Скачай полную резервную копию, восстанови её в любой момент, а внизу — «Удалить аккаунт», если понадобится.", "下载完整备份文件，随时恢复；如有需要，底部有「删除账户」。"],
    },
  },
} as const satisfies Tree;
