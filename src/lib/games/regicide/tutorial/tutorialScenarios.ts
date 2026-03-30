import type { Card, Enemy, Suit, Rank } from '../types';
import type { TutorialScenario, TutorialStep, TutorialGameState } from './tutorialTypes';

function c(suit: Suit, rank: Rank): Card {
	const suitIdx = (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]).indexOf(suit);
	const rankIdx = (
		['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as Rank[]
	).indexOf(rank);
	return { id: suitIdx * 13 + rankIdx, suit, rank };
}

function enemy(suit: Suit, rank: 'J' | 'Q' | 'K', hp?: number): Enemy {
	const stats = { J: { attack: 10, hp: 20 }, Q: { attack: 15, hp: 30 }, K: { attack: 20, hp: 40 } };
	const s = stats[rank];
	return {
		card: c(suit, rank),
		maxHp: s.hp,
		currentHp: hp ?? s.hp,
		attack: s.attack,
		shieldReduction: 0
	};
}

// ============================================================
// Full preset decks for clean state resets
// ============================================================

const fullCastle: Card[] = [
	c('spades', 'J'), c('diamonds', 'J'), c('clubs', 'J'),
	c('spades', 'Q'), c('hearts', 'Q'), c('diamonds', 'Q'), c('clubs', 'Q'),
	c('spades', 'K'), c('hearts', 'K'), c('diamonds', 'K'), c('clubs', 'K')
];

const fullTavern: Card[] = [
	c('hearts', 'A'), c('spades', 'A'), c('diamonds', '3'), c('clubs', '3'),
	c('hearts', '5'), c('diamonds', '9'), c('hearts', '4'), c('diamonds', '2'),
	c('hearts', '6'), c('clubs', '8'), c('spades', '7'), c('spades', '9'),
	c('hearts', '10'), c('hearts', '2'), c('clubs', '4'), c('hearts', '7'),
	c('spades', '8'), c('diamonds', '6'), c('clubs', '9'), c('diamonds', '10'),
	c('clubs', '10'), c('clubs', '2'), c('clubs', '5'), c('spades', '4'),
	c('diamonds', '7'), c('hearts', '8'), c('diamonds', '5'), c('spades', '6'),
	c('hearts', '9')
];

// ============================================================
// Initial state: Part 1 (vs J♥)
// ============================================================
const initialState: TutorialGameState = {
	playerHand: [
		c('diamonds', '8'), // 33
		c('clubs', '7'),    // 45
		c('spades', '5'),   // 4
		c('hearts', '3'),   // 15
		c('diamonds', '4'), // 29
		c('clubs', '6'),    // 44
		c('spades', '2'),   // 1
		c('spades', '10')   // 9
	],
	currentEnemy: enemy('hearts', 'J'),
	castleDeck: [...fullCastle],
	tavernDeck: [...fullTavern],
	discardPile: [],
	currentShield: 0,
	jestersRemaining: 2,
	playedCardsThisEnemy: [],
	turnPhase: 'select_cards',
	enemiesDefeated: 0,
	turnNumber: 1
};

// ============================================================
// Steps
// ============================================================
const steps: TutorialStep[] = [

	// ═══ Part 1: Welcome ═══

	{
		id: 'welcome',
		guidance: {
			title: '레지사이드에 오신 걸 환영합니다!',
			message: '12명의 적(J→Q→K)을 모두 처치하면 승리!<br>핸드의 카드로 적을 공격하세요.',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},
	{
		id: 'enemy_intro',
		guidance: {
			title: '현재 적 소개',
			message: '현재 적: <b>J♥</b> (공격력 10, 체력 20)<br>카드 숫자 = 데미지!',
			position: 'bottom'
		},
		expectedAction: { type: 'tap_next' }
	},

	// ═══ Part 2: Play 8♦ → Diamond Draw + Enemy Attack ═══

	{
		id: 'play_8d',
		guidance: {
			title: '카드를 내보세요!',
			message: '<b>8♦</b>를 선택 후 플레이 버튼을 누르세요.',
			position: 'top'
		},
		highlightCardIds: [33],
		expectedAction: { type: 'play_cards', cardIds: [33] }
	},
	// Game: 8 dmg → HP:12. ♦ draw 1 (A♥). enemy_attacks (ATK:10).
	// advanceTutorialStep → this step. DiscardModal hidden by tutorialBlocked.
	{
		id: 'explain_powers',
		guidance: {
			title: '수트 능력 발동!',
			message: '8♦로 <b>8 데미지</b>! 적 HP: 20 → <b>12</b><br>♦ 능력으로 카드 <b>1장</b> 드로우!<br><br>수트별 능력 (낸 카드 숫자만큼!):<br>♦ <b>드로우</b> — 숫자만큼 뽑기 (핸드 최대 8장)<br>♠ <b>방어</b> — 숫자만큼 적 공격력 감소 (누적)<br>♣ <b>더블</b> — 데미지가 2배!<br>♥ <b>치유</b> — 버린 카드 더미에서 숫자만큼<br>&nbsp;&nbsp;&nbsp;&nbsp;드로우 덱 바닥으로 되돌림<br>&nbsp;&nbsp;&nbsp;&nbsp;(나중에 다시 뽑을 수 있어요!)<br><br>※ 8♦를 냈지만 핸드 7장 → 8장까지 1장만 드로우<br><br>적이 살아있으면 <b>반격</b>합니다!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},
	// Now show DiscardModal. Game is still in enemy_attacks.
	{
		id: 'discard_defense',
		guidance: {
			title: '카드를 버려 방어하세요!',
			message: '<b>10♠</b>를 선택해서 버리세요. (10 ≥ 적 공격력 10)',
			position: 'top'
		},
		highlightCardIds: [9],
		expectedAction: { type: 'discard_cards', cardIds: [9] }
	},
	// Game: discards 10♠, turnPhase→select_cards. advanceTutorialStep.
	{
		id: 'defense_success',
		guidance: {
			title: '방어 성공!',
			message: '잘했습니다! 다시 공격 차례입니다.',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},

	// ═══ Part 3: Play 5♠ → Shield ═══

	{
		id: 'play_5s',
		guidance: {
			title: '♠ 방어 능력!',
			message: '<b>5♠</b>를 내보세요.<br>5 데미지 + 적 공격력 5 감소!',
			position: 'top'
		},
		highlightCardIds: [4],
		expectedAction: { type: 'play_cards', cardIds: [4] }
	},
	// Game: 5 dmg → HP:7, shield:5, effective ATK:5. enemy_attacks.
	// advanceTutorialStep → explain shield. DiscardModal hidden by tutorialBlocked.
	{
		id: 'shield_explain',
		guidance: {
			title: '♠ 방어 누적!',
			message: '적 공격력: 10 → <b>5</b><br>♠ 방어는 이 적이 죽을 때까지 <b>누적</b>됩니다!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
		// NO stateOverride — game stays in enemy_attacks for next discard step
	},
	// DiscardModal shows. Effective ATK = 5. Discard 6♣(value 6 ≥ 5).
	{
		id: 'discard_defense_2',
		guidance: {
			title: '다시 방어!',
			message: '쉴드 덕분에 적 공격력이 <b>5</b>로 줄었습니다!<br><b>6♣</b>를 버려서 방어하세요.',
			position: 'top'
		},
		highlightCardIds: [44], // 6♣
		expectedAction: { type: 'discard_cards', cardIds: [44] }
	},
	// Game: discards 6♣, turnPhase→select_cards.
	{
		id: 'defense_success_2',
		guidance: {
			title: '방어 성공!',
			message: '쉴드가 있으니 방어가 훨씬 쉽죠?<br>이제 마무리 공격을 해봅시다!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},

	// ═══ Part 4: Play 7♣ → Double Damage → Kill ═══

	{
		id: 'play_7c',
		guidance: {
			title: '♣ 더블 데미지!',
			message: '<b>7♣</b>를 내보세요.<br>7 × 2 = <b>14 데미지</b>! 적을 처치!',
			position: 'top'
		},
		highlightCardIds: [45],
		expectedAction: { type: 'play_cards', cardIds: [45] }
	},
	// Game: 14 dmg → HP:-7. Defeated! Flips next enemy. select_cards.
	{
		id: 'enemy_defeated',
		guidance: {
			title: '적 처치! 🎉',
			message: '적을 처치하면 <b>반격 없이</b> 다음 적으로!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},

	// ═══ Part 5: Combo (FULL state reset → J♣) ═══

	{
		id: 'combo_intro',
		guidance: {
			title: '콤보 시스템',
			message: '다음 적: <b>J♣</b>!<br><br><b>같은 숫자</b> 카드를 여러 장 한번에 낼 수 있습니다.<br>단, 합계가 <b>10 이하</b>여야 합니다.<br><br>가능: 2+2(4), 3+3(6), 4+4(8), 5+5(10)<br>　　　2+2+2(6), 3+3+3(9), 2+2+2+2(8)<br>불가: 6+6(12 &gt; 10)<br><br>콤보로 낸 카드의 <b>모든 수트 능력</b>이<br><b>합산 공격값</b>으로 동시에 발동합니다!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' },
		// FULL state reset: clean tavern/discard/castle to avoid card duplication
		stateOverride: {
			playerHand: [
				c('hearts', 'A'),   // 13
				c('spades', 'A'),   // 0
				c('diamonds', '3'), // 28
				c('clubs', '3'),    // 41
				c('hearts', '5'),   // 17
				c('diamonds', '9'), // 34
				c('hearts', '4'),   // 16
				c('spades', '6')    // 5
			],
			currentEnemy: enemy('clubs', 'J'),
			castleDeck: [
				c('spades', 'Q'), c('hearts', 'Q'), c('diamonds', 'Q'), c('clubs', 'Q'),
				c('spades', 'K'), c('hearts', 'K'), c('diamonds', 'K'), c('clubs', 'K')
			],
			tavernDeck: [
				c('hearts', '7'), c('spades', '8'), c('diamonds', '6'),
				c('clubs', '9'), c('diamonds', '10'), c('clubs', '10'),
				c('clubs', '2'), c('clubs', '5'), c('spades', '4'),
				c('diamonds', '7'), c('hearts', '8'), c('diamonds', '5'),
				c('spades', '6'), c('hearts', '9'), c('spades', '7'),
				c('hearts', '2'), c('clubs', '4'), c('diamonds', '2'),
				c('hearts', '6'), c('clubs', '8'), c('spades', '9'),
				c('hearts', '10'), c('clubs', '6'), c('spades', '2'),
			],
			discardPile: [],
			currentShield: 0,
			jestersRemaining: 2,
			playedCardsThisEnemy: [],
			turnPhase: 'select_cards',
			enemiesDefeated: 1,
			turnNumber: 4
		}
	},
	{
		id: 'play_combo_3',
		guidance: {
			title: '같은 숫자 콤보!',
			message: '<b>3♦</b>와 <b>3♣</b>를 함께 선택 후 플레이!<br>3+3=6 공격!',
			position: 'top'
		},
		highlightCardIds: [28, 41],
		expectedAction: { type: 'play_cards', cardIds: [28, 41] }
	},
	// Game: 6 dmg (♣ immune). ♦ draws 2. HP:14. enemy_attacks.
	// advanceTutorialStep → full override to skip discard.
	{
		id: 'immunity_explain',
		guidance: {
			title: '수트 면역',
			message: '방금 3♦ + 3♣ 콤보로 6 공격!<br><br>♦ 드로우 → 6장 드로우 시도 (핸드 8장 제한)<br>♣ 더블 → <b>면역! 불발!</b><br><br>적 <b>J♣</b>과 같은 수트(♣)의 능력은 발동하지 않습니다.<br>데미지 6은 그대로 적용! (HP: 20 → 14)<br><br>적의 수트를 확인하고 전략적으로 카드를 내세요!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' },
		// Full state: skip discard, set clean hand for ace pair step
		stateOverride: {
			playerHand: [
				c('hearts', 'A'),   // 13
				c('spades', 'A'),   // 0
				c('hearts', '5'),   // 17
				c('diamonds', '9'), // 34
				c('hearts', '4'),   // 16
				c('spades', '6'),   // 5
				c('hearts', '7'),   // 19 (drawn by ♦)
				c('spades', '8'),   // 7  (drawn by ♦)
			],
			currentEnemy: { ...enemy('clubs', 'J', 14), shieldReduction: 0 } as Enemy,
			turnPhase: 'select_cards',
			currentShield: 0,
			playedCardsThisEnemy: [c('diamonds', '3'), c('clubs', '3')],
		}
	},

	// ═══ Part 6: Ace Pairing ═══

	{
		id: 'play_ace_pair',
		guidance: {
			title: '에이스 페어링!',
			message: '<b>A♥</b>와 <b>9♦</b>를 함께 내보세요.<br>1+9=10 공격! ♥치유 + ♦드로우!',
			position: 'top'
		},
		highlightCardIds: [13, 34],
		expectedAction: { type: 'play_cards', cardIds: [13, 34] }
	},
	// Game: 10 dmg. HP:4. enemy_attacks.
	// advanceTutorialStep → override to skip discard.
	{
		id: 'ace_explain',
		guidance: {
			title: '에이스 페어링 설명',
			message: '에이스(A)는 단독으로 내면 <b>1 데미지</b>뿐이지만,<br>다른 카드 1장과 <b>페어</b>로 낼 수 있습니다!<br><br>방금 A♥ + 9♦ = <b>10 데미지</b><br>♥ 치유 10 + ♦ 드로우 10 동시 발동!<br><br>에이스의 가치는 데미지가 아니라<br><b>수트 능력을 추가하는 것</b>입니다.<br><br>예: A♣ + 5♠ = 6 데미지 × 2(♣) = <b>12</b> + ♠방어 6',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' },
		stateOverride: {
			turnPhase: 'select_cards',
			playedCardsThisEnemy: [c('diamonds', '3'), c('clubs', '3'), c('hearts', 'A'), c('diamonds', '9')],
		}
	},

	// ═══ Part 7: Tips & Complete ═══

	{
		id: 'tip_exact_kill',
		guidance: {
			title: '💡 정확한 처치',
			message: '적 HP를 초과 없이 <b>딱 0</b>으로 만들면<br>그 적 카드가 <b>내 드로우 덱 맨 위</b>로 갑니다.<br><br>다음에 카드를 뽑으면 <b>J(10), Q(15), K(20)를<br>내 패로 가져와서 공격에 사용</b>할 수 있어요!<br><br>예: J♥를 딱 20 데미지로 처치<br>→ 다음 드로우 시 J♥가 내 손에!<br>→ J♥를 내면 10 데미지 + ♥치유!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},
	{
		id: 'tip_jester',
		guidance: {
			title: '🃏 광대 (제스터)',
			message: '게임 시작 시 <b>광대 토큰 2개</b>가 주어집니다.<br><br>사용하면 현재 핸드를 <b>전부 버리고</b><br>드로우 덱에서 <b>8장을 새로 뽑습니다.</b><br><br>공격 전 또는 방어 전에 사용 가능!<br>위기 탈출용이지만, 아끼면 높은 등급을 받아요.',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},
	{
		id: 'win_lose',
		guidance: {
			title: '승리와 패배',
			message: '<b>🏆 승리</b><br>J 4명 → Q 4명 → K 4명<br>총 <b>12명을 모두 처치</b>하면 승리!<br><br><b>💀 패배</b><br>• 적의 반격을 <b>막을 카드가 부족</b>할 때<br>• 핸드가 비어서 <b>낼 카드가 없을 때</b><br>&nbsp;&nbsp;(광대도 없으면 게임 오버!)<br><br>카드를 아껴 쓰는 것이 핵심 전략입니다!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	},
	{
		id: 'complete',
		guidance: {
			title: '튜토리얼 완료! 🎉',
			message: '이제 실전에서 12명의 적을 무찌르세요!<br><br>🥇 <b>Gold</b>: 광대 0회 사용<br>🥈 <b>Silver</b>: 1회 사용<br>🥉 <b>Bronze</b>: 2회 사용<br><br>행운을 빕니다!',
			position: 'top'
		},
		expectedAction: { type: 'tap_next' }
	}
];

export const TUTORIAL_SCENARIO: TutorialScenario = {
	title: '레지사이드 튜토리얼',
	initialState,
	steps
};
