interface TimerOptions {
    isTimeFrozen?: () => boolean;
    isPaused?: () => boolean;
    onAutoSave?: (timerValue: number) => void;
}

export function createTimer(options: TimerOptions = {}) {
    let timerValue = $state(0);
    let displayTimer = $state(0);
    let timerInterval: ReturnType<typeof setInterval> | undefined;

    function start() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const frozen = options.isTimeFrozen?.() ?? false;
            const paused = options.isPaused?.() ?? false;
            if (!frozen && !paused) {
                timerValue++;
                displayTimer = timerValue;
                if (timerValue % 5 === 0 && options.onAutoSave) {
                    options.onAutoSave(timerValue);
                }
            }
        }, 1000);
    }

    function stop() {
        clearInterval(timerInterval);
    }

    function reset() {
        timerValue = 0;
        displayTimer = 0;
    }

    return {
        get value() { return timerValue; },
        set value(v: number) { timerValue = v; },
        get display() { return displayTimer; },
        set display(v: number) { displayTimer = v; },
        start,
        stop,
        reset,
    };
}
