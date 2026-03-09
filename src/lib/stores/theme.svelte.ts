import { browser } from '$app/environment';

type ThemeMode = 'system' | 'light' | 'dark';

let mode = $state<ThemeMode>('system');

function getEffectiveTheme(m: ThemeMode): 'light' | 'dark' {
    if (m === 'system') {
        return browser && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return m;
}

let effectiveTheme = $derived(getEffectiveTheme(mode));

function applyTheme(theme: 'light' | 'dark') {
    if (!browser) return;
    document.documentElement.dataset.theme = theme;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a1b1e' : '#ffffff');
    }
}

function init() {
    if (!browser) return;
    const saved = localStorage.getItem('theme') as ThemeMode | null;
    if (saved && ['system', 'light', 'dark'].includes(saved)) {
        mode = saved;
    }
    applyTheme(getEffectiveTheme(mode));

    // system 모드일 때 OS 테마 변경 감지
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (mode === 'system') {
            applyTheme(getEffectiveTheme(mode));
        }
    });
}

function setMode(newMode: ThemeMode) {
    mode = newMode;
    if (browser) {
        localStorage.setItem('theme', newMode);
    }
    applyTheme(getEffectiveTheme(newMode));
}

function toggle() {
    const next = effectiveTheme === 'light' ? 'dark' : 'light';
    setMode(next);
}

export const themeStore = {
    get mode() { return mode; },
    get effectiveTheme() { return effectiveTheme; },
    init,
    setMode,
    toggle,
};
