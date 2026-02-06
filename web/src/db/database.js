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

/** في WebView نطلب الـ assets من هذا الأصل؛ الأندرويد يعترض الطلب ويرد من الـ assets. */
const ANDROID_ASSET_BASE = 'https://app.esteana.local';
/** مصدر احتياطي للمصحف عند فشل الاعتراض في أندرويد (ملف من النشر على Vercel). */
const QURAN_FALLBACK_URL = 'https://esteana.vercel.app/quran.json';
/** true عند التشغيل داخل أندرويد (file:// أو تحميل من app.esteana.local عبر loadDataWithBaseURL). */
const isAndroidAssetHost = typeof window !== 'undefined' && (
  window.location?.protocol === 'file:' || window.location?.hostname === 'app.esteana.local'
);

/** إرسال رسالة إلى Logcat عند التشغيل داخل أندرويد (للتتبع). */
function logQuran(msg) {
  try {
    if (typeof window !== 'undefined') {
      const b = window.Android || window.AndroidBridge;
      if (b && typeof b.log === 'function') b.log('[Quran] ' + msg);
    }
  } catch (_) {}
}

/**
 * تحميل المصحف من ملف JSON. داخل أندرويد: أولاً app.esteana.local، عند الفشل من Vercel.
 */
async function loadQuranFromLocalJson() {
  const urls = isAndroidAssetHost
    ? [`${ANDROID_ASSET_BASE}/quran.json`, QURAN_FALLBACK_URL]
    : [(window.location?.href?.replace(/\/[^/]*$/, '/') || '') + 'quran.json'];
  let flat = null;
  for (const url of urls) {
    logQuran('fetch: ' + url);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        logQuran('fetch fail: ' + url + ' status=' + res.status);
        continue;
      }
      flat = await res.json();
      if (Array.isArray(flat) && flat.length > 0) {
        logQuran('fetch ok: ' + url + ' verses=' + flat.length);
        break;
      }
    } catch (e) {
      logQuran('fetch error: ' + url + ' ' + (e?.message || ''));
      continue;
    }
  }
  if (!Array.isArray(flat) || flat.length === 0) {
    logQuran('loadQuranFromLocalJson: no data');
    return { ok: false, error: 'Empty local Quran' };
  }
  const surahs = flatToSurahs(flat);
  if (surahs.length === 0) {
    logQuran('loadQuranFromLocalJson: flatToSurahs empty');
    return { ok: false, error: 'Empty local Quran' };
  }
  logQuran('loadQuranFromLocalJson: saving surahs=' + surahs.length);
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
  logQuran('loadQuranFromLocalJson: done');
  return { ok: true };
}

export async function downloadQuranData() {
  // داخل أندرويد: نجرب API أولاً (يعمل مع النت)، ثم المحلي (اعتراض أو Vercel)
  if (isAndroidAssetHost) {
    logQuran('downloadQuranData: trying API first');
    try {
      const res = await fetch(QURAN_UTHMANI_API);
      if (res.ok) {
        const json = await res.json();
        if (json.code === 200 && json.data?.surahs?.length) {
          logQuran('API ok: surahs=' + json.data.surahs.length);
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
          logQuran('downloadQuranData: saved to DB from API');
          return { ok: true };
        }
      } else logQuran('API fail: status=' + res.status);
    } catch (e) {
      logQuran('API error: ' + (e?.message || ''));
    }
    logQuran('downloadQuranData: trying local (intercept + Vercel)');
    const local = await loadQuranFromLocalJson();
    if (local.ok) {
      logQuran('downloadQuranData: saved to DB from local');
      return local;
    }
    logQuran('downloadQuranData: all failed');
    return { ok: false, error: 'Quran load failed' };
  }

  try {
    const res = await fetch(QURAN_UTHMANI_API);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    if (json.code !== 200 || !json.data?.surahs?.length) {
      if (isAndroidAssetHost) return loadQuranFromLocalJson();
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
    if (isAndroidAssetHost) return loadQuranFromLocalJson();
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
