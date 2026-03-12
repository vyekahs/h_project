export interface TutorialTile {
	row: number;
	col: number;
	trackType: 'empty' | 'straight' | 'corner' | 'start' | 'finish';
	rotation: number;
	isFixed?: boolean;
	isStart?: boolean;
	isFinish?: boolean;
	playerMarkedEmpty?: boolean;
	highlight?: boolean;
	wrong?: boolean;
}

export interface TrainTracksTutorialStep {
	title: string;
	desc: string;
	gridSize: number;
	tiles?: TutorialTile[];
	rowCounts?: (number | null)[];
	colCounts?: (number | null)[];
	rowStatus?: ('correct' | 'over' | 'under' | null)[];
	colStatus?: ('correct' | 'over' | 'under' | null)[];
	illustration?: string[];
}

// Rotation reference (from types.ts):
// straight: rot=0 → LEFT↔RIGHT (horizontal), rot=1 → TOP↔BOTTOM (vertical)
// corner:   rot=0 → TOP↔RIGHT, rot=1 → RIGHT↔BOTTOM, rot=2 → BOTTOM↔LEFT, rot=3 → LEFT↔TOP
// start/finish: rot=0 → opens RIGHT, rot=1 → opens BOTTOM, rot=2 → opens LEFT, rot=3 → opens TOP

export const TUTORIAL_STEPS: TrainTracksTutorialStep[] = [
	{
		// Step 1: 게임 목표 - S에서 F까지 연결된 경로
		// 4x4 board with path: S(0,0)→(0,1)→(0,2)→(1,2)→(2,2)→(2,1)→(2,0)→(3,0)→F(3,0 edge)
		title: '게임 목표',
		desc: '시작점 <b>S</b>에서 도착점 <b>F</b>까지<br>하나의 연결된 <b>철도 경로</b>를 완성하세요.',
		gridSize: 4,
		tiles: [
			// S opens RIGHT at (0,0)
			{ row: 0, col: 0, trackType: 'start', rotation: 0, isFixed: true, isStart: true },
			// (0,1) horizontal straight
			{ row: 0, col: 1, trackType: 'straight', rotation: 0, isFixed: true },
			// (0,2) corner: LEFT→BOTTOM = rot 2? No. We need RIGHT from left + down.
			// Incoming from LEFT, exiting BOTTOM → connects LEFT↔BOTTOM = rot 2 (BOTTOM↔LEFT)
			{ row: 0, col: 2, trackType: 'corner', rotation: 2, isFixed: true },
			// (1,2) vertical straight
			{ row: 1, col: 2, trackType: 'straight', rotation: 1, isFixed: true },
			// (2,2) corner: TOP↔LEFT = rot 3 (LEFT↔TOP)
			{ row: 2, col: 2, trackType: 'corner', rotation: 3, isFixed: true },
			// (2,1) horizontal straight
			{ row: 2, col: 1, trackType: 'straight', rotation: 0, isFixed: true },
			// (2,0) corner: RIGHT↔BOTTOM = rot 1
			{ row: 2, col: 0, trackType: 'corner', rotation: 1, isFixed: true },
			// (3,0) F opens TOP → rot 3
			{ row: 3, col: 0, trackType: 'finish', rotation: 3, isFixed: true, isFinish: true }
		]
	},
	{
		// Step 2: 숫자 힌트
		// 3x3 board with row/col counts and color status
		title: '숫자 힌트',
		desc: '행/열 옆의 숫자는 해당 줄에 들어갈<br><b>선로 조각의 개수</b>를 나타냅니다.<br><span style="color:#16a34a">초록</span> = 정확, <span style="color:#dc2626">빨강</span> = 초과',
		gridSize: 3,
		tiles: [
			// Row 0: horizontal straight at (0,0), corner at (0,2)
			{ row: 0, col: 0, trackType: 'straight', rotation: 0, isFixed: true },
			{ row: 0, col: 2, trackType: 'corner', rotation: 2, isFixed: true },
			// Row 1: vertical at (1,2)
			{ row: 1, col: 2, trackType: 'straight', rotation: 1, isFixed: true },
			// Row 2: horizontal at (2,0), corner at (2,2)
			{ row: 2, col: 0, trackType: 'straight', rotation: 0, isFixed: true },
			{ row: 2, col: 2, trackType: 'corner', rotation: 3, isFixed: false }
		],
		rowCounts: [2, 1, 2],
		colCounts: [2, 0, 2],
		rowStatus: ['correct', 'correct', 'correct'],
		colStatus: ['correct', 'correct', 'over']
	},
	{
		// Step 3: 트랙 종류 - 직선 2종 + 커브 4종 진열
		title: '트랙 종류',
		desc: '하단 팔레트에서 <b>트랙 종류를 선택</b>한 뒤<br>빈 셀을 터치하면 배치됩니다.',
		gridSize: 3,
		tiles: [
			// Row 0: 직선 가로(rot=0), 직선 세로(rot=1)
			{ row: 0, col: 0, trackType: 'straight', rotation: 0, isFixed: true },
			{ row: 0, col: 1, trackType: 'straight', rotation: 1, isFixed: true },
			// Row 1: 커브 rot=0(TOP↔RIGHT), rot=1(RIGHT↔BOTTOM)
			{ row: 1, col: 0, trackType: 'corner', rotation: 0, isFixed: true },
			{ row: 1, col: 1, trackType: 'corner', rotation: 1, isFixed: true },
			// Row 2: 커브 rot=2(BOTTOM↔LEFT), rot=3(LEFT↔TOP)
			{ row: 2, col: 0, trackType: 'corner', rotation: 2, isFixed: true },
			{ row: 2, col: 1, trackType: 'corner', rotation: 3, isFixed: true }
		]
	},
	{
		// Step 4: 편의 도구 - X마크 예시 보드
		title: '편의 도구',
		desc: '<b>지우개</b>: 배치한 트랙을 제거합니다.<br><b>✕ 마크</b>: 빈칸임을 표시합니다.<br><b>되돌리기</b>: 직전 조작을 취소합니다.',
		gridSize: 3,
		tiles: [
			{ row: 0, col: 0, trackType: 'straight', rotation: 0, isFixed: true },
			{ row: 0, col: 1, trackType: 'corner', rotation: 1, isFixed: true },
			// X mark examples (empty cells with playerMarkedEmpty)
			{ row: 1, col: 0, trackType: 'empty', rotation: 0, playerMarkedEmpty: true },
			{ row: 2, col: 2, trackType: 'empty', rotation: 0, playerMarkedEmpty: true }
		]
	},
	{
		// Step 5: 승리와 패배
		title: '승리와 패배',
		desc: '정답과 다른 트랙을 놓으면 <b>실수</b>입니다.<br>최대 실수 횟수를 넘기면 <b>게임 오버!</b><br>모든 선로를 올바르게 연결하면 승리합니다.',
		gridSize: 3,
		tiles: [
			{ row: 0, col: 0, trackType: 'straight', rotation: 0, isFixed: true },
			{ row: 0, col: 1, trackType: 'corner', rotation: 2, isFixed: true },
			{ row: 1, col: 1, trackType: 'straight', rotation: 1, isFixed: true },
			// correct placement (green highlight)
			{ row: 1, col: 0, trackType: 'straight', rotation: 1, highlight: true },
			// wrong placement (red overlay)
			{ row: 2, col: 0, trackType: 'corner', rotation: 0, wrong: true }
		]
	}
];
