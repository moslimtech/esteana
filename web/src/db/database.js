import { openDB } from 'idb';

const DB_NAME = 'MuslimJourneyDB';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * قاعدة بيانات Hybrid Offline-First موحدة — MuslimJourneyDB.
 * المخازن:
 * - settings: الفئة العمرية، الاسم، حجم الخط، آخر مكان وقوف في المصحف، الثيم
 * - quran: نصوص المصحف بالرسم العثماني (سجل واحد لكل سورة)
 * - heart_touched: الآيات التي لمست قلب المستخدم
 * - daily_actions_logs: سجل الأفعال اليومية مع علم المزامنة لـ Supabase
 */
export function openMuslimJourneyDB() {
  if (dbPromise) return dbPromise;
  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('settings')) {
        const s = db.createObjectStore('settings', { keyPath: 'id' });
        s.createIndex('by_key', 'id', { unique: true });
      }
      if (!db.objectStoreNames.contains('quran')) {
        const q = db.createObjectStore('quran', { keyPath: 'number' });
        q.createIndex('by_number', 'number', { unique: true });
      }
      if (!db.objectStoreNames.contains('heart_touched')) {
        const h = db.createObjectStore('heart_touched', { keyPath: 'id' });
        h.createIndex('surah_ayah', ['surahNumber', 'ayahNumber'], { unique: true });
        h.createIndex('addedAt', 'addedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('daily_actions_logs')) {
        const d = db.createObjectStore('daily_actions_logs', { keyPath: 'id' });
        d.createIndex('created_at', 'created_at', { unique: false });
      }
    },
  });
  return dbPromise;
}

// ——— Settings ———
const SETTINGS_ID = 'profile';

/**
 * @param {{ age_group?: string, name?: string, displayName?: string, fontSize?: number, lastQuranPosition?: { surahNumber: number, ayahNumber: number }, theme?: 'light'|'dark'|'sepia' }} data
 */
export async function saveSettings(data) {
  const db = await openMuslimJourneyDB();
  const existing = await db.get('settings', SETTINGS_ID);
  await db.put('settings', { id: SETTINGS_ID, ...existing, ...data, updatedAt: new Date().toISOString() });
}

export async function getSettings() {
  const db = await openMuslimJourneyDB();
  const row = await db.get('settings', SETTINGS_ID);
  return row ?? null;
}

// ——— Quran (مصحف عثماني: سجل واحد لكل سورة) ———
const QURAN_UTHMANI_API = 'https://api.alquran.cloud/v1/quran/quran-uthmani';

/** أسماء السور بالعربية (لتحويل الملف المحلي) */
const SURAH_NAMES_AR = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس',
];

/**
 * يحوّل مصحفاً بصيغة مسطحة [{ id, sura, aya, text }] إلى سور بالصيغة المتوقعة في المخزن.
 */
function flatToSurahs(flat) {
  if (!Array.isArray(flat) || flat.length === 0) return [];
  const bySura = new Map();
  for (const a of flat) {
    const suraNum = Number(a.sura) || 1;
    if (!bySura.has(suraNum)) {
      bySura.set(suraNum, {
        number: suraNum,
        name: SURAH_NAMES_AR[suraNum - 1] || `سورة ${suraNum}`,
        englishName: '',
        englishNameTranslation: '',
        revelationType: '',
        ayahs: [],
      });
    }
    const ayahNum = Number(a.aya) || 1;
    bySura.get(suraNum).ayahs.push({
      number: ayahNum,
      numberInSurah: ayahNum,
      text: a.text || '',
    });
  }
  return Array.from(bySura.values()).sort((a, b) => a.number - b.number);
}

/** في WebView (file://) نطلب الـ assets من هذا الأصل؛ الأندرويد يعترض الطلب ويرد من الـ assets. */
const ANDROID_ASSET_BASE = 'https://app.esteana.local';

/**
 * تحميل المصحف من الملف المحلي. في WebView (file://) نستخدم https://app.esteana.local/quran.json
 * والأندرويد يعترض الطلب ويرد المحتوى من الـ assets.
 */
async function loadQuranFromLocalJson() {
  const isFile = typeof window !== 'undefined' && window.location?.protocol === 'file:';
  const url = isFile
    ? `${ANDROID_ASSET_BASE}/quran.json`
    : (window.location?.href?.replace(/\/[^/]*$/, '/') || '') + 'quran.json';
  let flat = null;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    flat = await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || 'Fetch failed' };
  }
  if (!Array.isArray(flat) || flat.length === 0) return { ok: false, error: 'Empty local Quran' };
  const surahs = flatToSurahs(flat);
  if (surahs.length === 0) return { ok: false, error: 'Empty local Quran' };
  const db = await openMuslimJourneyDB();
  const tx = db.transaction('quran', 'readwrite');
  for (const s of surahs) {
    await tx.store.put({
      number: s.number,
      name: s.name,
      englishName: s.englishName || '',
      englishNameTranslation: s.englishNameTranslation || '',
      revelationType: s.revelationType || '',
      ayahs: s.ayahs || [],
    });
  }
  await tx.done;
  return { ok: true };
}

export async function downloadQuranData() {
  const isFile = typeof window !== 'undefined' && window.location?.protocol === 'file:';

  // من ملف (WebView من assets): نفضّل المحلي أولاً لتجنب CORS
  if (isFile) {
    const local = await loadQuranFromLocalJson();
    if (local.ok) return local;
  }

  try {
    const res = await fetch(QURAN_UTHMANI_API);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    if (json.code !== 200 || !json.data?.surahs?.length) {
      if (isFile) return loadQuranFromLocalJson();
      return { ok: false, error: 'Invalid API response' };
    }

    const db = await openMuslimJourneyDB();
    const tx = db.transaction('quran', 'readwrite');
    for (const s of json.data.surahs) {
      await tx.store.put({
        number: s.number,
        name: s.name,
        englishName: s.englishName || '',
        englishNameTranslation: s.englishNameTranslation || '',
        revelationType: s.revelationType || '',
        ayahs: Array.isArray(s.ayahs) ? s.ayahs : [],
      });
    }
    await tx.done;
    return { ok: true };
  } catch (err) {
    if (isFile) return loadQuranFromLocalJson();
    return { ok: false, error: err?.message || 'Network error' };
  }
}

export async function isQuranStoreEmpty() {
  const db = await openMuslimJourneyDB();
  const count = await db.count('quran');
  return count === 0;
}

export async function getSurahs() {
  const db = await openMuslimJourneyDB();
  const list = await db.getAll('quran');
  return list.sort((a, b) => (a.number || 0) - (b.number || 0));
}

export async function getSurah(surahNumber) {
  const db = await openMuslimJourneyDB();
  const surah = await db.get('quran', Number(surahNumber));
  return surah ?? null;
}

// ——— Heart Touched (آيات لمست قلبي) ———

/**
 * @param {{ surahNumber: number, ayahNumber: number, text?: string }}
 */
export async function addHeartTouched({ surahNumber, ayahNumber, text }) {
  const db = await openMuslimJourneyDB();
  const id = `${surahNumber}-${ayahNumber}`;
  await db.put('heart_touched', {
    id,
    surahNumber,
    ayahNumber,
    text: text ?? '',
    addedAt: new Date().toISOString(),
  });
  return id;
}

export async function removeHeartTouched(surahNumber, ayahNumber) {
  const db = await openMuslimJourneyDB();
  await db.delete('heart_touched', `${surahNumber}-${ayahNumber}`);
}

export async function isHeartTouched(surahNumber, ayahNumber) {
  const db = await openMuslimJourneyDB();
  const index = db.transaction('heart_touched').store.index('surah_ayah');
  const row = await index.get([surahNumber, ayahNumber]);
  return !!row;
}

export async function getAllHeartTouched() {
  const db = await openMuslimJourneyDB();
  const list = await db.getAll('heart_touched');
  return list.sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
}

// ——— Last Quran Position (مكان الوقوف) ———

export async function saveLastQuranPosition(surahNumber, ayahNumber) {
  await saveSettings({ lastQuranPosition: { surahNumber, ayahNumber } });
}

export async function getLastQuranPosition() {
  const s = await getSettings();
  return s?.lastQuranPosition ?? null;
}

// ——— Daily Actions Logs (سجل الأفعال اليومية + علم المزامنة) ———

export async function addDailyActionLog(action) {
  const db = await openMuslimJourneyDB();
  const id = crypto.randomUUID();
  const record = {
    id,
    action_type: action.action_type,
    payload: action.payload ?? null,
    created_at: new Date().toISOString(),
    synced: false,
  };
  await db.add('daily_actions_logs', record);
  return id;
}

export async function getUnsyncedDailyActionLogs() {
  const db = await openMuslimJourneyDB();
  const all = await db.getAll('daily_actions_logs');
  return all.filter((a) => a.synced === false);
}

export async function markDailyActionLogSynced(id) {
  const db = await openMuslimJourneyDB();
  const row = await db.get('daily_actions_logs', id);
  if (row) {
    row.synced = true;
    await db.put('daily_actions_logs', row);
  }
}

export async function getDailyActionLogsForToday() {
  const db = await openMuslimJourneyDB();
  const all = await db.getAll('daily_actions_logs');
  const today = new Date().toISOString().slice(0, 10);
  return all.filter((a) => (a.created_at || '').startsWith(today));
}

// ——— توافق مع أسماء قديمة ———
export const openEsteanaDB = openMuslimJourneyDB;
export const addDailyAction = addDailyActionLog;
export const addDailyLog = addDailyActionLog;
export const getUnsyncedDailyLogs = getUnsyncedDailyActionLogs;
export const markDailyLogSynced = markDailyActionLogSynced;
export const getDailyLogsForToday = getDailyActionLogsForToday;
export const getDailyActionsForToday = getDailyActionLogsForToday;
export const getUnsyncedDailyActions = getUnsyncedDailyActionLogs;
export const markDailyActionSynced = markDailyActionLogSynced;

export async function isSurahsStoreEmpty() {
  return isQuranStoreEmpty();
}
