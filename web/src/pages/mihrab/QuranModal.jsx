import { useState, useEffect, useCallback } from 'react';
import { getStrings } from '../../constants/strings';
import { tokens, shape } from '../../theme/tokens';
import { getThemeTokens } from '../../theme/getThemeTokens';
import { AppIcon, CircularProgress } from '../../components';
import { initQuranIfEmpty } from '../../initQuranIfEmpty';
import { getSurahs, getSurah, isSurahsStoreEmpty, getSettings, saveSettings, downloadQuranData } from '../../db/database';
import { SurahView } from './SurahView';

const OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const MODAL_BASE = (themeTokens) => ({
  backgroundColor: themeTokens?.surface ?? tokens.surface,
  borderRadius: shape.radiusLarge,
  padding: 24,
  maxWidth: 420,
  width: '92%',
  maxHeight: '85vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
});

const FONT_SIZE_MIN = 16;
const FONT_SIZE_MAX = 32;
const FONT_SIZE_DEFAULT = 22;

export function QuranModal({ onClose }) {
  const t = getStrings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [surahs, setSurahs] = useState([]);
  const [selectedSurah, setSelectedSurah] = useState(null);
  const [surahDetail, setSurahDetail] = useState(null);
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT);
  const [themeKey, setThemeKey] = useState('light');
  const [hifzMode, setHifzMode] = useState(false);
  const themeTokens = getThemeTokens(themeKey);

  useEffect(() => {
    getSettings().then((s) => {
      if (s?.fontSize != null) setFontSize(Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, s.fontSize)));
      if (s?.theme) setThemeKey(s.theme);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initQuranIfEmpty();
        if (cancelled) return;
        let empty = await isSurahsStoreEmpty();
        if (empty) {
          const result = await downloadQuranData();
          if (!cancelled && result?.ok) empty = false;
        }
        if (cancelled) return;
        if (empty) {
          setError(t.mihrab.quranFetchError);
          setLoading(false);
          return;
        }
        const list = await getSurahs();
        if (!cancelled) {
          setSurahs(list);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(t.mihrab.quranFetchError);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [t.mihrab.quranFetchError]);

  useEffect(() => {
    if (!selectedSurah) {
      setSurahDetail(null);
      return;
    }
    let cancelled = false;
    getSurah(selectedSurah.number).then((s) => {
      if (!cancelled && s) setSurahDetail(s);
    });
    return () => { cancelled = true; };
  }, [selectedSurah]);

  const backToSurahs = () => {
    setSelectedSurah(null);
    setSurahDetail(null);
  };

  const handleFontSizeChange = useCallback((e) => {
    const v = Number(e.target.value);
    setFontSize(v);
    saveSettings({ fontSize: v });
  }, []);

  const cycleTheme = useCallback(() => {
    const next = themeKey === 'light' ? 'dark' : themeKey === 'dark' ? 'sepia' : 'light';
    setThemeKey(next);
    saveSettings({ theme: next });
  }, [themeKey]);

  return (
    <div style={OVERLAY_STYLE} onClick={onClose} role="presentation">
      <div style={MODAL_BASE(themeTokens)} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.mihrab.mushafLabel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: themeTokens.onSurface }}>
            {selectedSurah ? selectedSurah.name : t.mihrab.mushafLabel}
          </h2>
          <button
            type="button"
            onClick={selectedSurah ? backToSurahs : onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            aria-label={selectedSurah ? t.mihrab.backToSurahs : t.common.cancel}
          >
            <AppIcon name={selectedSurah ? 'arrow_back' : 'close'} size={24} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32 }}>
            <CircularProgress size={48} />
            <p style={{ marginTop: 16, color: themeTokens.onSurfaceVariant, fontSize: 14 }}>{t.mihrab.quranLoading}</p>
          </div>
        ) : error ? (
          <p style={{ color: tokens.error, padding: 16 }}>{error}</p>
        ) : !selectedSurah ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: themeTokens.onSurfaceVariant }}>{t.mihrab.selectSurah}</p>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 280 }}>
              {surahs.map((s) => (
                <button
                  key={s.number}
                  type="button"
                  onClick={() => setSelectedSurah(s)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    marginBottom: 4,
                    textAlign: 'right',
                    fontFamily: tokens.typography.fontFamily,
                    fontSize: 16,
                    color: themeTokens.onSurface,
                    backgroundColor: themeTokens.surfaceContainer,
                    border: 'none',
                    borderRadius: shape.radiusMedium,
                    cursor: 'pointer',
                  }}
                >
                  {s.name}
                  <span style={{ marginRight: 8, color: themeTokens.primary, fontWeight: 600 }}>{s.number}</span>
                </button>
              ))}
            </div>
          </>
        ) : surahDetail ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: themeTokens.onSurfaceVariant }}>
                <span>{t.mihrab.fontSize}</span>
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  value={fontSize}
                  onChange={handleFontSizeChange}
                  style={{ width: 80 }}
                />
              </label>
              <button
                type="button"
                onClick={cycleTheme}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: shape.radiusMedium,
                  border: `1px solid ${themeTokens.outlineVariant}`,
                  background: themeTokens.surfaceContainer,
                  color: themeTokens.onSurface,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <AppIcon name="palette" size={20} />
                {themeKey === 'light' ? t.mihrab.themeLight : themeKey === 'dark' ? t.mihrab.themeDark : t.mihrab.themeSepia}
              </button>
            </div>
            <SurahView
              surah={surahDetail}
              ayahs={surahDetail.ayahs}
              fontSize={fontSize}
              themeKey={themeKey}
              themeTokens={themeTokens}
              hifzMode={hifzMode}
              onHifzModeChange={setHifzMode}
            />
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <CircularProgress size={40} />
          </div>
        )}
      </div>
    </div>
  );
}
