import type { Card, GamePhase, SeatIndex, Trick, WishState } from '../types';

// ===== Tutorial Step Types =====

export interface TutorialStep {
	id: string;
	/** 가이드 버블 컨텐츠 */
	guidance: {
		title: string;
		message: string;
		position: 'top' | 'center' | 'bottom';
	};
	/** 핸드에서 펄스 하이라이트할 카드 ID 목록 */
	highlightCards?: string[];
	/** 플레이어가 해야 할 행동 */
	expectedAction: TutorialAction;
	/** 이 스텝에서 AI가 수행할 스크립트 */
	aiScript?: AiScriptEntry[];
	/** 스텝 완료 후 게임 상태를 덮어쓸 설정 (핸드 교체/phase 점프) */
	stateOverride?: TutorialStateOverride;
}

export type TutorialAction =
	| { type: 'play_cards'; cardIds: string[] }
	| { type: 'pass' }
	| { type: 'set_wish'; rank?: number | null }
	| { type: 'any_play' }    // 아무 유효한 카드 내기
	| { type: 'any' }         // 아무 행동
	| { type: 'free_play' }   // 자유 플레이 (오버레이 숨기고 라운드 끝까지)
	| { type: 'wait' }        // 관전 (AI가 행동)
	| { type: 'tap_next' }    // 설명 읽고 "다음" 버튼
	| { type: 'declare_grand_tichu' }
	| { type: 'pass_grand_tichu' }
	| { type: 'declare_small_tichu' }
	| { type: 'submit_exchange'; toPartner: string; toLeft: string; toRight: string }
	| { type: 'gift_dragon'; targetSeat: SeatIndex };

export interface AiScriptEntry {
	seat: SeatIndex;
	action: 'play' | 'pass';
	cardIds?: string[];
	delay?: number;  // ms (default: 500)
}

export interface TutorialStateOverride {
	phase?: GamePhase;
	hands?: [Card[], Card[], Card[], Card[]];
	currentSeat?: SeatIndex;
	trick?: Trick | null;
	wish?: WishState;
}

// ===== Tutorial Lesson =====

export interface TutorialLesson {
	id: string;
	title: string;
	description: string;
	icon: string;
	estimatedMinutes: number;
	steps: TutorialStep[];
	/** 레슨 시작 시 게임 초기 상태 */
	initialState: TutorialInitialState;
}

export interface TutorialInitialState {
	phase: GamePhase;
	hands: [Card[], Card[], Card[], Card[]];
	currentSeat: SeatIndex;
	trick?: Trick | null;
	wish?: WishState;
	/** grand tichu 결정 상태. null=미결정, true=선언, false=패스 */
	grandTichuDecisions?: [(boolean | null), (boolean | null), (boolean | null), (boolean | null)];
}
