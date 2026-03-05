import type { SeatIndex, ExchangeCards } from '../types';
import { LocalGameEngine, type GameEvent } from '../ai/localGameEngine';
import type { TutorialLesson, TutorialStep, TutorialAction, TutorialStateOverride } from './tutorialTypes';
import { buildTutorialSave } from './tutorialDeckBuilder';
import { detectCombination } from '../combinations';
import { findCardById } from '../deck';

const HUMAN_SEAT = 0 as SeatIndex;

export class TutorialEngine {
	private engine: LocalGameEngine;
	private lesson: TutorialLesson;
	private _stepIndex = 0;
	private onStateChange: () => void;
	private onStepChange: (step: TutorialStep, index: number) => void;
	private onComplete: () => void;
	private onEvent: (event: GameEvent) => void;
	private _destroyed = false;
	private _freePlayMode = false;

	constructor(config: {
		lesson: TutorialLesson;
		onStateChange: () => void;
		onEvent?: (event: GameEvent) => void;
		onStepChange: (step: TutorialStep, index: number) => void;
		onComplete: () => void;
	}) {
		this.lesson = config.lesson;
		this.onStateChange = config.onStateChange;
		this.onEvent = config.onEvent ?? (() => {});
		this.onStepChange = config.onStepChange;
		this.onComplete = config.onComplete;

		const save = buildTutorialSave(config.lesson.initialState);
		// 래핑: free_play 모드에서 라운드 종료 감지
		const wrappedOnStateChange = () => {
			config.onStateChange();
			if (this._freePlayMode && !this._destroyed) {
				const phase = this.state.phase;
				if (phase === 'round_ending' || phase === 'round_end' || phase === 'game_end') {
					this._freePlayMode = false;
					// 약간의 지연 후 다음 스텝(점수 설명)으로 진행
					setTimeout(() => {
						if (!this._destroyed) this.advanceStep();
					}, 500);
				}
			}
		};
		this.engine = LocalGameEngine.restore(save, wrappedOnStateChange, config.onEvent);
	}

	get state() { return this.engine.state; }
	get currentStep(): TutorialStep | null {
		return this.lesson.steps[this._stepIndex] ?? null;
	}
	get stepIndex() { return this._stepIndex; }
	get totalSteps() { return this.lesson.steps.length; }
	get destroyed() { return this._destroyed; }
	get freePlayMode() { return this._freePlayMode; }

	/** 레슨 시작: 엔진 복원 후 첫 스텝 표시 */
	start(): void {
		this.engine.resumeAfterRestore();
		const step = this.currentStep;
		if (step) {
			// stateOverride가 있으면 먼저 적용
			if (step.stateOverride) {
				this.applyStateOverride(step.stateOverride);
			}
			this.onStepChange(step, this._stepIndex);
		}
	}

	/** "다음" 버튼 (tap_next 스텝에서 호출) */
	tapNext(): void {
		const step = this.currentStep;
		if (!step || step.expectedAction.type !== 'tap_next') return;
		this.advanceStep();
	}

	/** 플레이어 카드 내기 (검증 후 엔진에 위임) */
	async humanPlayCards(cardIds: string[]): Promise<{ success: boolean; error?: string }> {
		// 자유 플레이 모드: 검증 없이 엔진에 직접 위임
		if (this._freePlayMode) {
			const result = await this.engine.humanPlayCards(cardIds);
			return result;
		}

		const step = this.currentStep;
		if (!step) return { success: false, error: '스텝 없음' };

		const action = step.expectedAction;

		// 카드 내기가 아닌 스텝에서는 플레이 불가
		if (action.type === 'tap_next' || action.type === 'wait' || action.type === 'free_play' ||
			action.type === 'declare_grand_tichu' || action.type === 'pass_grand_tichu' ||
			action.type === 'declare_small_tichu' || action.type === 'submit_exchange' ||
			action.type === 'gift_dragon') {
			return { success: false, error: this.getHintForStep(step) };
		}

		// 특정 카드가 지정된 경우 검증
		if (action.type === 'play_cards') {
			const expected = new Set(action.cardIds);
			const actual = new Set(cardIds);
			if (expected.size !== actual.size || ![...expected].every(id => actual.has(id))) {
				return { success: false, error: this.getHintForStep(step) };
			}
		}

		// any_play: 유효한 조합이면 OK
		if (action.type === 'any_play') {
			const player = this.state.players[HUMAN_SEAT];
			const cards = cardIds.map(id => findCardById(player.hand, id)).filter(Boolean);
			if (cards.length === 0) return { success: false, error: '카드를 선택하세요' };
			const combo = detectCombination(cards as any);
			if (!combo) return { success: false, error: '유효한 조합이 아닙니다' };
		}

		// pass 액션을 기대하는데 카드를 내려는 경우
		if (action.type === 'pass') {
			return { success: false, error: this.getHintForStep(step) };
		}

		// stateOverride로 pause된 상태일 수 있으므로, 플레이 전 resume하여 AI가 반응할 수 있도록 함
		this.engine.resume();
		const result = await this.engine.humanPlayCards(cardIds);
		if (result.success) {
			const nextStep = this.lesson.steps[this._stepIndex + 1];
			const nextType = nextStep?.expectedAction.type;
			// 다음 스텝이 wait/gift_dragon이면 즉시 전환 (AI 대기 없이 바로 안내 표시)
			if (nextType === 'wait' || nextType === 'gift_dragon') {
				this.advanceStep();
			} else if (this.state.phase === 'wish_declare') {
				// 앞으로 몇 스텝 내에 set_wish가 있으면 그 스텝까지 진행 (tap_next 설명 → set_wish)
				const hasUpcomingSetWish = this.lesson.steps
					.slice(this._stepIndex + 1, this._stepIndex + 4)
					.some(s => s.expectedAction.type === 'set_wish');
				if (hasUpcomingSetWish) {
					this.engine.pause();
					this.advanceStep();
				} else {
					// 소원 자동 스킵 후 다음 스텝
					this.engine.humanSetWish(null);
					this.scheduleAdvance();
				}
			} else {
				// AI가 자동 처리된 후 다음 스텝
				this.scheduleAdvance();
			}
		}
		return result;
	}

	/** 플레이어 패스 */
	humanPass(): { success: boolean; error?: string } {
		// 자유 플레이 모드: 검증 없이 엔진에 직접 위임
		if (this._freePlayMode) {
			return this.engine.humanPass();
		}

		const step = this.currentStep;
		if (!step) return { success: false, error: '스텝 없음' };

		const action = step.expectedAction;

		// pass나 any 이외의 타입에서는 패스 불가
		if (action.type !== 'pass' && action.type !== 'any') {
			return { success: false, error: this.getHintForStep(step) };
		}

		this.engine.resume();
		const result = this.engine.humanPass();
		if (result.success) {
			this.scheduleAdvance();
		}
		return result;
	}

	/** 소원 설정 */
	humanSetWish(rank: number | null): boolean {
		// 자유 플레이 모드: 검증 없이 엔진에 직접 위임
		if (this._freePlayMode) {
			return this.engine.humanSetWish(rank);
		}

		const step = this.currentStep;
		if (!step) return false;

		// set_wish 스텝이면 rank 검증 (rank가 undefined면 아무 값 허용)
		if (step.expectedAction.type === 'set_wish') {
			const expected = step.expectedAction.rank;
			if (expected !== undefined && expected !== rank) {
				return false;
			}
		}

		this.engine.resume();
		const result = this.engine.humanSetWish(rank);
		if (result) {
			// 다음 스텝이 wait/tap_next이면 즉시 전환, 아니면 AI 완료 대기
			const nextStep = this.lesson.steps[this._stepIndex + 1];
			const nextType = nextStep?.expectedAction.type;
			if (nextType === 'wait' || nextType === 'tap_next') {
				this.advanceStep();
			} else {
				this.scheduleAdvance();
			}
		}
		return result;
	}

	/** 용 양도 */
	humanGiftDragon(seat: SeatIndex): { success: boolean; error?: string } {
		// 자유 플레이 모드: 검증 없이 엔진에 직접 위임
		if (this._freePlayMode) {
			const result = this.engine.humanGiftDragon(seat);
			return result ? { success: true } : { success: false, error: '양도할 수 없습니다' };
		}

		const step = this.currentStep;
		if (!step) return { success: false, error: '스텝 없음' };

		const action = step.expectedAction;

		// gift_dragon 타입이면 아무 상대에게나 양도 허용
		if (action.type !== 'gift_dragon' && action.type !== 'any') {
			return { success: false, error: this.getHintForStep(step) };
		}

		const result = this.engine.humanGiftDragon(seat);
		if (result) {
			this.scheduleAdvance();
			return { success: true };
		}
		return { success: false, error: '양도할 수 없습니다' };
	}

	/** 그랜드 티츄 선언 */
	humanDeclareGrandTichu(): { success: boolean; error?: string } {
		const step = this.currentStep;
		if (!step) return { success: false, error: '스텝 없음' };

		if (step.expectedAction.type !== 'declare_grand_tichu' && step.expectedAction.type !== 'any') {
			return { success: false, error: this.getHintForStep(step) };
		}

		const result = this.engine.humanDeclareGrandTichu();
		if (result) {
			this.scheduleAdvance();
			return { success: true };
		}
		return { success: false, error: '그랜드 티츄를 선언할 수 없습니다' };
	}

	/** 그랜드 티츄 패스 */
	humanPassGrandTichu(): { success: boolean; error?: string } {
		const step = this.currentStep;
		if (!step) return { success: false, error: '스텝 없음' };

		if (step.expectedAction.type !== 'pass_grand_tichu' && step.expectedAction.type !== 'any') {
			return { success: false, error: this.getHintForStep(step) };
		}

		const result = this.engine.humanPassGrandTichu();
		if (result) {
			this.scheduleAdvance();
			return { success: true };
		}
		return { success: false, error: '그랜드 티츄를 패스할 수 없습니다' };
	}

	/** 스몰 티츄 선언 */
	humanDeclareSmallTichu(): { success: boolean; error?: string } {
		const step = this.currentStep;
		if (!step) return { success: false, error: '스텝 없음' };

		if (step.expectedAction.type !== 'declare_small_tichu' && step.expectedAction.type !== 'any') {
			return { success: false, error: this.getHintForStep(step) };
		}

		const result = this.engine.humanDeclareSmallTichu();
		if (result) {
			this.scheduleAdvance();
			return { success: true };
		}
		return { success: false, error: '스몰 티츄를 선언할 수 없습니다' };
	}

	/** 카드 교환 제출 */
	humanSubmitExchange(exchange: ExchangeCards): { success: boolean; error?: string } {
		const step = this.currentStep;
		if (!step) return { success: false, error: '스텝 없음' };

		const action = step.expectedAction;

		// submit_exchange 타입이면 교환 카드 검증
		if (action.type === 'submit_exchange') {
			// 파트너 카드는 정확히 일치해야 함
			if (exchange.toPartner !== action.toPartner) {
				return { success: false, error: '파트너에게 줄 카드를 확인해주세요!' };
			}
			// 상대 카드는 순서 무관하게 같은 세트이면 OK
			const expectedOpponents = new Set([action.toLeft, action.toRight]);
			const actualOpponents = new Set([exchange.toLeft, exchange.toRight]);
			if (expectedOpponents.size !== actualOpponents.size ||
				![...expectedOpponents].every(c => actualOpponents.has(c))) {
				return { success: false, error: '하이라이트된 카드를 교환해보세요!' };
			}
		}

		const result = this.engine.humanSubmitExchange(exchange);
		if (result) {
			this.scheduleAdvance();
			return { success: true };
		}
		return { success: false, error: '카드를 교환할 수 없습니다' };
	}

	/** 엔진 일시정지/재개 */
	pause(): void { this.engine.pause(); }
	resume(): void { this.engine.resume(); }

	/** 현재 스텝의 힌트 메시지 */
	getHintForStep(step: TutorialStep): string {
		const action = step.expectedAction;
		switch (action.type) {
			case 'play_cards':
				return '하이라이트된 카드를 선택해서 내보세요!';
			case 'pass':
				return '패스 버튼을 눌러주세요!';
			case 'any_play':
				return '아무 유효한 카드 조합을 내보세요!';
			case 'tap_next':
				return '"다음" 버튼을 눌러주세요';
			case 'declare_grand_tichu':
				return '그랜드 티츄를 선언해주세요!';
			case 'pass_grand_tichu':
				return '그랜드 티츄를 패스해주세요!';
			case 'declare_small_tichu':
				return '스몰 티츄를 선언해주세요!';
			case 'submit_exchange':
				return '하이라이트된 카드를 교환해주세요!';
			case 'gift_dragon':
				return '상대에게 트릭을 양도해주세요!';
			case 'set_wish':
				if (action.rank === undefined) return '아무 숫자나 선택하거나 소원 없음을 눌러보세요!';
				return action.rank !== null
					? `${action.rank}을 선택해보세요!`
					: '소원 없음을 선택해보세요!';
			case 'free_play':
				return '자유롭게 플레이하세요!';
			default:
				return step.guidance.message;
		}
	}

	destroy(): void {
		this._destroyed = true;
		this.engine.destroy();
	}

	// ===== Private =====

	/** AI 처리 완료 후 자동 스텝 진행 */
	private scheduleAdvance(): void {
		const check = () => {
			if (this._destroyed) return;
			if (this.engine.isProcessingAi) {
				// AI가 아직 처리 중이면 200ms 후 재확인
				setTimeout(check, 200);
			} else {
				// AI 처리 완료 후 약간의 여유를 두고 다음 스텝
				setTimeout(() => {
					if (!this._destroyed) this.advanceStep();
				}, 400);
			}
		};
		// 최소 300ms 후 체크 시작 (UI 업데이트 시간 확보)
		setTimeout(check, 300);
	}

	private advanceStep(): void {
		this._stepIndex++;
		if (this._stepIndex >= this.lesson.steps.length) {
			this.onComplete();
			return;
		}

		const step = this.currentStep!;

		// stateOverride가 있으면 AI를 멈추고 상태를 강제 교체
		if (step.stateOverride) {
			this.engine.pause();
			this.applyStateOverride(step.stateOverride);
		}

		this.onStepChange(step, this._stepIndex);

		// wait 스텝: AI 재개 후 자동으로 행동하도록 놔두고 일정 시간 후 다음 스텝
		if (step.expectedAction.type === 'wait') {
			this.engine.resume();
			setTimeout(() => {
				if (!this._destroyed) {
					this.advanceStep();
				}
			}, 3500);
		}

		// free_play 스텝: 오버레이 숨기고 게임을 자유롭게 진행
		if (step.expectedAction.type === 'free_play') {
			this._freePlayMode = true;
			this.engine.resume();
		}
	}

	/** 게임 상태를 튜토리얼 시나리오에 맞게 덮어쓴다 */
	private applyStateOverride(override: TutorialStateOverride): void {
		if (override.hands) {
			for (let i = 0; i < 4; i++) {
				this.state.players[i].hand = [...override.hands[i]];
			}
		}
		if (override.currentSeat !== undefined && this.state.round) {
			this.state.round.currentSeat = override.currentSeat;
		}
		if (override.trick !== undefined && this.state.round) {
			this.state.round.trick = override.trick;
		}
		if (override.wish !== undefined && this.state.round) {
			this.state.round.wish = override.wish;
		}
		if (override.phase !== undefined) {
			(this.state as any).phase = override.phase;
			// exchange 페이즈로 전환 시 기존 교환 제출 초기화
			if (override.phase === 'exchange') {
				this.engine.resetExchangeSubmissions();
			}
		}
		this.onStateChange();
	}
}
