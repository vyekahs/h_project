export interface FreecellTutorialStep {
	title: string;
	desc: string;
	cards?: {
		tableau?: string[][];
		freeCells?: (string | null)[];
		foundations?: (string | null)[];
	};
	highlightAreas?: string[];
	targetCards?: string[];
}

export interface FreecellTutorial {
	id: string;
	difficulty: string;
	title: string;
	steps: FreecellTutorialStep[];
}

export const TUTORIALS: Record<string, FreecellTutorial> = {
	freecell_basics: {
		id: 'freecell_basics',
		difficulty: 'easy',
		title: '처음이라면',
		steps: [
			{
				title: '🎯 게임 목표',
				desc: '오른쪽 위 <b>♠ ♥ ♦ ♣ 완성 칸</b>에<br>각 문양별로 <b>A → 2 → 3 → ... → K</b> 순서로<br>모든 카드를 올리면 승리!',
				cards: {
					tableau: [['K♠', 'Q♥', 'J♠'], ['10♥', '9♠']],
					freeCells: [null, null, null, null],
					foundations: ['A♠', 'A♥', null, null]
				},
				highlightAreas: ['foundation']
			},
			{
				title: '👆 카드 옮기기',
				desc: '카드를 <b>탭</b>하면 선택됩니다 (위로 살짝 올라가요).<br>그 다음 <b>놓을 곳을 탭</b>하면 이동!<br><br>💡 길게 누르면 <b>드래그</b>로도 옮길 수 있어요.',
				cards: {
					tableau: [['K♠', 'Q♥'], ['J♠', '10♥'], ['9♠']],
					freeCells: [null, null, null, null],
					foundations: [null, null, null, null]
				}
			},
			{
				title: '📋 쌓기 규칙',
				desc: '카드 열에서는 <b>빨강 ↔ 검정 번갈아</b>가면서<br><b>큰 수 → 작은 수</b> 순서로 쌓아요.<br><br>✅ 검정 10 위에 빨간 9<br>❌ 검정 10 위에 검정 9',
				cards: {
					tableau: [['Q♠', 'J♥', '10♠'], ['9♥']],
					freeCells: [null, null, null, null],
					foundations: [null, null, null, null]
				},
				highlightAreas: ['tableau'],
				targetCards: ['9♥']
			},
			{
				title: '⬆️ 완성 칸',
				desc: '오른쪽 위 4칸에 문양별로 <b>A부터</b> 순서대로 올려요.<br><br>💡 카드를 <b>더블 탭</b>하면 자동으로 올라갑니다!<br>안전한 카드는 알아서 올라가니 걱정 마세요.',
				cards: {
					tableau: [['5♠', '4♥'], ['A♦']],
					freeCells: [null, null, null, null],
					foundations: ['3♠', '2♥', null, null]
				},
				highlightAreas: ['foundation'],
				targetCards: ['A♦']
			},
			{
				title: '📦 임시 보관 (FC)',
				desc: '왼쪽 위 <b>FC 4칸</b>에 카드를 1장씩 잠시 보관할 수 있어요.<br>방해되는 카드를 잠깐 치워두는 용도!<br><br>⚠️ 다 채우면 아무것도 못 옮기니 조심하세요.',
				cards: {
					tableau: [['K♠', 'Q♠'], ['J♥']],
					freeCells: ['3♠', '7♥', null, null],
					foundations: [null, null, null, null]
				},
				highlightAreas: ['freecell']
			},
			{
				title: '🟩 빈 열 활용',
				desc: '카드가 다 빠진 <b>빈 열</b>에는 아무 카드나 놓을 수 있어요.<br>임시 보관처럼 활용하거나, 카드 정리용으로 사용!<br><br>💡 빈 열이 많으면 여러 카드를 한 번에 옮길 수 있어요.',
				cards: {
					tableau: [['K♠', 'Q♥', 'J♠'], [], ['9♠'], []],
					freeCells: [null, null, null, null],
					foundations: [null, null, null, null]
				},
				highlightAreas: ['tableau']
			},
			{
				title: '↩️ 되돌리기',
				desc: '실수했어도 괜찮아요!<br>왼쪽 위 <b>↩️ 버튼</b>을 누르면 한 수씩 되돌릴 수 있습니다.<br><br>여러 번 되돌릴 수 있으니 부담 없이 도전해보세요! 🙌',
				cards: {
					tableau: [['K♠', 'Q♥'], ['J♠']],
					freeCells: [null, null, null, null],
					foundations: ['A♠', null, null, null]
				}
			}
		]
	},
	freecell_tips: {
		id: 'freecell_tips',
		difficulty: 'medium',
		title: '이기는 법',
		steps: [
			{
				title: '🔍 A를 찾아라!',
				desc: '게임 시작하면 먼저 <b>A가 어디 묻혀있는지</b> 확인하세요.<br>A를 빨리 꺼내야 게임이 풀립니다!<br><br>💡 A 위에 쌓인 카드들을 하나씩 치워주세요.',
				cards: {
					tableau: [['Q♠', 'J♥', '10♠', 'A♥'], ['K♥', '3♠']],
					freeCells: [null, null, null, null],
					foundations: ['A♠', null, null, null]
				},
				targetCards: ['A♥']
			},
			{
				title: '🟩 빈 열은 금이다!',
				desc: '빈 열이 <b>많을수록</b> 한 번에 옮길 수 있는 카드가 늘어나요.<br><br>빈 열 0개 → 1장만 이동<br>빈 열 1개 → 2장까지<br>빈 열 2개 → 4장까지!<br><br>쉽게 열을 비울 수 있다면 비워두세요.',
				cards: {
					tableau: [['K♠', 'Q♥', 'J♠', '10♥'], [], [], ['9♠']],
					freeCells: [null, null, null, null],
					foundations: [null, null, null, null]
				},
				highlightAreas: ['tableau']
			},
			{
				title: '📦 FC는 아껴서!',
				desc: 'FC(임시 보관) 4칸을 다 채우면<br><b>카드를 1장도 옮길 수 없어요!</b><br><br>❌ FC 4칸 꽉참 = 게임오버 위기<br>✅ FC 2칸 이상 비워두기 = 안전',
				cards: {
					tableau: [['K♠', 'Q♠', 'J♠'], ['10♠']],
					freeCells: ['3♥', '7♠', '5♥', '9♠'],
					foundations: [null, null, null, null]
				},
				highlightAreas: ['freecell']
			},
			{
				title: '👑 킹은 신중하게',
				desc: '킹(K)은 <b>빈 열에만</b> 놓을 수 있어요.<br>킹을 옮기면 그 아래 묻힌 카드가 드러나는데...<br><br>⚠️ 킹 아래에 필요한 카드(A, 2 등)가<br>묻혀있으면 빼내기 정말 어려워요!',
				cards: {
					tableau: [['K♠', 'A♥', 'Q♥'], ['K♥', '10♠']],
					freeCells: [null, null, null, null],
					foundations: [null, null, null, null]
				},
				targetCards: ['A♥']
			},
			{
				title: '💪 포기는 없다!',
				desc: '막혔다 싶으면 <b>↩️ 되돌리기</b>로<br>다른 수를 시도해보세요.<br><br>같은 카드라도 다른 곳에 옮기면<br>전혀 다른 결과가 나올 수 있어요!<br><br>🎯 쉬움 난이도부터 시작하는 걸 추천합니다.'
			}
		]
	}
};

export const TUTORIAL_ORDER: string[] = ['freecell_basics', 'freecell_tips'];
