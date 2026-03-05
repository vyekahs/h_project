import type { SeatIndex } from '../types';
import type { TutorialLesson } from './tutorialTypes';
import { card, cards } from './tutorialDeckBuilder';

// ===================================================================
// 레슨 1: 기본 플레이
// 목표: 싱글 카드 내기, 이기기, 패스, 트릭 완료
// ===================================================================

const lesson1: TutorialLesson = {
	id: 'lesson1',
	title: '기본 규칙',
	description: '카드 내기, 이기기, 패스의 기본을 배웁니다',
	icon: '🎴',
	estimatedMinutes: 3,
	initialState: {
		phase: 'playing',
		hands: [
			// Seat 0 (나): 참새 포함, 낮은~높은 카드
			cards('mahjong', 'jade_3', 'sword_5', 'pagoda_7', 'star_9', 'jade_12'),
			// Seat 1 (상대1, 오른쪽)
			cards('jade_4', 'sword_6', 'pagoda_8', 'star_10', 'jade_13', 'sword_2'),
			// Seat 2 (파트너, 위)
			cards('jade_2', 'sword_4', 'pagoda_6', 'star_8', 'jade_11', 'pagoda_3'),
			// Seat 3 (상대2, 왼쪽)
			cards('jade_5', 'sword_7', 'pagoda_9', 'star_11', 'jade_10', 'star_3'),
		],
		currentSeat: 0 as SeatIndex,
	},
	steps: [
		{
			id: 'l1_intro',
			guidance: {
				title: '티츄에 오신 것을 환영합니다!',
				message: '티츄는 2:2 팀 카드 게임입니다. 먼저 카드를 다 내는 것이 목표예요. 위쪽이 파트너, 양옆이 상대입니다.',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l1_mahjong',
			guidance: {
				title: '참새로 시작!',
				message: '참새(1)를 가진 사람이 첫 번째 카드를 냅니다. 참새를 선택해서 내보세요!',
				position: 'bottom',
			},
			highlightCards: ['mahjong'],
			expectedAction: { type: 'play_cards', cardIds: ['mahjong'] },
		},
		{
			id: 'l1_ai_plays',
			guidance: {
				title: '상대방 차례',
				message: '다른 플레이어들이 차례대로 카드를 냅니다. 더 높은 숫자를 내야 이길 수 있어요!',
				position: 'top',
			},
			expectedAction: { type: 'wait' },
		},
		{
			id: 'l1_beat_card',
			guidance: {
				title: '더 높은 카드로 이기기!',
				message: '상대보다 높은 숫자의 카드를 내면 이깁니다. 카드를 골라서 내보세요!',
				position: 'bottom',
			},
			expectedAction: { type: 'any_play' },
		},
		{
			id: 'l1_ai_plays_2',
			guidance: {
				title: '게임이 진행됩니다',
				message: '모두가 패스하면 마지막에 카드를 낸 사람이 트릭을 가져갑니다.',
				position: 'top',
			},
			expectedAction: { type: 'wait' },
		},
		{
			id: 'l1_pass',
			guidance: {
				title: '패스하기',
				message: '이길 수 없거나 카드를 아끼고 싶을 때는 패스할 수 있습니다. 패스 버튼을 눌러보세요!',
				position: 'bottom',
			},
			highlightCards: [],
			expectedAction: { type: 'pass' },
		},
		{
			id: 'l1_free_play',
			guidance: {
				title: '자유 플레이!',
				message: '이제 자유롭게 카드를 내보세요. 아무 카드나 내도 됩니다!',
				position: 'bottom',
			},
			expectedAction: { type: 'any' },
		},
		{
			id: 'l1_complete',
			guidance: {
				title: '기본 규칙 완료!',
				message: '싱글 카드 내기, 이기기, 패스를 배웠습니다. 다음 레슨에서 카드 조합을 배워볼까요?',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
	],
};

// ===================================================================
// 레슨 2: 카드 조합
// 목표: 페어, 트리플, 스트레이트, 계단, 폭탄
// ===================================================================

const lesson2: TutorialLesson = {
	id: 'lesson2',
	title: '카드 조합',
	description: '스트레이트, 계단, 폭탄 등 다양한 조합을 배웁니다',
	icon: '🃏',
	estimatedMinutes: 5,
	initialState: {
		phase: 'playing',
		hands: [
			// Seat 0 (나): straight(8-12) + stairs(10-11) + bomb(5×4) + 여유1장
			cards('jade_8', 'sword_9', 'pagoda_10', 'star_11', 'jade_12', 'jade_10', 'sword_10', 'jade_11', 'sword_11', 'jade_5', 'sword_5', 'pagoda_5', 'star_5', 'pagoda_6'),
			// Seat 1: 12-13 stairs 보유, 폭탄/트리플 불가 (max 2 per rank)
			cards('jade_2', 'jade_6', 'jade_13', 'sword_8', 'sword_12', 'sword_13', 'pagoda_9', 'pagoda_12', 'pagoda_14', 'star_3', 'star_7', 'star_10', 'star_14', 'mahjong'),
			// Seat 2: 폭탄/트리플 불가
			cards('jade_3', 'jade_7', 'jade_14', 'sword_2', 'sword_6', 'sword_14', 'pagoda_2', 'pagoda_4', 'pagoda_7', 'star_4', 'star_8', 'star_12', 'dragon', 'dog'),
			// Seat 3: 폭탄/트리플 불가
			cards('jade_4', 'jade_9', 'sword_3', 'sword_4', 'sword_7', 'pagoda_3', 'pagoda_8', 'pagoda_11', 'pagoda_13', 'star_2', 'star_6', 'star_9', 'star_13', 'phoenix'),
		],
		currentSeat: 0 as SeatIndex,
	},
	steps: [
		// === Step 1: 인트로 ===
		{
			id: 'l2_intro',
			guidance: {
				title: '카드 조합 배우기',
				message: '싱글 카드 외에도 다양한 조합을 낼 수 있습니다. 같은 조합끼리만 비교해서 이길 수 있어요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 2: 페어/트리플 설명 (구경만) ===
		{
			id: 'l2_pair_triple',
			guidance: {
				title: '페어와 트리플',
				message: '같은 숫자 2장 = 페어, 3장 = 트리플.\n같은 종류끼리만 대결합니다. 이제 다른 조합들을 직접 내보며 배워봅시다!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 3: 스트레이트 — Human 리드 ===
		{
			id: 'l2_straight_explain',
			guidance: {
				title: '스트레이트 (Straight)',
				message: '연속된 숫자 5장 이상 = 스트레이트! 무늬는 상관없어요. 8-9-10-11-12를 내보세요!',
				position: 'bottom',
			},
			stateOverride: {
				currentSeat: 0 as SeatIndex,
				trick: null,
			},
			highlightCards: ['jade_8', 'sword_9', 'pagoda_10', 'star_11', 'jade_12'],
			expectedAction: { type: 'play_cards', cardIds: ['jade_8', 'sword_9', 'pagoda_10', 'star_11', 'jade_12'] },
		},
		// === Step 4: 스트레이트 결과 관전 ===
		{
			id: 'l2_straight_wait',
			guidance: {
				title: '스트레이트 대결!',
				message: '같은 길이의 더 높은 스트레이트로만 이길 수 있어요. 결과를 지켜봅시다!',
				position: 'top',
			},
			expectedAction: { type: 'wait' },
		},
		// === Step 5: 계단 — Human 리드 ===
		{
			id: 'l2_stairs_explain',
			guidance: {
				title: '계단 (Stairs)',
				message: '연속된 페어 = 계단! 10-10-11-11을 내보세요.',
				position: 'bottom',
			},
			stateOverride: {
				currentSeat: 0 as SeatIndex,
				trick: null,
				hands: [
					// Seat 0: 9장 (straight 5장 제거)
					cards('jade_10', 'sword_10', 'jade_11', 'sword_11', 'jade_5', 'sword_5', 'pagoda_5', 'star_5', 'pagoda_6'),
					// Seat 1: 12-13 stairs 보유 (sword_12, pagoda_12, jade_13, sword_13), 폭탄/트리플 불가
					cards('jade_2', 'jade_7', 'jade_8', 'jade_13', 'sword_12', 'sword_13', 'pagoda_3', 'pagoda_8', 'pagoda_11', 'pagoda_12', 'star_2', 'star_4', 'star_6', 'star_9'),
					// Seat 2: 폭탄/트리플 불가
					cards('jade_3', 'jade_9', 'jade_14', 'sword_3', 'sword_7', 'sword_8', 'pagoda_7', 'pagoda_13', 'star_8', 'star_10', 'star_14', 'mahjong', 'dragon', 'dog'),
					// Seat 3: 폭탄/트리플 불가
					cards('jade_4', 'jade_12', 'sword_4', 'sword_6', 'sword_9', 'sword_14', 'pagoda_9', 'pagoda_10', 'pagoda_14', 'star_7', 'star_11', 'star_12', 'star_13', 'phoenix'),
				],
			},
			highlightCards: ['jade_10', 'sword_10', 'jade_11', 'sword_11'],
			expectedAction: { type: 'play_cards', cardIds: ['jade_10', 'sword_10', 'jade_11', 'sword_11'] },
		},
		// === Step 6: 계단 결과 — AI가 12-13 계단으로 이김 ===
		{
			id: 'l2_stairs_lose',
			guidance: {
				title: '계단 대결!',
				message: '상대가 더 높은 계단 12-12-13-13으로 이겼습니다! 이제 상대의 선이 됩니다.',
				position: 'top',
			},
			expectedAction: { type: 'wait' },
		},
		// === Step 7: 폭탄 개념 설명 ===
		{
			id: 'l2_bomb_intro',
			guidance: {
				title: '폭탄! (Bomb)',
				message: '같은 숫자 4장 = 폭탄!\n폭탄은 아무 때나 쓸 수 있고, 모든 조합을 이깁니다. 상대 차례에도 끼어들 수 있어요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 8: 폭탄 실전 — 상대 스트레이트 위에 폭탄 끊기 ===
		{
			id: 'l2_bomb_play',
			guidance: {
				title: '폭탄 발사!',
				message: '상대가 스트레이트를 냈습니다. 마지막 남은 5 네 장으로 폭탄을 터뜨리세요!',
				position: 'bottom',
			},
			stateOverride: {
				currentSeat: 0 as SeatIndex,
				trick: {
					plays: [{
						seat: 1 as SeatIndex,
						combination: {
							type: 'straight',
							cards: cards('jade_6', 'sword_7', 'pagoda_8', 'star_9', 'sword_10'),
							rank: 10,
							length: 5,
						},
					}],
					passCount: 0,
					leadSeat: 1 as SeatIndex,
					currentSeat: 0 as SeatIndex,
				},
				hands: [
					// Seat 0: 정확히 4장 — 5 폭탄 (마지막 카드!)
					cards('jade_5', 'sword_5', 'pagoda_5', 'star_5'),
					// Seat 1: 9장 (스트레이트 5장 이미 냄), 폭탄/트리플 불가
					cards('jade_2', 'jade_7', 'jade_12', 'sword_3', 'pagoda_4', 'pagoda_9', 'pagoda_13', 'star_6', 'star_11'),
					// Seat 2: 폭탄/트리플 불가
					cards('jade_8', 'jade_11', 'jade_14', 'sword_6', 'sword_9', 'sword_13', 'pagoda_7', 'pagoda_10', 'pagoda_14', 'star_10', 'star_12', 'star_13', 'mahjong', 'dragon'),
					// Seat 3: 폭탄/트리플 불가
					cards('jade_9', 'jade_10', 'jade_13', 'sword_8', 'sword_11', 'sword_12', 'sword_14', 'pagoda_11', 'pagoda_12', 'star_7', 'star_8', 'star_14', 'phoenix', 'dog'),
				],
			},
			highlightCards: ['jade_5', 'sword_5', 'pagoda_5', 'star_5'],
			expectedAction: { type: 'play_cards', cardIds: ['jade_5', 'sword_5', 'pagoda_5', 'star_5'] },
		},
		// === Step 9: 폭탄 성공 ===
		{
			id: 'l2_bomb_result',
			guidance: {
				title: '폭탄 성공!',
				message: '폭탄으로 상대의 스트레이트를 이겼습니다! 손에 카드가 없으니 가장 먼저 카드를 다 낸 사람이 됩니다!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 10: 스트레이트 플러시 폭탄 설명 ===
		{
			id: 'l2_sfbomb_explain',
			guidance: {
				title: '스트레이트 플러시 폭탄',
				message: '같은 무늬 5장 이상 연속 = 스트레이트 플러시 폭탄!\n일반 폭탄(4장)보다 더 강력합니다. 매우 드물지만 알아두세요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 11: 완료 ===
		{
			id: 'l2_complete',
			guidance: {
				title: '카드 조합 완료!',
				message: '스트레이트, 계단, 폭탄을 배웠습니다! 이제 실전에서 활용해보세요.',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
	],
};

// ===================================================================
// 레슨 3: 특수 카드
// 목표: 참새(소원), 봉황(와일드), 용(최강+양도), 개(파트너 턴) 체험
// ===================================================================

const lesson3: TutorialLesson = {
	id: 'lesson3',
	title: '특수 카드',
	description: '참새, 봉황, 용, 개의 특수 능력을 배웁니다',
	icon: '🐉',
	estimatedMinutes: 4,
	initialState: {
		phase: 'playing',
		hands: [
			// Seat 0 (나): 참새로 시작, 봉황 스트레이트 재료 + 용 + 개
			cards('mahjong', 'dragon', 'phoenix', 'dog', 'jade_5', 'pagoda_7', 'star_8', 'jade_9'),
			// Seat 1 (상대1): wish 8 대응용 — star_8 보유, 폭탄/트리플 불가
			cards('star_8', 'jade_10', 'sword_11', 'pagoda_12', 'jade_3', 'sword_6', 'pagoda_4', 'star_13'),
			// Seat 2 (파트너): 폭탄/트리플 불가
			cards('jade_4', 'sword_3', 'pagoda_6', 'star_10', 'jade_12', 'sword_14', 'pagoda_11', 'star_2'),
			// Seat 3 (상대2): 폭탄/트리플 불가
			cards('jade_11', 'sword_10', 'pagoda_9', 'star_7', 'jade_6', 'sword_5', 'pagoda_13', 'star_14'),
		],
		currentSeat: 0 as SeatIndex,
	},
	steps: [
		// === Step 1: 인트로 ===
		{
			id: 'l3_intro',
			guidance: {
				title: '특수 카드를 배워봅시다!',
				message: '티츄에는 참새, 용, 봉황, 개 — 4장의 특수 카드가 있습니다. 각각 고유한 능력이 있어요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 2: 참새 설명 ===
		{
			id: 'l3_mahjong_explain',
			guidance: {
				title: '참새 (Mahjong) — 첫 리드!',
				message: '참새를 가진 사람이 라운드에서 가장 먼저 카드를 냅니다. 참새는 숫자 1로 취급되며, 낼 때 소원을 빌 수 있어요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 3: 참새 내기 ===
		{
			id: 'l3_play_mahjong',
			guidance: {
				title: '참새를 내보세요!',
				message: '참새를 내면 소원을 빌 수 있습니다. 참새를 내보세요!',
				position: 'bottom',
			},
			highlightCards: ['mahjong'],
			expectedAction: { type: 'play_cards', cardIds: ['mahjong'] },
		},
		// === Step 4: 소원 설명 (tap_next) ===
		{
			id: 'l3_wish_explain',
			guidance: {
				title: '소원을 빌어보세요!',
				message: '원하는 숫자를 소원으로 빌면, 그 숫자를 가진 플레이어는 가능할 때 반드시 내야 합니다! 다음을 누르면 소원 선택 화면이 나타납니다.',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 5: 소원 선택 (WishModal) ===
		{
			id: 'l3_set_wish',
			guidance: {
				title: '소원 선택',
				message: '아무 숫자나 선택하거나, 소원 없음을 눌러보세요!',
				position: 'center',
			},
			expectedAction: { type: 'set_wish' },
		},
		// === Step 6: 소원 효과 관전 ===
		{
			id: 'l3_mahjong_wait',
			guidance: {
				title: '소원 효과!',
				message: '소원을 빌었습니다! 해당 숫자를 가진 플레이어는 낼 수 있다면 반드시 내야 합니다.',
				position: 'top',
			},
			expectedAction: { type: 'wait' },
		},
		// === Step 6: 봉황 설명 ===
		{
			id: 'l3_phoenix_intro',
			guidance: {
				title: '봉황 (Phoenix) — 만능 카드!',
				message: '봉황을 싱글로 내면 직전 카드보다 0.5 높습니다. 조합에서는 아무 숫자 대신 쓸 수 있는 와일드카드예요! 단, -25점입니다.',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === Step 7: 봉황 스트레이트 ===
		{
			id: 'l3_phoenix_straight',
			guidance: {
				title: '봉황 스트레이트!',
				message: '5-?-7-8-9에서 빠진 6 자리에 봉황을 넣어보세요! 봉황을 선택하면 자동으로 제 위치에 정렬됩니다.',
				position: 'bottom',
			},
			highlightCards: ['phoenix', 'jade_5', 'pagoda_7', 'star_8', 'jade_9'],
			stateOverride: {
				currentSeat: 0 as SeatIndex,
				trick: null,
				hands: [
					cards('phoenix', 'jade_5', 'pagoda_7', 'star_8', 'jade_9', 'dragon', 'dog'),
					cards('jade_10', 'sword_11', 'pagoda_12', 'jade_3', 'sword_6', 'pagoda_4', 'star_13'),
					cards('jade_4', 'sword_3', 'pagoda_6', 'star_10', 'jade_12', 'sword_14', 'pagoda_11'),
					cards('jade_11', 'sword_10', 'pagoda_9', 'star_7', 'jade_6', 'sword_5', 'pagoda_13'),
				],
			},
			expectedAction: { type: 'play_cards', cardIds: ['phoenix', 'jade_5', 'pagoda_7', 'star_8', 'jade_9'] },
		},
		// === Step 8: 봉황 스트레이트 결과 ===
		{
			id: 'l3_phoenix_straight_wait',
			guidance: {
				title: '봉황 스트레이트 성공!',
				message: '봉황 덕분에 6이 없어도 5-6-7-8-9 스트레이트를 만들었습니다!',
				position: 'top',
			},
			expectedAction: { type: 'wait' },
		},
		// === Step 9: 용 내기 ===
		{
			id: 'l3_play_dragon',
			guidance: {
				title: '용 (Dragon) — 최강의 싱글!',
				message: '용은 A보다도 강한 최강의 싱글 카드입니다. 단, 이긴 트릭은 상대에게 줘야 해요. 용을 내보세요!',
				position: 'bottom',
			},
			highlightCards: ['dragon'],
			stateOverride: {
				currentSeat: 0 as SeatIndex,
				trick: null,
				hands: [
					cards('dragon', 'dog'),
					cards('jade_10', 'sword_11', 'pagoda_12', 'jade_3', 'sword_6'),
					cards('jade_4', 'sword_3', 'pagoda_6', 'star_10', 'jade_12'),
					cards('jade_11', 'sword_10', 'pagoda_9', 'star_7', 'jade_6'),
				],
			},
			expectedAction: { type: 'play_cards', cardIds: ['dragon'] },
		},
		// === Step 10: 용 양도 ===
		{
			id: 'l3_dragon_gift',
			guidance: {
				title: '용 양도!',
				message: '용이 이긴 트릭은 반드시 상대 한 명에게 줘야 합니다. 용은 25점짜리라 상대에게 점수를 주게 되니 조심하세요!',
				position: 'top',
			},
			expectedAction: { type: 'gift_dragon', targetSeat: 1 as SeatIndex },
		},
		// === Step 11: 개 내기 ===
		{
			id: 'l3_play_dog',
			guidance: {
				title: '개 (Dog) — 파트너에게 턴!',
				message: '개를 내면 파트너에게 턴이 넘어갑니다. 새 트릭을 시작할 때만 낼 수 있어요! 개를 내보세요.',
				position: 'bottom',
			},
			highlightCards: ['dog'],
			stateOverride: {
				currentSeat: 0 as SeatIndex,
				trick: null,
				hands: [
					cards('dog'),
					cards('jade_10', 'sword_11', 'jade_3', 'sword_6'),
					cards('jade_4', 'sword_3', 'pagoda_6', 'star_10'),
					cards('jade_11', 'sword_10', 'pagoda_9', 'star_7'),
				],
			},
			expectedAction: { type: 'play_cards', cardIds: ['dog'] },
		},
		// === Step 12: 파트너 리드 관전 ===
		{
			id: 'l3_dog_wait',
			guidance: {
				title: '파트너가 리드합니다!',
				message: '개 덕분에 파트너가 리드할 수 있었습니다!',
				position: 'top',
			},
			expectedAction: { type: 'wait' },
		},
		// === Step 13: 완료 ===
		{
			id: 'l3_complete',
			guidance: {
				title: '특수 카드 완료!',
				message: '참새(1, 소원), 용(25점, 최강+양도), 봉황(-25점, 와일드), 개(파트너 턴)를 배웠습니다!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
	],
};

// ===================================================================
// 레슨 4: 티츄 선언 & 카드 교환
// 목표: 그랜드 티츄, 스몰 티츄, 카드 교환 체험
// ===================================================================

const lesson4: TutorialLesson = {
	id: 'lesson4',
	title: '티츄 & 실전',
	description: '티츄 선언, 카드 교환, 실전 플레이까지!',
	icon: '🏆',
	estimatedMinutes: 7,
	initialState: {
		phase: 'grand_tichu_window',
		hands: [
			// Seat 0 (나): 매우 좋은 8장 (그랜드 티츄 유도)
			cards('dragon', 'jade_14', 'sword_14', 'pagoda_14', 'star_13', 'jade_13', 'sword_12', 'pagoda_11'),
			// Seat 1 (상대1): 8장
			cards('jade_7', 'sword_7', 'pagoda_8', 'star_8', 'jade_4', 'sword_4', 'pagoda_3', 'star_3'),
			// Seat 2 (파트너): 8장
			cards('jade_9', 'sword_9', 'pagoda_10', 'star_10', 'jade_6', 'sword_6', 'pagoda_5', 'star_5'),
			// Seat 3 (상대2): 8장
			cards('jade_8', 'sword_8', 'pagoda_9', 'star_9', 'jade_2', 'sword_2', 'pagoda_2', 'star_2'),
		],
		currentSeat: 0 as SeatIndex,
		grandTichuDecisions: [null, false, false, false],
	},
	steps: [
		{
			id: 'l4_intro',
			guidance: {
				title: '티츄 선언 & 카드 교환',
				message: '라운드가 시작되면 먼저 8장을 받습니다. 이 핸드를 보고 "그랜드 티츄"를 선언할 수 있어요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_grand_explain',
			guidance: {
				title: '그랜드 티츄 (+200/-200)',
				message: '그랜드 티츄: 1등으로 나가면 +200점, 못하면 -200점! 용+A가 여러 장이면 도전할 만합니다.',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_declare_grand',
			guidance: {
				title: '그랜드 티츄를 선언하세요!',
				message: '지금 핸드에 용+A 3장! 최고의 핸드입니다. 그랜드 티츄를 선언해보세요!',
				position: 'bottom',
			},
			expectedAction: { type: 'declare_grand_tichu' },
		},
		{
			id: 'l4_deal_more',
			guidance: {
				title: '나머지 6장 추가!',
				message: '나머지 6장이 추가되었습니다. 이제 14장으로 게임합니다.',
				position: 'center',
			},
			stateOverride: {
				phase: 'exchange',
				hands: [
					// 14장: 기존 8장 + 새 6장
					cards('dragon', 'jade_14', 'sword_14', 'pagoda_14', 'star_13', 'jade_13', 'sword_12', 'pagoda_11',
						'star_10', 'jade_9', 'sword_8', 'pagoda_7', 'star_5', 'jade_3'),
					cards('jade_7', 'sword_7', 'pagoda_8', 'star_8', 'jade_4', 'sword_4', 'pagoda_3', 'star_3',
						'jade_11', 'sword_11', 'pagoda_6', 'star_6', 'jade_10', 'sword_10'),
					cards('jade_9', 'sword_9', 'pagoda_10', 'star_10', 'jade_6', 'sword_6', 'pagoda_5', 'star_5',
						'mahjong', 'jade_2', 'sword_3', 'pagoda_4', 'star_4', 'jade_5'),
					cards('jade_8', 'sword_8', 'pagoda_9', 'star_9', 'jade_2', 'sword_2', 'pagoda_2', 'star_2',
						'phoenix', 'dog', 'pagoda_12', 'star_12', 'sword_13', 'pagoda_13'),
				],
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_exchange_explain',
			guidance: {
				title: '카드 교환',
				message: '파트너에게 1장, 왼쪽 상대에게 1장, 오른쪽 상대에게 1장을 보냅니다. 총 3장!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_exchange_strategy',
			guidance: {
				title: '교환 전략',
				message: '파트너에게는 최고의 카드(용)를, 상대에게는 약한 카드를 주세요! 하이라이트된 카드를 교환해보세요.',
				position: 'top',
			},
			highlightCards: ['dragon', 'jade_3', 'star_5'],
			expectedAction: { type: 'submit_exchange', toPartner: 'dragon', toLeft: 'jade_3', toRight: 'star_5' },
		},
		{
			id: 'l4_small_explain',
			guidance: {
				title: '스몰 티츄 (+100/-100)',
				message: '스몰 티츄: 첫 카드를 내기 전 선언 가능. +100/-100점. 그랜드를 이미 선언했으면 불가!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		// === 실전 플레이 ===
		{
			id: 'l4_play_intro',
			guidance: {
				title: '실전 플레이!',
				message: '그랜드 티츄를 선언했으니, 1등으로 나가야 합니다! 강한 핸드로 도전해보세요!',
				position: 'center',
			},
			stateOverride: {
				phase: 'playing',
				hands: [
					// Seat 0 (나): 강한 14장 — A(14) 2장 + 높은 카드 위주
					cards('mahjong', 'jade_14', 'sword_14', 'star_13', 'jade_13',
						'sword_12', 'jade_12', 'pagoda_11', 'star_11', 'star_10', 'pagoda_7',
						'pagoda_3', 'pagoda_2', 'star_2'),
					// Seat 1 (상대1): A 1장 보유
					cards('pagoda_14', 'jade_7', 'sword_7', 'pagoda_8', 'star_8', 'jade_4', 'sword_4',
						'star_3', 'jade_11', 'sword_11', 'pagoda_6', 'star_6', 'jade_10', 'sword_10'),
					// Seat 2 (파트너): dragon 받음
					cards('dragon', 'jade_9', 'sword_9', 'pagoda_10', 'jade_6', 'sword_6',
						'pagoda_5', 'star_5', 'jade_2', 'sword_3', 'pagoda_4', 'star_4', 'jade_5', 'jade_3'),
					// Seat 3 (상대2): A 1장 보유
					cards('star_14', 'jade_8', 'sword_8', 'pagoda_9', 'star_9', 'sword_2',
						'phoenix', 'dog', 'pagoda_12', 'star_12', 'sword_13', 'pagoda_13', 'star_7', 'sword_5'),
				],
				currentSeat: 0 as SeatIndex,
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_play_mahjong',
			guidance: {
				title: '참새로 시작!',
				message: '참새(1)를 가진 플레이어가 선공합니다. 참새를 내보세요!',
				position: 'bottom',
			},
			highlightCards: ['mahjong'],
			expectedAction: { type: 'play_cards', cardIds: ['mahjong'] },
		},
		{
			id: 'l4_wish',
			guidance: {
				title: '소원을 빌어보세요!',
				message: '참새를 내면 소원을 빌 수 있어요! 원하는 숫자를 선택하거나 소원 없음을 눌러보세요.',
				position: 'center',
			},
			expectedAction: { type: 'set_wish' },
		},
		{
			id: 'l4_free_play',
			guidance: {
				title: '자유 플레이!',
				message: '이제 자유롭게 게임을 진행하세요! 라운드가 끝나면 점수 설명이 이어집니다.',
				position: 'bottom',
			},
			expectedAction: { type: 'free_play' },
		},
		// === 점수 설명 ===
		{
			id: 'l4_scoring_1',
			guidance: {
				title: '카드 점수',
				message: 'K(13) = 10점, 10 = 10점, 5 = 5점. 이 세 종류만 점수가 있어요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_scoring_2',
			guidance: {
				title: '특수 카드 점수',
				message: '용 = 25점 (주의: 상대에게 줘야 할 수도!), 봉황 = -25점. 나머지 카드는 0점. 전체 합계는 항상 100점!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_scoring_3',
			guidance: {
				title: '원투 피니시!',
				message: '같은 팀이 1등·2등을 하면 "원투"로 200점 획득! 상대 카드 점수는 무효가 됩니다.',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
		{
			id: 'l4_complete',
			guidance: {
				title: '축하합니다!',
				message: '모든 튜토리얼을 완료했습니다! 이제 실전에서 티츄를 즐겨보세요!',
				position: 'center',
			},
			expectedAction: { type: 'tap_next' },
		},
	],
};

// ===================================================================
// 전체 레슨 목록
// ===================================================================

export const LESSONS: TutorialLesson[] = [lesson1, lesson2, lesson3, lesson4];

export function getLessonById(id: string): TutorialLesson | undefined {
	return LESSONS.find(l => l.id === id);
}
