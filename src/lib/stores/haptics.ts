import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// Default to true. In browser, initialize from localStorage if available.
const defaultValue = true;
const initialValue = browser ? (localStorage.getItem('haptics_enabled') === 'false' ? false : defaultValue) : defaultValue;

export const hapticsEnabled = writable<boolean>(initialValue);

// Subscribe to changes and sync with localStorage
if (browser) {
    hapticsEnabled.subscribe(value => {
        localStorage.setItem('haptics_enabled', String(value));
    });
}

/**
 * Triggers a device vibration if haptics are enabled and supported by the device.
 * @param pattern - Duration in ms, or an array of durations (vibrate, pause, vibrate...)
 */
export function triggerHaptic(pattern: number | number[]) {
    if (!browser) return;
    
    const isEnabled = get(hapticsEnabled);
    if (!isEnabled) return;

    // Check if the Browser supports the Vibration API
    if (navigator && navigator.vibrate) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            console.warn('Vibration API error:', e);
        }
    }
}
