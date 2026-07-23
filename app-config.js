window.ALLPREDICTOR_CONFIG = Object.freeze({
  appName: "AllPredictor 1Win",
  version: "3.0.0",
  botUsername: "AllPredictorVrs2_bot",
  creatorUsername: "V0xFF3",
  creatorUrl: "https://t.me/V0xFF3",
  trialLimit: 10,

  // Fill these after the Supabase project is created. Public values only.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Add the owner's numeric Telegram ID after it is confirmed.
  adminTelegramIds: [],

  plans: [
    {
      id: "pro_30",
      nameRu: "PRO — 30 дней",
      nameEn: "PRO — 30 days",
      descriptionRu: "Полный доступ ко всем открытым анализаторам на 30 дней.",
      descriptionEn: "Full access to every available analyzer for 30 days."
    },
    {
      id: "pro_90",
      nameRu: "PRO — 90 дней",
      nameEn: "PRO — 90 days",
      descriptionRu: "Полный доступ на 90 дней и приоритетная поддержка.",
      descriptionEn: "Full access for 90 days with priority support."
    },
    {
      id: "lifetime",
      nameRu: "LIFETIME",
      nameEn: "LIFETIME",
      descriptionRu: "Постоянный доступ на привязанный Telegram-аккаунт.",
      descriptionEn: "Permanent access for the linked Telegram account."
    }
  ],

  news: [
    {
      date: "2026-07-24",
      titleRu: "Версия 3.0",
      titleEn: "Version 3.0",
      textRu: "Добавлены тестовый режим, профиль, тарифы, поддержка и подготовка индивидуальных лицензий.",
      textEn: "Trial mode, profile, plans, support and individual-license groundwork were added."
    },
    {
      date: "2026-07-24",
      titleRu: "Новый раздел PRO",
      titleEn: "New PRO section",
      textRu: "Кнопка PRO стала заметнее, а локальные LIVE-анализаторы вынесены в отдельный раздел.",
      textEn: "The PRO button is now more visible and local LIVE analyzers have their own section."
    }
  ],

  faq: [
    {
      qRu: "Сколько прогнозов доступно бесплатно?",
      qEn: "How many predictions are free?",
      aRu: "На одном устройстве доступно 10 тестовых прогнозов.",
      aEn: "Ten trial predictions are available on one device."
    },
    {
      qRu: "Как получить полный доступ?",
      qEn: "How do I get full access?",
      aRu: "Напишите создателю @V0xFF3 и получите индивидуальный ключ после подтверждения оплаты.",
      aEn: "Contact @V0xFF3 and receive an individual key after payment is confirmed."
    },
    {
      qRu: "Гарантирует ли приложение результат?",
      qEn: "Does the app guarantee results?",
      aRu: "Нет. Приложение показывает статистический анализ и не гарантирует выигрыш.",
      aEn: "No. The app provides statistical analysis and does not guarantee winnings."
    },
    {
      qRu: "Можно ли передать ключ другому человеку?",
      qEn: "Can I share my key?",
      aRu: "Индивидуальные ключи будут привязаны к Telegram ID и не предназначены для передачи.",
      aEn: "Individual keys will be linked to a Telegram ID and are not intended for sharing."
    }
  ]
});
