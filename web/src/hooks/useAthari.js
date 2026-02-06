import { useState, useEffect, useCallback } from 'react';
import { getSettings, saveSettings, getDailyLogsForToday } from '../db/database';
import { TASKS_BY_AGE_GROUP } from '../constants/athariTasks';

const ANDROID_ASSET_BASE = 'https://app.esteana.local';
const DAILY_ACTIONS_JSON = '/daily_actions.json';
const isAndroidAssetHost = typeof window !== 'undefined' && (
  window.location?.protocol === 'file:' || window.location?.hostname === 'app.esteana.local'
);

/**
 * جلب daily_actions.json — داخل أندرويد من app.esteana.local، وإلا fetch من المسار العادي.
 */
async function loadDailyActionsJson() {
  const url = isAndroidAssetHost ? `${ANDROID_ASSET_BASE}/daily_actions.json` : DAILY_ACTIONS_JSON;
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/**
 * حالة تاب أثري: age_group من IndexedDB، قائمة المهام من daily_actions.json (أو الاحتياطي)، ومجموعة ما تم إنجازه اليوم.
 */
export function useAthari() {
  const [ageGroup, setAgeGroupState] = useState(null);
  const [completedToday, setCompletedToday] = useState([]);
  const [tasksByAge, setTasksByAge] = useState(TASKS_BY_AGE_GROUP);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadDailyActionsJson()
      .then((data) => {
        if (!cancelled && data && typeof data === 'object') setTasksByAge(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    const logs = await getDailyLogsForToday();
    setCompletedToday(logs.map((l) => l.action_type));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const settings = await getSettings();
      if (!cancelled) {
        setAgeGroupState(settings?.age_group ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (ageGroup == null) return;
    let cancelled = false;
    (async () => {
      const logs = await getDailyLogsForToday();
      if (!cancelled) setCompletedToday(logs.map((l) => l.action_type));
    })();
    return () => { cancelled = true; };
  }, [ageGroup]);

  const setAgeGroup = useCallback(async (group) => {
    await saveSettings({ age_group: group });
    setAgeGroupState(group);
    await refresh();
  }, [refresh]);

  const taskIds = ageGroup && tasksByAge[ageGroup] ? tasksByAge[ageGroup] : (tasksByAge.adult || TASKS_BY_AGE_GROUP.adult);
  const completedSet = new Set(completedToday);

  return {
    ageGroup,
    setAgeGroup,
    taskIds,
    completedSet,
    refresh,
    loading,
    needsOnboarding: ageGroup === null && !loading,
  };
}
