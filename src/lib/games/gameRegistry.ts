export interface GameConfig {
	id: string;
	name: string;
	displayTitle: string;
	gameUrl: string;
	difficulties: string[];
	difficultyLabels: Record<string, string>;
	localStorageSaveKey: string;
	hasTutorials: boolean;
}

export const GAME_REGISTRY: Record<string, GameConfig> = {
	sudoku: {
		id: 'sudoku',
		name: '스도쿠',
		displayTitle: 'Sudoku',
		gameUrl: '/minigames/sudoku?mode=standard',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'sudoku_save',
		hasTutorials: true
	},
	'killer-sudoku': {
		id: 'killer-sudoku',
		name: '킬러 스도쿠',
		displayTitle: 'Killer Sudoku',
		gameUrl: '/minigames/sudoku?mode=killer',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'killer_sudoku_save',
		hasTutorials: true
	},
	'unblock-me': {
		id: 'unblock-me',
		name: '언블록미',
		displayTitle: 'Unblock Me',
		gameUrl: '/minigames/unblock-me',
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
	},
	energy: {
		id: 'energy',
		name: '에너지 서킷',
		displayTitle: 'Energy Circuit',
		gameUrl: '/minigames/energy',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'energy_save',
		hasTutorials: true
	},
	'water-sort': {
		id: 'water-sort',
		name: '워터소트',
		displayTitle: 'Water Sort',
		gameUrl: '/minigames/water-sort',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'watersort_save',
		hasTutorials: false
	},
	'triple-tile': {
		id: 'triple-tile',
		name: '트리플 타일',
		displayTitle: 'Triple Tile',
		gameUrl: '/minigames/triple-tile',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'triple_tile_save',
		hasTutorials: true
	},
	'train-tracks': {
		id: 'train-tracks',
		name: '트레인 트랙',
		displayTitle: 'Train Tracks',
		gameUrl: '/minigames/train-tracks',
		difficulties: ['easy', 'medium', 'hard', 'expert', 'master'],
		difficultyLabels: {
			easy: '쉬움',
			medium: '보통',
			hard: '어려움',
			expert: '전문가',
			master: '마스터'
		},
		localStorageSaveKey: 'train_tracks_save',
		hasTutorials: false
	},
	'2048': {
		id: '2048',
		name: '2048',
		displayTitle: '2048',
		gameUrl: '/minigames/2048',
		difficulties: ['classic'],
		difficultyLabels: {
			classic: '클래식'
		},
		localStorageSaveKey: '2048_save',
		hasTutorials: false
	}
};
