import { browser } from '$app/environment';
import { TUTORIAL_ORDER, TUTORIALS } from './tutorialData';
import { KILLER_TUTORIALS, KILLER_TUTORIAL_ORDER } from '../killer-sudoku/killerTutorialData';
import type { GameMode } from './gameLogic.svelte';

export function createTutorialLogic(
    getGameMode: () => GameMode,
    getCompletedTutorials: () => string[],
    openTutorial: (id: string) => void
) {
    let currentTutorialOrder = $derived(getGameMode() === 'killer' ? KILLER_TUTORIAL_ORDER : TUTORIAL_ORDER);
    let currentTutorials = $derived(getGameMode() === 'killer' ? KILLER_TUTORIALS : TUTORIALS);

    // Unlocked list for UI - combines DB + localStorage
    function getUnlockedTutorialIDs(): Set<string> {
        const db = getCompletedTutorials();
        const localStandard = browser ? JSON.parse(localStorage.getItem('sudoku_unlocked_tutorials') || '[]') : [];
        const localKiller = browser ? JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]') : [];
        return new Set([...db, ...localStandard, ...localKiller]);
    }

    function checkAndShowTutorial(diff: string): boolean {
        if (!browser) return false;

        const gameMode = getGameMode();
        const unlocked = getUnlockedTutorialIDs();

        // Killer Sudoku Logic
        if (gameMode === 'killer') {
            let targetId: string | null = null;

            if (diff === 'easy') {
                if (!unlocked.has('killer_easy_1')) targetId = 'killer_easy_1';
                else if (!unlocked.has('killer_easy_2')) targetId = 'killer_easy_2';
                else if (!unlocked.has('killer_easy_3')) targetId = 'killer_easy_3';
            } else if (diff === 'medium') {
                if (unlocked.has('killer_easy_3')) {
                    if (!unlocked.has('killer_medium_1')) targetId = 'killer_medium_1';
                    else if (!unlocked.has('killer_medium_2')) targetId = 'killer_medium_2';
                }
            } else if (diff === 'hard') {
                if (unlocked.has('killer_medium_2')) {
                    if (!unlocked.has('killer_hard_1')) targetId = 'killer_hard_1';
                    else if (!unlocked.has('killer_hard_2')) targetId = 'killer_hard_2';
                }
            } else if (diff === 'expert' || diff === 'master') {
                if (unlocked.has('killer_hard_2')) {
                    if (!unlocked.has('killer_expert_1')) targetId = 'killer_expert_1';
                }
            }

            if (targetId) {
                openTutorial(targetId);
                return true;
            }
            return false;
        }

        // Standard Sudoku Logic
        let targetId: string | null = null;

        if (diff === 'easy') {
            if (!unlocked.has('sudoku_easy_1')) targetId = 'sudoku_easy_1';
            else if (!unlocked.has('sudoku_easy_2')) targetId = 'sudoku_easy_2';
            else if (!unlocked.has('sudoku_easy_3')) targetId = 'sudoku_easy_3';
        } else if (diff === 'medium') {
            if (unlocked.has('sudoku_easy_3')) {
                if (!unlocked.has('sudoku_medium_1')) targetId = 'sudoku_medium_1';
                else if (!unlocked.has('sudoku_medium_2')) targetId = 'sudoku_medium_2';
            }
        } else if (diff === 'hard') {
            if (unlocked.has('sudoku_medium_2')) {
                if (!unlocked.has('sudoku_hard_1')) targetId = 'sudoku_hard_1';
                else if (!unlocked.has('sudoku_hard_2')) targetId = 'sudoku_hard_2';
            }
        } else if (diff === 'expert' || diff === 'master') {
            if (unlocked.has('sudoku_hard_2')) {
                if (!unlocked.has('sudoku_expert_1')) targetId = 'sudoku_expert_1';
                else if (!unlocked.has('sudoku_expert_2')) targetId = 'sudoku_expert_2';
                else if (!unlocked.has('sudoku_expert_3')) targetId = 'sudoku_expert_3';
            }
        }

        if (targetId) {
            openTutorial(targetId);
            return true;
        }
        return false;
    }

    return {
        get currentTutorialOrder() { return currentTutorialOrder; },
        get currentTutorials() { return currentTutorials; },
        get unlockedTutorialIDs() { return getUnlockedTutorialIDs(); },
        checkAndShowTutorial,
    };
}
