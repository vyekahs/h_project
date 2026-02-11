interface SaveManagerOptions<T> {
    storageKey: string;
    validate: (data: unknown) => data is T;
    onLoadError?: (msg: string) => void;
}

export function createSaveManager<T>(options: SaveManagerOptions<T>) {
    let hasSavedGame = $state(false);

    function save(data: T) {
        try {
            localStorage.setItem(options.storageKey, JSON.stringify(data));
            hasSavedGame = true;
        } catch (e) {
            console.error('Failed to save game', e);
        }
    }

    function load(): T | null {
        try {
            const saved = localStorage.getItem(options.storageKey);
            if (!saved) return null;
            const parsed = JSON.parse(saved);
            if (options.validate(parsed)) {
                return parsed;
            } else {
                if (options.onLoadError) {
                    options.onLoadError('저장된 게임 데이터가 올바르지 않습니다.');
                }
                clear();
                return null;
            }
        } catch (e) {
            console.error('Failed to load game', e);
            if (options.onLoadError) {
                options.onLoadError('저장된 게임을 불러오는데 실패했습니다.');
            }
            clear();
            return null;
        }
    }

    function clear() {
        localStorage.removeItem(options.storageKey);
        hasSavedGame = false;
    }

    function checkExists(): boolean {
        try {
            const saved = localStorage.getItem(options.storageKey);
            hasSavedGame = !!saved;
            return hasSavedGame;
        } catch {
            return false;
        }
    }

    return {
        get hasSavedGame() { return hasSavedGame; },
        set hasSavedGame(v: boolean) { hasSavedGame = v; },
        save,
        load,
        clear,
        checkExists,
    };
}
