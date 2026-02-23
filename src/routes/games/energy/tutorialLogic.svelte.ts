import { browser } from '$app/environment';
import { ENERGY_TUTORIALS, ENERGY_TUTORIAL_ORDER } from './energyTutorialData';

export function createEnergyTutorialLogic(
	getCompletedTutorials: () => string[],
	openTutorial: (id: string) => void
) {
	function getUnlockedTutorialIDs(): Set<string> {
		const db = getCompletedTutorials();
		const local = browser
			? JSON.parse(localStorage.getItem('energy_unlocked_tutorials') || '[]')
			: [];
		return new Set([...db, ...local]);
	}

	function checkAndShowTutorial(diff: string): boolean {
		if (!browser) return false;

		const unlocked = getUnlockedTutorialIDs();
		let targetId: string | null = null;

		if (diff === 'easy') {
			if (!unlocked.has('energy_easy_1')) targetId = 'energy_easy_1';
			else if (!unlocked.has('energy_easy_2')) targetId = 'energy_easy_2';
			else if (!unlocked.has('energy_easy_3')) targetId = 'energy_easy_3';
		} else if (diff === 'medium') {
			if (unlocked.has('energy_easy_3')) {
				if (!unlocked.has('energy_medium_1')) targetId = 'energy_medium_1';
			}
		}

		if (targetId) {
			openTutorial(targetId);
			return true;
		}
		return false;
	}

	return {
		get tutorials() {
			return ENERGY_TUTORIALS;
		},
		get tutorialOrder() {
			return ENERGY_TUTORIAL_ORDER;
		},
		get unlockedTutorialIDs() {
			return getUnlockedTutorialIDs();
		},
		checkAndShowTutorial
	};
}
