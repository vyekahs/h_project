export interface TripleTileTutorialStep {
	title: string;
	desc: string;
	/** Lines of emoji/text to render as a visual illustration */
	illustration?: string[];
}

export interface TripleTileTutorial {
	id: string;
	difficulty: string;
	title: string;
	steps: TripleTileTutorialStep[];
}

export const TUTORIALS: Record<string, TripleTileTutorial> = {
	triple_tile_easy_1: {
		id: 'triple_tile_easy_1',
		difficulty: 'easy',
		title: '기본 규칙',
		steps: [
			{
				title: '게임 목표',
				desc: '보드 위의 타일을 터치해서 <b>같은 그림 3개</b>를 모으면 사라집니다.<br>모든 타일을 없애면 <b>클리어!</b>',
				illustration: ['🍎 🍊 🍋 🍇 🍓', '탭! → 같은 타일 3개 → 💥 제거!']
			},
			{
				title: '스테이징 영역',
				desc: '터치한 타일은 화면 아래 <b>7칸짜리 슬롯</b>에 들어갑니다.<br>같은 종류가 <b>3개</b> 모이면 자동으로 제거됩니다.',
				illustration: [
					'[ 🍎 ][ 🍊 ][ 🍎 ][ 🍇 ][ 🍎 ][   ][   ]',
					'🍎 × 3 → 매치! 자동 제거 ✨'
				]
			},
			{
				title: '게임 오버',
				desc: '슬롯 <b>7칸이 모두 차면</b> 게임 오버!<br>3개를 맞출 수 없는 상태가 되지 않도록 <b>신중하게</b> 타일을 선택하세요.',
				illustration: [
					'[ 🍎 ][ 🍊 ][ 🍋 ][ 🍇 ][ 🍓 ][ 🍑 ][ 🍒 ]',
					'7칸 꽉 참 → ❌ Game Over'
				]
			},
			{
				title: '타일 선택 규칙',
				desc: '모든 타일을 바로 선택할 수 있는 건 아닙니다!<br><b>위 레이어</b>에 덮여 있거나 <b>양쪽이 모두 막힌</b> 타일은 선택할 수 없습니다.',
				illustration: [
					'── 레이어 구조 ──',
					'   🍎        ⬅ 2층 (선택 가능)',
					'  ╱  ╲',
					'🍊    🍋     ⬅ 1층 (🍎에 덮여서 불가)',
					'',
					'── 좌우 막힘 ──',
					'🍇  🍓  🍑   ⬅ 🍓는 양쪽 막힘!'
				]
			},
			{
				title: '셔플 & 되돌리기',
				desc: '<b>🔀 셔플</b>: 보드의 타일 배치를 섞습니다. 횟수 제한이 있으니 아껴 쓰세요!<br><b>↩️ 되돌리기</b>: 마지막에 선택한 타일을 보드로 되돌립니다.',
				illustration: ['🔀 셔플 — 막혔을 때 사용', '↩️ 되돌리기 — 실수 취소']
			}
		]
	}
};

export const TUTORIAL_ORDER = ['triple_tile_easy_1'];