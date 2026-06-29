'use client';

import { useEffect } from 'react';
import { useUser } from '@/lib/UserContext';
import {
  getThemeMode,
  getUiFontSize,
  getUiDensity,
  getReduceMotion,
  getCurrencyFormat,
  UI_FONT_SCALE,
  type ThemeMode,
} from '@/lib/preferences';
import { setCurrencyDecimals } from '@/lib/utils';

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    const prefersDark = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  return mode;
}

/**
 * Aplica en <html> las preferencias visuales (tema, tamaño de letra UI,
 * densidad, animaciones reducidas) leídas de localStorage para el owner.
 *
 * Se re-ejecuta al recibir el evento "koptup:prefs-changed" para que
 * cualquier cambio en /settings se refleje al instante en toda la app.
 */
export default function PrefsApplier() {
  const owner = useUser();

  useEffect(() => {
    function apply() {
      const root = document.documentElement;

      const mode = getThemeMode(owner);
      const theme = resolveTheme(mode);
      root.dataset.theme = theme;
      if (theme === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');

      const uiSize = getUiFontSize(owner);
      root.dataset.uiFont = uiSize;
      root.style.setProperty('--ui-font-scale', String(UI_FONT_SCALE[uiSize]));

      const density = getUiDensity(owner);
      root.dataset.density = density;

      const reduced = getReduceMotion(owner);
      root.dataset.reduceMotion = reduced ? '1' : '0';

      // Formato de moneda (con/sin decimales) → afecta formatCurrency en toda la app.
      setCurrencyDecimals(getCurrencyFormat(owner) === 'cop-decimals');
    }

    apply();

    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (getThemeMode(owner) === 'system') apply();
    };
    mql?.addEventListener?.('change', onSystemChange);

    window.addEventListener('koptup:prefs-changed', apply);
    return () => {
      mql?.removeEventListener?.('change', onSystemChange);
      window.removeEventListener('koptup:prefs-changed', apply);
    };
  }, [owner]);

  return null;
}
