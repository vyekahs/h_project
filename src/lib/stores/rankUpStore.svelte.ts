export const rankUpStore = (() => {
    let isVisible = $state(false);
    let previousRank = $state<number | null>(null);
    let currentRank = $state<number | null>(null);
    let gameId = $state<string>('');
    let calculatedScore = $state<number>(0);
    let triggerCount = $state<number>(0);

    return {
        get isVisible() { return isVisible; },
        get previousRank() { return previousRank; },
        get currentRank() { return currentRank; },
        get gameId() { return gameId; },
        get calculatedScore() { return calculatedScore; },
        get triggerCount() { return triggerCount; },

        show(prevRank: number | null, currRank: number | null, game: string, score: number) {
            previousRank = prevRank;
            currentRank = currRank;
            gameId = game;
            calculatedScore = score;
            triggerCount++;
            isVisible = true;
        },
        close() {
            isVisible = false;
        }
    };
})();
