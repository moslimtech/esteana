const ANDROID_ASSET_BASE = 'https://app.esteana.local';
const WISDOM_URL = '/daily-wisdom.json';
const isAndroidAssetHost = typeof window !== 'undefined' && (
  window.location?.protocol === 'file:' || window.location?.hostname === 'app.esteana.local'
);
let cachedList = null;

/**
 * جلب قائمة الحكم من الملف المحلي (مرّة واحدة). داخل أندرويد نطلب من app.esteana.local.
 * @returns {Promise<Array<{ type: string, text: string, source: string }>>}
 */
export async function fetchDailyWisdomList() {
  if (cachedList) return cachedList;
  const url = isAndroidAssetHost ? `${ANDROID_ASSET_BASE}/daily-wisdom.json` : WISDOM_URL;
  const res = await fetch(url);
  if (!res.ok) return [];
  const list = await res.json();
  cachedList = Array.isArray(list) ? list : [];
  return cachedList;
}

/**
 * اختيار حكمة اليوم بشكل ثابت حسب التاريخ (نفس اليوم = نفس الحكمة).
 * @param {string} [dateKey] YYYY-MM-DD، إن لم يُمرَّر يُستخدم تاريخ اليوم.
 * @returns {Promise<{ type: string, text: string, source: string } | null>}
 */
export async function getWisdomForDay(dateKey) {
  const list = await fetchDailyWisdomList();
  if (list.length === 0) return null;
  const key = dateKey ?? new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const index = hash % list.length;
  return list[index];
}
