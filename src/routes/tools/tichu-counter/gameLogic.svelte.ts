export interface PlayerData {
    id: number;
    name: string;
    team: 'A' | 'B';
}

export interface CompletedRound {
    roundNumber: number;
    cardScoreA: number;
    cardScoreB: number;
    oneTwoA: boolean;
    oneTwoB: boolean;
    bonusA: number;
    bonusB: number;
    totalScoreA: number;
    totalScoreB: number;
}

const STORAGE_KEY = 'tichu_counter_save';

function calculateRoundScore(
    cardScoreA: number,
    oneTwoA: boolean,
    oneTwoB: boolean,
    bonusA: number,
    bonusB: number
): { totalA: number; totalB: number } {
    let scoreA: number;
    let scoreB: number;

    if (oneTwoA) {
        scoreA = 200;
        scoreB = 0;
    } else if (oneTwoB) {
        scoreA = 0;
        scoreB = 200;
    } else {
        scoreA = cardScoreA;
        scoreB = 100 - cardScoreA;
    }

    scoreA += bonusA;
    scoreB += bonusB;

    return { totalA: Math.min(scoreA, 400), totalB: Math.min(scoreB, 400) };
}

export function createTichuGame() {
    // Game state
    let teamAName = $state('Team A');
    let teamBName = $state('Team B');
    let playerNames: [string, string, string, string] = $state(['P1', 'P2', 'P3', 'P4']);
    let rounds: CompletedRound[] = $state([]);
    let targetScore = $state(1000);
    let gameOver = $state(false);
    let winner: 'A' | 'B' | null = $state(null);

    // Session integration
    let sessionId: number | null = $state(null);
    let playerData: PlayerData[] = $state([]);

    // Current round input
    let cardScoreA = $state(50);
    let oneTwoA = $state(false);
    let oneTwoB = $state(false);
    let bonusA = $state(0);
    let bonusB = $state(0);

    // UI state
    let showConfirmReset = $state(false);

    // Derived
    let runningTotalA = $derived(rounds.reduce((sum, r) => sum + r.totalScoreA, 0));
    let runningTotalB = $derived(rounds.reduce((sum, r) => sum + r.totalScoreB, 0));

    let previewScore = $derived.by(() => {
        return calculateRoundScore(cardScoreA, oneTwoA, oneTwoB, bonusA, bonusB);
    });

    let progressA = $derived(Math.max(0, runningTotalA / targetScore));
    let progressB = $derived(Math.max(0, runningTotalB / targetScore));

    function resetRoundInput() {
        cardScoreA = 50;
        oneTwoA = false;
        oneTwoB = false;
        bonusA = 0;
        bonusB = 0;
    }

    function submitRound() {
        if (gameOver) return;

        const { totalA, totalB } = calculateRoundScore(cardScoreA, oneTwoA, oneTwoB, bonusA, bonusB);

        const round: CompletedRound = {
            roundNumber: rounds.length + 1,
            cardScoreA: oneTwoA || oneTwoB ? 0 : cardScoreA,
            cardScoreB: oneTwoA || oneTwoB ? 0 : 100 - cardScoreA,
            oneTwoA,
            oneTwoB,
            bonusA,
            bonusB,
            totalScoreA: totalA,
            totalScoreB: totalB
        };

        rounds = [...rounds, round];
        resetRoundInput();

        // Check win
        const newTotalA = rounds.reduce((s, r) => s + r.totalScoreA, 0);
        const newTotalB = rounds.reduce((s, r) => s + r.totalScoreB, 0);

        if (newTotalA >= targetScore || newTotalB >= targetScore) {
            if (newTotalA !== newTotalB) {
                gameOver = true;
                winner = newTotalA > newTotalB ? 'A' : 'B';
                submitResult(newTotalA, newTotalB);
            }
        }

        save();
    }

    async function submitResult(scoreA: number, scoreB: number) {
        if (!winner || playerData.length === 0) return;
        try {
            await fetch('/api/tichu/result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    winner,
                    scoreA,
                    scoreB,
                    playerData,
                    // -1은 "실제 세션과 연동 없이 재대결" 상태를 나타내는 내부용 값이라 실제 세션으로 취급하면 안 됨
                    sessionId: sessionId && sessionId > 0 ? sessionId : null
                })
            });
        } catch (e) {
            console.error('[Tichu] Failed to submit result:', e);
        }
    }

    function undoLastRound() {
        if (rounds.length === 0) return;
        rounds = rounds.slice(0, -1);
        gameOver = false;
        winner = null;
        save();
    }

    function resetGame() {
        rounds = [];
        gameOver = false;
        winner = null;
        resetRoundInput();
        showConfirmReset = false;
        // playerData is preserved so the next game with the same players can save results
        save();
    }

    function fullReset() {
        teamAName = 'Team A';
        teamBName = 'Team B';
        playerNames = ['P1', 'P2', 'P3', 'P4'];
        rounds = [];
        targetScore = 1000;
        gameOver = false;
        winner = null;
        sessionId = null;
        playerData = [];
        resetRoundInput();
        showConfirmReset = false;
        clearSave();
    }

    function setOneTwo(team: 'A' | 'B') {
        if (team === 'A') {
            oneTwoA = !oneTwoA;
            if (oneTwoA) oneTwoB = false;
        } else {
            oneTwoB = !oneTwoB;
            if (oneTwoB) oneTwoA = false;
        }
    }

    function addBonus(team: 'A' | 'B', amount: number) {
        if (team === 'A') bonusA = Math.max(-200, Math.min(200, bonusA + amount));
        else bonusB = Math.max(-200, Math.min(200, bonusB + amount));
    }

    function save() {
        try {
            const data = {
                teamAName, teamBName, playerNames,
                rounds, targetScore, gameOver, winner,
                sessionId, playerData,
                savedAt: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {}
    }

    function clearSave() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {}
    }

    function load(): boolean {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!Array.isArray(data.rounds)) return false;

            // Expire after 3 hours
            const THREE_HOURS = 3 * 60 * 60 * 1000;
            if (data.savedAt && Date.now() - data.savedAt > THREE_HOURS) {
                clearSave();
                return false;
            }

            teamAName = data.teamAName || 'Team A';
            teamBName = data.teamBName || 'Team B';
            playerNames = data.playerNames || ['P1', 'P2', 'P3', 'P4'];
            rounds = data.rounds;
            targetScore = data.targetScore || 1000;
            gameOver = data.gameOver || false;
            winner = data.winner || null;
            sessionId = data.sessionId || null;
            playerData = data.playerData || [];
            return true;
        } catch {
            return false;
        }
    }

    function dismissWin() {
        gameOver = false;
    }

    return {
        // State getters/setters
        get teamAName() { return teamAName; },
        set teamAName(v: string) { teamAName = v; save(); },
        get teamBName() { return teamBName; },
        set teamBName(v: string) { teamBName = v; save(); },
        get playerNames() { return playerNames; },
        set playerNames(v: [string, string, string, string]) { playerNames = v; save(); },
        get rounds() { return rounds; },
        get targetScore() { return targetScore; },
        set targetScore(v: number) { targetScore = v; save(); },
        get gameOver() { return gameOver; },
        get winner() { return winner; },

        // Session integration
        get sessionId() { return sessionId; },
        set sessionId(v: number | null) { sessionId = v; },
        get playerData() { return playerData; },
        set playerData(v: PlayerData[]) { playerData = v; },

        // Input state
        get cardScoreA() { return cardScoreA; },
        set cardScoreA(v: number) { cardScoreA = Math.max(-25, Math.min(125, v)); },
        get oneTwoA() { return oneTwoA; },
        get oneTwoB() { return oneTwoB; },
        get bonusA() { return bonusA; },
        get bonusB() { return bonusB; },

        // Derived
        get runningTotalA() { return runningTotalA; },
        get runningTotalB() { return runningTotalB; },
        get previewScore() { return previewScore; },
        get progressA() { return progressA; },
        get progressB() { return progressB; },

        // UI state
        get showConfirmReset() { return showConfirmReset; },
        set showConfirmReset(v: boolean) { showConfirmReset = v; },

        // Functions
        submitRound,
        undoLastRound,
        resetGame,
        fullReset,
        setOneTwo,
        addBonus,
        save,
        load,
        clearSave,
        dismissWin,
    };
}
