export interface TrainTracksTutorialStep {
	title: string;
	desc: string;
	illustration?: string[];
}

export const TUTORIAL_STEPS: TrainTracksTutorialStep[] = [
	{
		title: '게임 목표',
		desc: '시작점 <b>S</b>에서 도착점 <b>F</b>까지<br>하나의 연결된 <b>철도 경로</b>를 완성하세요.',
		illustration: [
			'S ━━ ┓',
			'      ┃',
			'   ┏━ ┛',
			'   ┃',
			'   F'
		]
	},
	{
		title: '숫자 힌트',
		desc: '행/열 옆의 숫자는 해당 줄에 들어갈<br><b>선로 조각의 개수</b>를 나타냅니다.<br>초록색 = 정확, 빨간색 = 초과',
		illustration: [
			'    2  1  2',
			'2 │ ━  ·  ┓ │',
			'1 │ ·  ·  ┃ │',
			'2 │ ━  ·  ┛ │'
		]
	},
	{
		title: '트랙 종류',
		desc: '하단 팔레트에서 <b>트랙 종류를 선택</b>한 뒤<br>빈 셀을 터치하면 배치됩니다.',
		illustration: [
			'직선: ━ (가로)  ┃ (세로)',
			'',
			'커브: ┗  ┏  ┓  ┛',
			'',
			'팔레트에서 선택 → 셀 터치!'
		]
	},
	{
		title: '편의 도구',
		desc: '<b>지우개</b>: 배치한 트랙을 제거합니다.<br><b>✕ 마크</b>: 빈칸임을 표시합니다.<br><b>되돌리기</b>: 직전 조작을 취소합니다.',
		illustration: [
			'⌫  지우개 — 트랙 제거',
			'✕  빈칸 표시 — 추론 보조',
			'↩  되돌리기 — 실수 복구'
		]
	},
	{
		title: '승리와 패배',
		desc: '정답과 다른 트랙을 놓으면 <b>실수</b>입니다.<br>최대 실수 횟수를 넘기면 <b>게임 오버!</b><br>모든 선로를 올바르게 연결하면 승리합니다.',
		illustration: [
			'✅ 정답과 일치 → OK',
			'❌ 정답과 불일치 → 실수 +1',
			'',
			'실수 3/3 → 💥 게임 오버'
		]
	}
];
