window.ALLPREDICTOR_CONFIG = Object.freeze({
  appName: "AllPredictor 1Win",
  version: "3.1.3",
  botUsername: "AllPredictorVrs2_bot",
  creatorUsername: "V0xFF3",
  creatorUrl: "https://t.me/V0xFF3",
  trialLimit: 10,
  supportedLanguages: ["ru", "en", "id"],

  // Public Supabase project values. These are safe for the browser.
  supabaseUrl: "https://lcgewatmbpfxzoiqneoa.supabase.co",
  supabaseAnonKey: "sb_publishable_UkPgmNkmrIYds4psoUW7-g_7I8k_Q25",

  adminTelegramIds: [],

  plans: [
    {
      id: "pro_30",
      nameRu: "PRO — 30 дней",
      nameEn: "PRO — 30 days",
      nameId: "PRO — 30 hari",
      descriptionRu: "Полный доступ ко всем открытым анализаторам на 30 дней.",
      descriptionEn: "Full access to every available analyzer for 30 days.",
      descriptionId: "Akses penuh ke semua analis yang tersedia selama 30 hari."
    },
    {
      id: "pro_90",
      nameRu: "PRO — 90 дней",
      nameEn: "PRO — 90 days",
      nameId: "PRO — 90 hari",
      descriptionRu: "Полный доступ на 90 дней и приоритетная поддержка.",
      descriptionEn: "Full access for 90 days with priority support.",
      descriptionId: "Akses penuh selama 90 hari dengan dukungan prioritas."
    },
    {
      id: "lifetime",
      nameRu: "LIFETIME",
      nameEn: "LIFETIME",
      nameId: "SEUMUR HIDUP",
      descriptionRu: "Постоянный доступ на привязанный Telegram-аккаунт.",
      descriptionEn: "Permanent access for the linked Telegram account.",
      descriptionId: "Akses permanen untuk akun Telegram yang terhubung."
    }
  ],

  news: [
    {
      date: "2026-07-24",
      titleRu: "Версия 3.1",
      titleEn: "Version 3.1",
      titleId: "Versi 3.1",
      textRu: "Добавлены русский, английский и индонезийский языки, профиль, тарифы, поддержка и подготовка индивидуальных лицензий.",
      textEn: "Russian, English and Indonesian languages, profile, plans, support and individual-license groundwork were added.",
      textId: "Bahasa Rusia, Inggris, dan Indonesia, profil, paket, dukungan, serta dasar lisensi individual telah ditambahkan."
    },
    {
      date: "2026-07-24",
      titleRu: "Новый раздел PRO",
      titleEn: "New PRO section",
      titleId: "Bagian PRO baru",
      textRu: "Кнопка PRO стала заметнее, а локальные LIVE-анализаторы вынесены в отдельный раздел.",
      textEn: "The PRO button is now more visible and local LIVE analyzers have their own section.",
      textId: "Tombol PRO sekarang lebih terlihat dan analis LIVE lokal memiliki bagian tersendiri."
    }
  ],

  faq: [
    {
      qRu: "Сколько прогнозов доступно бесплатно?",
      qEn: "How many predictions are free?",
      qId: "Berapa prediksi yang tersedia gratis?",
      aRu: "На одном устройстве доступно 10 тестовых прогнозов.",
      aEn: "Ten trial predictions are available on one device.",
      aId: "Sepuluh prediksi uji coba tersedia pada satu perangkat."
    },
    {
      qRu: "Как получить полный доступ?",
      qEn: "How do I get full access?",
      qId: "Bagaimana cara mendapatkan akses penuh?",
      aRu: "Напишите создателю @V0xFF3 и получите индивидуальный ключ после подтверждения оплаты.",
      aEn: "Contact @V0xFF3 and receive an individual key after payment is confirmed.",
      aId: "Hubungi @V0xFF3 dan dapatkan kunci individual setelah pembayaran dikonfirmasi."
    },
    {
      qRu: "Гарантирует ли приложение результат?",
      qEn: "Does the app guarantee results?",
      qId: "Apakah aplikasi menjamin hasil?",
      aRu: "Нет. Приложение показывает статистический анализ и не гарантирует выигрыш.",
      aEn: "No. The app provides statistical analysis and does not guarantee winnings.",
      aId: "Tidak. Aplikasi memberikan analisis statistik dan tidak menjamin kemenangan."
    },
    {
      qRu: "Можно ли передать ключ другому человеку?",
      qEn: "Can I share my key?",
      qId: "Apakah kunci dapat dibagikan kepada orang lain?",
      aRu: "Индивидуальные ключи будут привязаны к Telegram ID и не предназначены для передачи.",
      aEn: "Individual keys will be linked to a Telegram ID and are not intended for sharing.",
      aId: "Kunci individual akan terhubung ke ID Telegram dan не предназначены для передачи."
    }
  ]
});
