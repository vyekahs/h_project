import { browser } from '$app/environment';
import { KILLER_TUTORIALS, KILLER_TUTORIAL_ORDER } from './killerTutorialData';

export function createKillerTutorialLogic(
    getCompletedTutorials: () => string[],
    openTutorial: (id: string) => void
) {
    // Unlocked list for UI - combines DB + localStorage
    function getUnlockedTutorialIDs(): Set<string> {
        const db = getCompletedTutorials();
        const local = browser ? JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]') : [];
        return new Set([...db, ...local]);
    }

    function checkAndShowTutorial(diff: string): boolean {
        if (!browser) return false;

        const unlocked = getUnlockedTutorialIDs();
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

    return {
        get tutorialOrder() { return KILLER_TUTORIAL_ORDER; },
        get tutorials() { return KILLER_TUTORIALS; },
        get unlockedTutorialIDs() { return getUnlockedTutorialIDs(); },
        checkAndShowTutorial,
    };
}
