export interface GameConfig {
	id: string;
	name: string;
	displayTitle: string;
	gameUrl: string;
	difficulties: string[];
	difficultyLabels: Record<string, string>;
	localStorageSaveKey: string;
	hasTutorials: boolean;
	tutorialPrefix?: string; // e.g. 'sudoku_' or 'killer_'
	tutorialLocalStorageKey?: string;
}

export const GAME_REGISTRY: Record<string, GameConfig> = {
	sudoku: {
		id: 'sudoku',
		name: '스도쿠',
		displayTitle: 'Sudoku',
		gameUrl: '/games/sudoku?mode=standard',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'sudoku_save',
		hasTutorials: true,
		tutorialPrefix: 'sudoku_',
		tutorialLocalStorageKey: 'sudoku_unlocked_tutorials'
	},
	'killer-sudoku': {
		id: 'killer-sudoku',
		name: '킬러 스도쿠',
		displayTitle: 'Killer Sudoku',
		gameUrl: '/games/sudoku?mode=killer',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'killer_sudoku_save',
		hasTutorials: true,
		tutorialPrefix: 'killer_',
		tutorialLocalStorageKey: 'killer_sudoku_unlocked_tutorials'
	},
	'unblock-me': {
		id: 'unblock-me',
		name: '언블록미',
		displayTitle: 'Unblock Me',
		gameUrl: '/games/unblock-me',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'unblockme_save',
		hasTutorials: false
	}
};
