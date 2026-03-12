import type { TileType } from '$lib/games/energy/types';

export interface EnergyTutorialTile {
	row: number;
	col: number;
	type: TileType;
	rotation: number;
	powered?: boolean;
	fixed?: boolean;
}

export interface EnergyTutorialStep {
	title: string;
	desc: string;
	gridSize: number;
	tiles?: EnergyTutorialTile[];
	highlightCells?: string[]; // "cell-r-c"
	animateRotate?: { row: number; col: number };
}

export interface EnergyTutorial {
	id: string;
	difficulty: string;
	title: string;
	steps: EnergyTutorialStep[];
}

// ===================================================================
// Direction reference (from types.ts):
//   TOP=0, RIGHT=1, BOTTOM=2, LEFT=3
//
// Base connections at rotation=0:
//   straight: LEFT, RIGHT        (horizontal line)
//   corner:   TOP, RIGHT         (┘ shape — opens up and right)
//   tee:      TOP, RIGHT, BOTTOM (├ shape — opens up, right, down)
//   cross:    all 4
//   bulb:     BOTTOM             (opens down)
//   source:   all 4
//
// Rotation formula: each base direction + rotation (mod 4)
//   rot=0: as-is
//   rot=1: TOP→RIGHT, RIGHT→BOTTOM, BOTTOM→LEFT, LEFT→TOP
//   rot=2: TOP→BOTTOM, RIGHT→LEFT, BOTTOM→TOP, LEFT→RIGHT
//   rot=3: TOP→LEFT, RIGHT→TOP, BOTTOM→RIGHT, LEFT→BOTTOM
//
// Quick lookup for common needs:
//   straight rot=0: LEFT,RIGHT (─)   rot=1: TOP,BOTTOM (│)
//   corner   rot=0: TOP,RIGHT (┘)    rot=1: RIGHT,BOTTOM (┐)
//            rot=2: BOTTOM,LEFT (┌)  rot=3: TOP,LEFT (└)
//   tee      rot=0: TOP,RIGHT,BOTTOM (├)  rot=1: RIGHT,BOTTOM,LEFT (┬)
//            rot=2: TOP,BOTTOM,LEFT (┤)   rot=3: TOP,RIGHT,LEFT (┴)
//   bulb     rot=0: BOTTOM (↓)  rot=1: LEFT (←)  rot=2: TOP (↑)  rot=3: RIGHT (→)
// ===================================================================

export const ENERGY_TUTORIALS: Record<string, EnergyTutorial> = {
	energy_easy_1: {
		id: 'energy_easy_1',
		difficulty: 'easy',
		title: '기본 규칙',
		steps: [
			{
				title: '게임 규칙이 변경되었습니다!',
				desc: '이제 전구만 켜는 것이 아니라, <b>모든 조각을 빠짐없이 연결</b>해야 클리어됩니다. 회색 조각이 하나라도 남아있으면 클리어되지 않습니다!',
				gridSize: 3,
				tiles: [
					{ row: 1, col: 1, type: 'source', rotation: 0, powered: true, fixed: true },
					{ row: 0, col: 1, type: 'bulb', rotation: 0, powered: true },
					{ row: 1, col: 2, type: 'bulb', rotation: 1, powered: true },
					{ row: 2, col: 1, type: 'straight', rotation: 1, powered: false },
					{ row: 1, col: 0, type: 'corner', rotation: 1, powered: false }
				]
			},
			{
				// source → straight → bulb, all powered, horizontal left-to-right
				title: '에너지 서킷이란?',
				desc: '<b>전원(⚡)</b>에서 모든 조각을 회전시켜 연결해 <b>전체 회로를 완성</b>하는 퍼즐입니다.',
				gridSize: 3,
				tiles: [
					// source(1,0): all dirs, connects RIGHT to straight(1,1)
					{ row: 1, col: 0, type: 'source', rotation: 0, powered: true, fixed: true },
					// straight(1,1) rot=0: LEFT,RIGHT — connects LEFT to source, RIGHT to bulb
					{ row: 1, col: 1, type: 'straight', rotation: 0, powered: true },
					// bulb(1,2): need to open LEFT → base=BOTTOM, need BOTTOM+rot=LEFT(3) → rot=1
					{ row: 1, col: 2, type: 'bulb', rotation: 1, powered: true }
				]
			},
			{
				title: '탭하면 회전!',
				desc: '조각을 <b>탭</b>하면 시계방향으로 <b>90도</b> 회전합니다. 파이프 방향을 맞춰서 연결하세요!',
				gridSize: 3,
				tiles: [{ row: 1, col: 1, type: 'corner', rotation: 0, powered: false }],
				highlightCells: ['cell-1-1'],
				animateRotate: { row: 1, col: 1 }
			},
			{
				// source at top, vertical pipe, then corner going right but disconnected parts
				// Shows: connected=yellow, disconnected=grey
				title: '전기의 흐름',
				desc: '전원에서 <b>연결된 파이프</b>를 따라 전기가 흐릅니다. 연결된 조각은 <b>노란색</b>, 안 된 조각은 <b>회색</b>으로 표시됩니다. <b>모든 조각이 노란색</b>이 되어야 클리어!',
				gridSize: 3,
				tiles: [
					// source(0,1): all dirs, powered
					{ row: 0, col: 1, type: 'source', rotation: 0, powered: true, fixed: true },
					// straight(1,1) rot=1: TOP,BOTTOM (vertical) — connects source at TOP, corner at BOTTOM
					{ row: 1, col: 1, type: 'straight', rotation: 1, powered: true },
					// corner(2,1): need TOP,RIGHT → rot=0 opens TOP,RIGHT ✓
					{ row: 2, col: 1, type: 'corner', rotation: 0, powered: true },
					// straight(2,2) rot=0: LEFT,RIGHT — connects corner on LEFT, powered
					{ row: 2, col: 2, type: 'straight', rotation: 0, powered: true },
					// bulb(2,0): wrongly rotated (grey) — e.g. rot=3 opens RIGHT,
					// but corner(2,1) opens TOP,RIGHT, not LEFT. So bulb(2,0) can't connect.
					{ row: 2, col: 0, type: 'bulb', rotation: 3, powered: false }
				]
			},
			{
				// All bulbs powered — complete circuit
				title: '목표: 모든 조각 연결하기!',
				desc: '모든 조각이 전원에 연결되면 <b>클리어</b>! 가능한 적은 회전으로 풀면 더 높은 점수를 받습니다.',
				gridSize: 3,
				tiles: [
					// source(1,1): center, all dirs, powered
					{ row: 1, col: 1, type: 'source', rotation: 0, powered: true, fixed: true },
					// bulb(0,1): need BOTTOM to connect source → rot=0 opens BOTTOM ✓
					{ row: 0, col: 1, type: 'bulb', rotation: 0, powered: true },
					// bulb(1,0): need RIGHT to connect source → rot=3 opens RIGHT ✓
					{ row: 1, col: 0, type: 'bulb', rotation: 3, powered: true },
					// bulb(1,2): need LEFT to connect source → rot=1 opens LEFT ✓
					{ row: 1, col: 2, type: 'bulb', rotation: 1, powered: true },
					// bulb(2,1): need TOP to connect source → rot=2 opens TOP ✓
					{ row: 2, col: 1, type: 'bulb', rotation: 2, powered: true }
				]
			}
		]
	},

	energy_easy_2: {
		id: 'energy_easy_2',
		difficulty: 'easy',
		title: '조각 유형',
		steps: [
			{
				title: '직선 (Straight)',
				desc: '양쪽 방향으로 연결합니다. <b>180도 대칭</b>이라 회전 상태가 <b>2가지</b>뿐입니다. (가로 / 세로)',
				gridSize: 3,
				tiles: [
					// straight rot=0: LEFT,RIGHT (horizontal ─)
					{ row: 0, col: 1, type: 'straight', rotation: 0, powered: false },
					// straight rot=1: TOP,BOTTOM (vertical │)
					{ row: 2, col: 1, type: 'straight', rotation: 1, powered: false }
				],
				highlightCells: ['cell-0-1', 'cell-2-1']
			},
			{
				title: 'ㄱ자 (Corner)',
				desc: '인접한 <b>두 방향</b>을 연결합니다. <b>4가지</b> 회전 상태가 있어요.',
				gridSize: 4,
				tiles: [
					// Show all 4 rotations in a 2x2 arrangement
					// rot=0: TOP,RIGHT (┘)
					{ row: 0, col: 0, type: 'corner', rotation: 0, powered: false },
					// rot=1: RIGHT,BOTTOM (┐)
					{ row: 0, col: 2, type: 'corner', rotation: 1, powered: false },
					// rot=2: BOTTOM,LEFT (┌)
					{ row: 2, col: 0, type: 'corner', rotation: 2, powered: false },
					// rot=3: TOP,LEFT (└)
					{ row: 2, col: 2, type: 'corner', rotation: 3, powered: false }
				],
				highlightCells: ['cell-0-0', 'cell-0-2', 'cell-2-0', 'cell-2-2']
			},
			{
				title: 'T자 (Tee)',
				desc: '<b>세 방향</b>으로 연결합니다. 분기가 필요할 때 유용합니다. <b>4가지</b> 회전 상태.',
				gridSize: 3,
				tiles: [{ row: 1, col: 1, type: 'tee', rotation: 0, powered: false }],
				highlightCells: ['cell-1-1'],
				animateRotate: { row: 1, col: 1 }
			},
			{
				title: '십자 (Cross)',
				desc: '<b>사방</b>으로 모두 연결합니다. 회전해도 모양이 같으므로 <b>회전할 필요가 없는</b> 조각입니다!',
				gridSize: 3,
				tiles: [{ row: 1, col: 1, type: 'cross', rotation: 0, powered: false }],
				highlightCells: ['cell-1-1']
			}
		]
	},

	energy_easy_3: {
		id: 'energy_easy_3',
		difficulty: 'easy',
		title: '풀이 전략',
		steps: [
			{
				title: '끝 조각부터 시작하세요',
				desc: '전구(끝 조각)는 연결이 <b>1개</b>뿐입니다. 옆에 어떤 조각이 있는지 보면 회전 방향이 바로 확정됩니다!',
				gridSize: 4,
				tiles: [
					// source(1,1) → straight(1,2) → bulb(1,3) horizontal
					// source(1,1) → corner(0,1) → bulb(0,0)
					{ row: 1, col: 1, type: 'source', rotation: 0, powered: true, fixed: true },
					// straight(1,2) rot=0: LEFT,RIGHT — connects source LEFT, bulb RIGHT
					{ row: 1, col: 2, type: 'straight', rotation: 0, powered: true },
					// bulb(1,3): need LEFT → rot=1 opens LEFT ✓
					{ row: 1, col: 3, type: 'bulb', rotation: 1, powered: true },
					// corner(0,1): need BOTTOM,LEFT → rot=2 is BOTTOM,LEFT?
					// rot=2: base TOP,RIGHT → +2 = BOTTOM,LEFT ✓
					{ row: 0, col: 1, type: 'corner', rotation: 2, powered: true },
					// bulb(0,0): need RIGHT → rot=3 opens RIGHT ✓
					{ row: 0, col: 0, type: 'bulb', rotation: 3, powered: true }
				],
				highlightCells: ['cell-1-3', 'cell-0-0']
			},
			{
				title: '가장자리 조각을 보세요',
				desc: '보드 <b>테두리</b>에 있는 조각은 밖으로 연결될 수 없습니다. 경우의 수가 줄어들어 방향을 쉽게 결정할 수 있어요.',
				gridSize: 4,
				tiles: [
					// Top row: corner-straight-straight-corner
					// (0,0) corner rot=1: RIGHT,BOTTOM — top-left, can't go up or left ✓
					{ row: 0, col: 0, type: 'corner', rotation: 1, powered: false },
					// (0,1) straight rot=0: LEFT,RIGHT ✓
					{ row: 0, col: 1, type: 'straight', rotation: 0, powered: false },
					// (0,2) straight rot=0: LEFT,RIGHT ✓
					{ row: 0, col: 2, type: 'straight', rotation: 0, powered: false },
					// (0,3) corner rot=2: BOTTOM,LEFT — top-right, can't go up or right ✓
					{ row: 0, col: 3, type: 'corner', rotation: 2, powered: false }
				],
				highlightCells: ['cell-0-0', 'cell-0-3']
			},
			{
				// Small complete circuit — outside-in approach
				title: '바깥에서 안쪽으로',
				desc: '확정된 <b>바깥 조각</b>에서 시작해 <b>안쪽</b>으로 차례대로 맞춰 나가세요. 하나씩 확정하면 점점 쉬워집니다!',
				gridSize: 3,
				tiles: [
					// source(1,1) center
					{ row: 1, col: 1, type: 'source', rotation: 0, powered: true, fixed: true },
					// bulb(0,1): need BOTTOM → rot=0 ✓
					{ row: 0, col: 1, type: 'bulb', rotation: 0, powered: true },
					// bulb(1,0): need RIGHT → rot=3 ✓
					{ row: 1, col: 0, type: 'bulb', rotation: 3, powered: true },
					// bulb(1,2): need LEFT → rot=1 ✓
					{ row: 1, col: 2, type: 'bulb', rotation: 1, powered: true },
					// bulb(2,1): need TOP → rot=2 ✓
					{ row: 2, col: 1, type: 'bulb', rotation: 2, powered: true }
				]
			},
			{
				title: '완성!',
				desc: '모든 조각이 연결되어 전체가 <b>노란색</b>으로 빛나면 클리어! 적은 회전으로 풀수록 높은 점수!',
				gridSize: 4,
				tiles: [
					// A more interesting complete circuit on 4x4
					// source(1,1) → tee(0,1) branches up-left-right
					// source(1,1) → straight(1,2) → bulb(1,3)
					// source(1,1) → corner(2,1) → bulb(2,2)
					{ row: 1, col: 1, type: 'source', rotation: 0, powered: true, fixed: true },
					// tee(0,1) rot=3: TOP,RIGHT,LEFT (┴) — connects source BOTTOM? No...
					// tee connects DOWN to source: need BOTTOM.
					// tee rot=1: RIGHT,BOTTOM,LEFT (┬) — has BOTTOM ✓, LEFT goes to bulb(0,0), RIGHT goes to bulb(0,2)
					{ row: 0, col: 1, type: 'tee', rotation: 1, powered: true },
					// bulb(0,0): need RIGHT → rot=3 ✓
					{ row: 0, col: 0, type: 'bulb', rotation: 3, powered: true },
					// bulb(0,2): need LEFT → rot=1 ✓
					{ row: 0, col: 2, type: 'bulb', rotation: 1, powered: true },
					// straight(1,2) rot=0: LEFT,RIGHT
					{ row: 1, col: 2, type: 'straight', rotation: 0, powered: true },
					// bulb(1,3): need LEFT → rot=1 ✓
					{ row: 1, col: 3, type: 'bulb', rotation: 1, powered: true },
					// corner(2,1): need TOP,RIGHT → rot=0 ✓
					{ row: 2, col: 1, type: 'corner', rotation: 0, powered: true },
					// bulb(2,2): need LEFT → rot=1 ✓
					{ row: 2, col: 2, type: 'bulb', rotation: 1, powered: true }
				]
			}
		]
	},

	energy_medium_1: {
		id: 'energy_medium_1',
		difficulty: 'medium',
		title: '벽 규칙과 소거법',
		steps: [
			{
				title: '벽 규칙',
				desc: '보드 가장자리 조각은 <b>밖으로 열릴 수 없습니다</b>. 예를 들어 왼쪽 위 모서리의 ㄱ자는 반드시 오른쪽+아래로만 열려야 하므로 <b>회전이 바로 확정</b>됩니다!',
				gridSize: 4,
				tiles: [
					// (0,0) corner at top-left: can't open TOP or LEFT → must be RIGHT+BOTTOM → rot=1
					{ row: 0, col: 0, type: 'corner', rotation: 1, powered: false },
					// (0,3) corner at top-right: can't open TOP or RIGHT → must be BOTTOM+LEFT → rot=2
					{ row: 0, col: 3, type: 'corner', rotation: 2, powered: false },
					// (3,0) corner at bottom-left: can't open BOTTOM or LEFT → must be TOP+RIGHT → rot=0
					{ row: 3, col: 0, type: 'corner', rotation: 0, powered: false },
					// (3,3) corner at bottom-right: can't open BOTTOM or RIGHT → must be TOP+LEFT → rot=3
					{ row: 3, col: 3, type: 'corner', rotation: 3, powered: false }
				],
				highlightCells: ['cell-0-0', 'cell-0-3', 'cell-3-0', 'cell-3-3']
			},
			{
				title: 'T자의 벽 규칙',
				desc: 'T자(3방향) 조각이 가장자리에 있으면? 벽 쪽으로 열릴 수 없으니 <b>경우의 수가 4→2개</b>로 줄어듭니다. 윗변의 T자는 아래쪽이 반드시 열려야 해요.',
				gridSize: 4,
				tiles: [
					// (0,1) tee at top edge: can't open TOP
					// Two valid: rot=1 (RIGHT,BOTTOM,LEFT) or rot=2 (BOTTOM,LEFT,... no)
					// Let's show rot=1: opens RIGHT,BOTTOM,LEFT (no TOP) ✓
					{ row: 0, col: 1, type: 'tee', rotation: 1, powered: false },
					// (2,0) tee at left edge: can't open LEFT
					// rot=0: TOP,RIGHT,BOTTOM (no LEFT) ✓
					{ row: 2, col: 0, type: 'tee', rotation: 0, powered: false },
					// (3,2) tee at bottom edge: can't open BOTTOM
					// rot=3: LEFT,TOP,RIGHT (no BOTTOM) ✓
					{ row: 3, col: 2, type: 'tee', rotation: 3, powered: false }
				],
				highlightCells: ['cell-0-1', 'cell-2-0', 'cell-3-2']
			},
			{
				title: '이웃에서 역추론하기',
				desc: '확정된 조각의 <b>열린 방향</b>을 보면, 인접한 조각도 그 쪽이 열려야 합니다. 이미 맞춘 조각에서 <b>연쇄적으로</b> 다음 조각을 확정하세요!',
				gridSize: 4,
				tiles: [
					// source(1,0) connects RIGHT → corner(1,1) must open LEFT
					// corner also at row 1 middle, so it goes down → straight(2,1) must be vertical
					{ row: 1, col: 0, type: 'source', rotation: 0, powered: true, fixed: true },
					// corner(1,1): needs LEFT (from source) and BOTTOM (to continue) → rot=2: BOTTOM,LEFT ✓
					{ row: 1, col: 1, type: 'corner', rotation: 2, powered: true },
					// straight(2,1): needs TOP (from corner) and BOTTOM (to continue) → rot=1: TOP,BOTTOM ✓
					{ row: 2, col: 1, type: 'straight', rotation: 1, powered: true },
					// bulb(3,1): needs TOP → rot=2: opens TOP ✓
					{ row: 3, col: 1, type: 'bulb', rotation: 2, powered: true }
				],
				highlightCells: ['cell-1-1', 'cell-2-1', 'cell-3-1']
			}
		]
	}
};

export const ENERGY_TUTORIAL_ORDER = [
	'energy_easy_1',
	'energy_easy_2',
	'energy_easy_3',
	'energy_medium_1'
];
