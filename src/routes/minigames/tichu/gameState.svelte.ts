import type {
	Card, Combination, SeatIndex, TeamId, TichuRoundResult, ExchangeCards, GamePhase
} from '$lib/games/tichu/types';
import type { AiStrategy, AiSpeed } from '$lib/games/tichu/ai/types';
import { LocalGameEngine, type LocalGameConfig, type GameEvent, type ExchangeResultEntry, saveTichuGame, loadTichuGame, clearTichuSave, hasTichuSave } from '$lib/games/tichu/ai/localGameEngine';
import { triggerHaptic } from '$lib/stores/haptics';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';
import { TutorialEngine } from '$lib/games/tichu/tutorial/tutorialEngine';
import { getLessonById, LESSONS } from '$lib/games/tichu/tutorial/tutorialScenarios';
import type { TutorialStep } from '$lib/games/tichu/tutorial/tutorialTypes';
import { trackGameStart } from '$lib/games/utils';
import { resetDecisionLog, observePhase, observeState, observeEvent } from './decisionLog';
import { pickLine, type LineEvent } from '$lib/games/tichu/ai/personaLines';

export type GameView = 'setup' | 'game' | 'tutorial';
export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
	id: number;
	message: string;
	type: ToastType;
}

export function createTichuGameState() {
	// View
	let view = $state<GameView>('setup');

	// Game engine
	let engine = $state<LocalGameEngine | null>(null);
	let stateVersion = $state(0); // incremented on every engine state change to trigger reactivity

	// Setup state
	let partnerStrategy = $state<AiStrategy>('aggressive');
	let aiSpeed = $state<AiSpeed>('normal');
	let targetScore = $state(1000);

	// UI state
	let selectedCards = $state<Set<string>>(new Set());
	let actionInProgress = $state(false);

	// Exchange phase
	let exchangePartner = $state<string | null>(null);
	let exchangeLeft = $state<string | null>(null);
	let exchangeRight = $state<string | null>(null);

	// Modals
	let showDragonGiftModal = $state(false);
	let showWishModal = $state(false);
	let showRoundEndModal = $state(false);
	let showGameOverModal = $state(false);
	let showExitConfirmModal = $state(false);
	let roundResult = $state<TichuRoundResult | null>(null);
	let lastTrickPlay = $state<{ seat: SeatIndex; combination: Combination } | null>(null);
	let gameEndData = $state<{ winner: TeamId; scoreA: number; scoreB: number } | null>(null);

	// Ranking
	let rankingResult = $state<{ score: number; earnedPoints: number } | null>(null);
	let scoreSubmitting = $state(false);
	let newTitleName = $state<string | null>(null);

	// Visit prompt (비로그인 시 카페 방문 안내)
	let showVisitPrompt = $state(false);

	// Exchange result display
	let exchangeResultData = $state<ExchangeResultEntry[] | null>(null);

	// Toast notifications
	let toasts = $state<Toast[]>([]);
	let toastIdCounter = 0;

	// Save/restore
	let savedGameAvailable = $state(hasTichuSave());

	// Last game action (for visual feedback: pass, trick won, etc.)
	let lastEvent = $state<GameEvent | null>(null);
	let lastEventTimer: ReturnType<typeof setTimeout> | null = null;

	// AI tichu declaration modal
	let aiTichuDeclareInfo = $state<{ playerName: string; tichuType: 'grand' | 'small'; line: string | null } | null>(null);
	let aiTichuDeclareTimer: ReturnType<typeof setTimeout> | null = null;

	// AI 캐릭터 말풍선 (좌석별)
	let aiSpeech = $state<(string | null)[]>([null, null, null, null]);
	const aiSpeechTimers: (ReturnType<typeof setTimeout> | null)[] = [null, null, null, null];
	/** 1등 대사를 이미 한 라운드 */
	let firstLineRound = -1;

	// Tutorial state
	let tutorialEngine = $state<TutorialEngine | null>(null);
	let tutorialStep = $state<TutorialStep | null>(null);
	let tutorialStepIndex = $state(0);
	let tutorialTotalSteps = $state(0);
	let highlightCardIds = $state<Set<string>>(new Set());
	let tutorialLessonId = $state<string | null>(null);
	let showGrandTichuInTutorial = $state(false);
	const isTutorialMode = $derived(view === 'tutorial');

	// Derived states — all use getState() helper which accesses stateVersion
	// to ensure reactivity, since engine.state is a mutable object (same reference)
	// and $derived on it won't propagate changes to dependents.
	function getState() {
		void stateVersion;
		return tutorialEngine?.state ?? engine?.state ?? null;
	}

	const gameState = $derived.by(() => getState());

	const phase = $derived.by(() => getState()?.phase ?? null);

	const isMyTurn = $derived.by(() => {
		const s = getState();
		return s !== null &&
			s.phase === 'playing' &&
			s.round?.currentSeat === 0;
	});

	const myTeam = 'A' as TeamId; // Human is always Team A (seat 0)
	const partnerSeat = 2 as SeatIndex; // Always seat 2

	const isGrandTichuPhase = $derived.by(() => {
		const s = getState();
		return s !== null &&
			s.phase === 'grand_tichu_window' &&
			s.players[0]?.grandTichu === null &&
			!isTutorialMode;
	});

	const canDeclareSmallTichu = $derived.by(() => {
		const s = getState();
		return s !== null &&
			(s.phase === 'exchange' || s.phase === 'playing') &&
			!s.players[0]?.smallTichu &&
			!s.players[0]?.hasPlayedFirstCard &&
			s.players[0]?.grandTichu !== true;
	});

	const myHand = $derived.by(() => (getState()?.players[0]?.hand ?? []).filter(c => c != null));

	const sortedHand = $derived.by(() => {
		const hand = (getState()?.players[0]?.hand ?? []).filter(c => c != null);
		if (!hand.length) return [];

		// 선택 상태에 따라 정렬을 바꾸지 않는다. 예전에는 봉황을 고르면 대체하는 숫자
		// 옆으로 옮겨 정렬했는데, 카드를 고르는 도중에 봉황이 이동하면서 사이 카드들이
		// 한 칸씩 밀려(두 줄일 때는 줄을 넘어) 다음에 누르려던 자리에 다른 카드가 와 있었다.
		// 페어·트리플을 고를 때 이미 고른 카드가 다시 눌리는 원인이었다.
		const getSortValue = (c: Card): number => {
			if (c.type === 'normal') return c.rank;
			switch (c.special) {
				case 'dog': return 0;
				case 'mahjong': return 1;
				case 'phoenix': return 14.5;
				case 'dragon': return 15;
				default: return 0;
			}
		};
		return [...hand].sort((a, b) => {
			const av = getSortValue(a);
			const bv = getSortValue(b);
			if (av !== bv) return av - bv;
			if (a.type === 'normal' && b.type === 'normal') {
				const suitOrder: Record<string, number> = { jade: 0, pagoda: 1, star: 2, sword: 3 };
				return suitOrder[a.suit] - suitOrder[b.suit];
			}
			return 0;
		});
	});

	const exchangeReady = $derived(
		exchangePartner !== null && exchangeLeft !== null && exchangeRight !== null
	);

	// Track phase changes for UI reactions (plain var — not reactive, only used in effect)
	let lastPhase: GamePhase | null = null;

	$effect(() => {
		const s = getState();
		const currentPhase = s?.phase ?? null;
		if (currentPhase && currentPhase !== lastPhase) {
			const prevPhase = lastPhase;
			lastPhase = currentPhase;

			// Reset selection on phase change
			selectedCards = new Set();

			// 선언 판단 기록 (그랜드 시점 8장 → 교환 후 14장 → 라운드 결과)
			if (!isTutorialMode) observePhase(currentPhase, prevPhase, engine, partnerStrategy);

			if (currentPhase === 'exchange') {
				exchangePartner = null;
				exchangeLeft = null;
				exchangeRight = null;
			}

			// Show exchange result when transitioning from exchange to playing
			if (currentPhase === 'playing' && prevPhase === 'exchange' && engine?.exchangeResult) {
				exchangeResultData = engine.exchangeResult;
			}

			if (currentPhase === 'wish_declare' && s?.round?.currentSeat === 0 && (!isTutorialMode || tutorialEngine?.freePlayMode)) {
				showWishModal = true;
			}

			if (currentPhase === 'dragon_gift' && s?.round?.dragonGiftSeat === 0) {
				showDragonGiftModal = true;
			}

			// dragon_gift에서 폭탄 사용으로 playing으로 복귀하면 모달 닫기
			if (prevPhase === 'dragon_gift' && currentPhase === 'playing') {
				showDragonGiftModal = false;
			}

			// round_ending 시 마지막 트릭 플레이 저장 (trick이 아직 남아있음)
			if (currentPhase === 'round_ending' && s?.round?.trick) {
				const plays = s.round.trick.plays;
				if (plays.length > 0) {
					lastTrickPlay = plays[plays.length - 1];
				}
			}

			if (currentPhase === 'round_end' && s && !isTutorialMode) {
				const rounds = s.completedRounds;
				if (rounds.length > 0) {
					roundResult = rounds[rounds.length - 1];
					showRoundEndModal = true;
				}
			}

			if (currentPhase === 'game_end' && s && s.winner && !isTutorialMode) {
				gameEndData = {
					winner: s.winner,
					scoreA: s.cumulativeScoreA,
					scoreB: s.cumulativeScoreB
				};
				showGameOverModal = true;
				clearTichuSave();
				savedGameAvailable = false;
				// 랭킹 점수 제출
				submitTichuScore(s.cumulativeScoreA, s.cumulativeScoreB);
			}
		}
	});

	function dismissExchangeResult() {
		exchangeResultData = null;
	}

	function addToast(message: string, type: ToastType = 'info') {
		const id = ++toastIdCounter;
		toasts = [...toasts, { id, message, type }];

		if (type === 'error') {
			triggerHaptic([200, 50, 200]);
		}

		setTimeout(() => {
			toasts = toasts.filter(t => t.id !== id);
		}, 3000);
	}

	// ===== Save Helpers =====

	function saveNow() {
		if (engine) {
			const snapshot = engine.getSaveSnapshot();
			if (snapshot) {
				snapshot.config.partnerStrategy = partnerStrategy;
				saveTichuGame(snapshot);
				savedGameAvailable = true;
			}
		}
	}

	function handleStateChange() {
		stateVersion++;
		// 스몰 티츄가 언제 불렸는지는 phase 전환으로 안 보여서 상태 변화마다 확인한다
		if (!isTutorialMode) observeState(engine);
		// AI가 1등으로 나가면 한마디 — 나가는 순간은 이벤트가 따로 없어 상태에서 본다
		const r = engine?.state.round;
		if (!isTutorialMode && r && firstLineRound !== r.roundNumber) {
			const first = engine!.state.players.find(p => p.finishOrder === 1);
			if (first) {
				firstLineRound = r.roundNumber;
				if (first.seat !== 0) speak(first.seat, 'first');
			}
		}
	}

	function lineFor(seat: number, event: LineEvent): string | null {
		const strategy = (engine as unknown as { aiPlayers?: Map<number, { strategy: AiStrategy }> })?.aiPlayers?.get(seat)?.strategy;
		return strategy ? pickLine(strategy, event) : null;
	}

	function speak(seat: number, event: LineEvent) {
		const line = lineFor(seat, event);
		if (!line) return;
		const next = [...aiSpeech];
		next[seat] = line;
		aiSpeech = next;
		if (aiSpeechTimers[seat]) clearTimeout(aiSpeechTimers[seat]!);
		aiSpeechTimers[seat] = setTimeout(() => {
			const cleared = [...aiSpeech];
			cleared[seat] = null;
			aiSpeech = cleared;
			aiSpeechTimers[seat] = null;
		}, 2500);
	}

	/**
	 * 판 사이/복원 시 남으면 안 되는 화면 상태를 한 번에 지운다.
	 *
	 * 이 모듈의 상태는 컴포넌트가 아니라 모듈 스코프라 화면을 나갔다 와도 살아남는다.
	 * 그런데 cleanup()은 타이머만 지우고 상태는 그대로 뒀기 때문에, 배너·모달이 떠 있는
	 * 동안 나가면 그걸 지워줄 타이머가 사라진 채 상태만 남아 다시 들어왔을 때 계속 떠 있었다.
	 * (예: "AI 아랭 승리" 트릭 배너, AI 티츄 선언 모달)
	 * 각 진입점에서 lastEvent 하나만 초기화하던 것을 여기로 모은다.
	 */
	function resetTransientUi() {
		if (lastEventTimer) { clearTimeout(lastEventTimer); lastEventTimer = null; }
		if (aiTichuDeclareTimer) { clearTimeout(aiTichuDeclareTimer); aiTichuDeclareTimer = null; }
		lastEvent = null;
		aiTichuDeclareInfo = null;
		for (let i = 0; i < 4; i++) { if (aiSpeechTimers[i]) clearTimeout(aiSpeechTimers[i]!); aiSpeechTimers[i] = null; }
		aiSpeech = [null, null, null, null];
		firstLineRound = -1;
		showDragonGiftModal = false;
		showWishModal = false;
		showRoundEndModal = false;
		showGameOverModal = false;
		showExitConfirmModal = false;
		roundResult = null;
		gameEndData = null;
		lastTrickPlay = null;
		exchangeResultData = null;
		exchangePartner = null;
		exchangeLeft = null;
		exchangeRight = null;
		actionInProgress = false;
		rankingResult = null;
		newTitleName = null;
		scoreSubmitting = false;
	}

	function handleEvent(event: GameEvent) {
		if (!isTutorialMode) observeEvent(event, engine);
		if (!isTutorialMode && event.seat !== 0) {
			if (event.type === 'bomb') speak(event.seat, 'bomb');
			else if (event.type === 'dog') speak(event.seat, 'dog');
		}

		// AI tichu declaration → show modal
		if (event.type === 'tichu_declare') {
			const playerName = engine?.state.players[event.seat]?.name ?? `Player ${event.seat}`;
			// 선언 안내 창이 말풍선을 가리므로 한마디는 창 안에 넣는다
			aiTichuDeclareInfo = { playerName, tichuType: event.tichuType, line: event.seat !== 0 && !isTutorialMode ? lineFor(event.seat, event.tichuType) : null };
			if (aiTichuDeclareTimer) clearTimeout(aiTichuDeclareTimer);
			aiTichuDeclareTimer = setTimeout(() => { aiTichuDeclareInfo = null; }, 2000);
			return;
		}

		const priorityTypes = ['trick_won', 'dog', 'dragon_gift'];
		if (lastEvent && priorityTypes.includes(lastEvent.type) && !priorityTypes.includes(event.type)) return;
		lastEvent = event;
		if (lastEventTimer) clearTimeout(lastEventTimer);
		const duration = priorityTypes.includes(event.type) ? 1200 : 800;
		lastEventTimer = setTimeout(() => { lastEvent = null; }, duration);
	}

	function dismissAiTichuDeclare() {
		aiTichuDeclareInfo = null;
		if (aiTichuDeclareTimer) clearTimeout(aiTichuDeclareTimer);
	}

	// ===== Game Lifecycle =====

	function startGame() {
		trackGameStart('tichu', 'classic');
		if (engine) {
			engine.destroy();
		}

		// 이어하기가 남아 있는데 새 게임을 시작하면 그 게임은 버려진다 → 포기로 기록.
		// (게임 중 탭을 닫고 돌아오지 않은 경우도 여기서 잡힌다)
		const abandoned = loadTichuGame();
		if (abandoned && abandoned.state.phase !== 'game_end') {
			submitForfeit(abandoned.state.cumulativeScoreA, abandoned.state.cumulativeScoreB);
		}

		clearTichuSave();
		savedGameAvailable = false;
		selectedCards = new Set();

		engine = new LocalGameEngine({
			partnerStrategy,
			targetScore,
			aiSpeed,
			playerName: '나',
			onStateChange: handleStateChange,
			onEvent: handleEvent
		});

		lastPhase = null;
		resetTransientUi();
		resetDecisionLog();
		view = 'game';
		engine.startGame();
	}

	function resumeGame() {
		const save = loadTichuGame();
		if (!save) return;

		if (engine) engine.destroy();

		// cautious는 제거됨 — 이전 세이브 호환을 위해 balanced로 폴백
		const validStrategies = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
		partnerStrategy = validStrategies.includes(save.config.partnerStrategy)
			? save.config.partnerStrategy
			: 'balanced';
		// instant는 제거됨 — 이전 세이브 호환을 위해 fast로 폴백
		const validSpeeds = ['fast', 'normal', 'slow', 'very_slow'];
		aiSpeed = validSpeeds.includes(save.config.aiSpeed) ? save.config.aiSpeed : 'fast';
		targetScore = save.config.targetScore;

		engine = LocalGameEngine.restore(save, handleStateChange, handleEvent);

		lastPhase = null; // null로 설정하여 $effect가 복원된 phase를 감지 → 소원/드래곤 모달 표시
		resetTransientUi();
		selectedCards = new Set();
		view = 'game';
		engine.resumeAfterRestore();
	}

	function startNextRound() {
		showRoundEndModal = false;
		roundResult = null;
		lastTrickPlay = null;
		selectedCards = new Set();
		engine?.startNextRound();
		saveNow();
	}

	function calculateRankingScore(teamAScore: number, teamBScore: number): number {
		// 오락실 티츄 랭킹 포인트 = 우리팀 점수 - 상대팀 점수 (최소 100점) — GameSetup.svelte 랭킹 탭 안내와 동일
		return Math.max(100, teamAScore - teamBScore);
	}

	/**
	 * 진행 중인 게임을 버리면(나가기, 이어하기 대신 새 게임) 포기로 기록한다.
	 *
	 * 예전에는 버린 게임은 아무것도 남지 않았고, 끝까지 치면 져도 최소 100점이었다.
	 * 그래서 매 라운드 그랜드를 부르고 실패하면 게임을 버리고 다시 시작하는 쪽이
	 * 가장 효율적이었다(실제로 한 유저가 게임 43판을 시작해 21판만 완주, 남은 라운드는
	 * 전부 그랜드 성공). 포기는 끝까지 쳐서 지는 것(+100)보다 항상 손해가 되게 한다.
	 * 첫 라운드 전 포기도 봐주지 않는다 — 8장을 보고 마음에 안 들면 다시 뽑는 길이 남는다.
	 */
	const FORFEIT_PENALTY = 100;
	function calculateForfeitScore(teamAScore: number, teamBScore: number): number {
		return Math.min(0, teamAScore - teamBScore) - FORFEIT_PENALTY;
	}

	function submitForfeit(teamAScore: number, teamBScore: number) {
		const score = calculateForfeitScore(teamAScore, teamBScore);
		// 화면 전환을 막지 않도록 기다리지 않는다. 실패(비로그인 등)해도 조용히 넘어간다.
		fetch('/api/game/record', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ gameId: 'tichu', difficulty: 'default', clearTime: 0, score, cleared: false })
		}).catch(() => {});
	}

	/** 지금 진행 중인 게임을 버리면 받을 점수 (나가기 확인 창 표시용) */
	const currentForfeitScore = $derived.by(() => {
		const s = getState();
		if (!s || s.phase === 'game_end' || isTutorialMode) return null;
		return calculateForfeitScore(s.cumulativeScoreA, s.cumulativeScoreB);
	});

	/** 저장된(이어하기) 게임을 버리고 새로 시작하면 받을 점수 (시작 화면 표시용) */
	function savedForfeitScore(): number | null {
		const save = loadTichuGame();
		if (!save || save.state.phase === 'game_end') return null;
		return calculateForfeitScore(save.state.cumulativeScoreA, save.state.cumulativeScoreB);
	}

	async function submitTichuScore(teamAScore: number, teamBScore: number) {
		if (scoreSubmitting) return;
		scoreSubmitting = true;
		try {
			const score = calculateRankingScore(teamAScore, teamBScore);
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ gameId: 'tichu', difficulty: 'default', clearTime: 0, score })
			});
			if (res.ok) {
				const data = await res.json();
				rankingResult = { score: data.score, earnedPoints: data.earnedPoints };

				// Show Rank Up animation if rank increased
				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'tichu', data.score);
				}

				if (data.newTitles && data.newTitles.length > 0) {
					newTitleName = data.newTitles[0];
				}
			} else if (res.status === 401 || res.status === 403) {
				showVisitPrompt = true;
			}
		} catch (e) {
			console.error('[Tichu] Score submit failed:', e);
		} finally {
			scoreSubmitting = false;
		}
	}

	function pauseGame() {
		if (isTutorialMode) {
			tutorialEngine?.pause();
			showExitConfirmModal = true;
			return;
		}
		engine?.pause();
		showExitConfirmModal = true;
	}

	function resumeFromPause() {
		showExitConfirmModal = false;
		if (isTutorialMode) {
			tutorialEngine?.resume();
			return;
		}
		engine?.resume();
	}

	function backToSetup() {
		if (isTutorialMode) {
			exitTutorial();
			showExitConfirmModal = false;
			return;
		}
		const s = engine?.state;
		if (s && s.phase !== 'game_end') {
			submitForfeit(s.cumulativeScoreA, s.cumulativeScoreB);
		}
		clearTichuSave();
		savedGameAvailable = false;
		if (engine) {
			engine.destroy();
			engine = null;
		}
		view = 'setup';
		showExitConfirmModal = false;
		showRoundEndModal = false;
		showGameOverModal = false;
		roundResult = null;
		lastTrickPlay = null;
		gameEndData = null;
		rankingResult = null;
		newTitleName = null;
		lastPhase = null;
		stateVersion = 0;
	}

	function flushSave() {
		saveNow();
	}

	function cleanup() {
		saveNow();
		resetTransientUi();
		if (engine) {
			engine.destroy();
			engine = null;
		}
		if (tutorialEngine) {
			tutorialEngine.destroy();
			tutorialEngine = null;
		}
	}

	// ===== Tutorial =====

	function startTutorial(lessonId: string) {
		const lesson = getLessonById(lessonId);
		if (!lesson) return;

		if (engine) { engine.pause(); }
		if (tutorialEngine) { tutorialEngine.destroy(); }

		tutorialLessonId = lessonId;
		tutorialStep = null;
		tutorialStepIndex = 0;
		tutorialTotalSteps = lesson.steps.length;
		highlightCardIds = new Set();
		selectedCards = new Set();
		lastPhase = null;
		resetTransientUi();

		tutorialEngine = new TutorialEngine({
			lesson,
			onStateChange: handleStateChange,
			onEvent: handleEvent,
			onStepChange: (step: TutorialStep, index: number) => {
				tutorialStepIndex = index;
				// free_play 스텝: 오버레이 숨기고 자유 플레이
				if (step.expectedAction.type === 'free_play') {
					tutorialStep = null;
					highlightCardIds = new Set();
					showGrandTichuInTutorial = false;
					return;
				}
				tutorialStep = step;
				highlightCardIds = new Set(step.highlightCards ?? []);
				// set_wish 스텝이면 WishModal 표시
				if (step.expectedAction.type === 'set_wish') {
					showWishModal = true;
				}
				// grand tichu 스텝이면 모달 표시, 아니면 숨김
				const actionType = step.expectedAction.type;
				showGrandTichuInTutorial = (actionType === 'declare_grand_tichu' || actionType === 'pass_grand_tichu');
			},
			onComplete: () => {
				// Mark lesson as completed in localStorage
				try {
					const key = 'tichu_tutorial_progress';
					const progress = JSON.parse(localStorage.getItem(key) || '{}');
					progress[lessonId] = true;
					localStorage.setItem(key, JSON.stringify(progress));
				} catch { /* ignore */ }
				// 다음 레슨이 있으면 바로 시작, 없으면 종료
				const currentIndex = LESSONS.findIndex(l => l.id === lessonId);
				const nextLesson = LESSONS[currentIndex + 1];
				if (nextLesson) {
					startTutorial(nextLesson.id);
				} else {
					exitTutorial();
				}
			}
		});

		// Use tutorial engine's internal LocalGameEngine as our engine for rendering
		engine = null; // Clear regular engine reference
		stateVersion = 0;
		view = 'tutorial';
		tutorialEngine.start();
	}

	function exitTutorial() {
		if (tutorialEngine) {
			tutorialEngine.destroy();
			tutorialEngine = null;
		}
		tutorialStep = null;
		tutorialStepIndex = 0;
		tutorialTotalSteps = 0;
		highlightCardIds = new Set();
		tutorialLessonId = null;
		selectedCards = new Set();
		lastPhase = null;
		resetTransientUi();
		stateVersion = 0;
		view = 'setup';
	}

	function tutorialTapNext() {
		tutorialEngine?.tapNext();
	}

	// ===== Card Selection =====

	function toggleCard(cardId: string) {
		const next = new Set(selectedCards);
		if (next.has(cardId)) {
			next.delete(cardId);
		} else {
			next.add(cardId);
		}
		selectedCards = next;
	}

	function clearSelection() {
		selectedCards = new Set();
	}

	// ===== Exchange =====

	function setExchangeCard(target: 'partner' | 'left' | 'right', cardId: string | null) {
		if (cardId) {
			if (exchangePartner === cardId && target !== 'partner') exchangePartner = null;
			if (exchangeLeft === cardId && target !== 'left') exchangeLeft = null;
			if (exchangeRight === cardId && target !== 'right') exchangeRight = null;
		}
		if (target === 'partner') exchangePartner = cardId;
		else if (target === 'left') exchangeLeft = cardId;
		else exchangeRight = cardId;
	}

	function submitExchange() {
		if (!exchangePartner || !exchangeLeft || !exchangeRight) return;
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanSubmitExchange({
				toPartner: exchangePartner,
				toLeft: exchangeLeft,
				toRight: exchangeRight
			});
			if (result.success) {
				exchangePartner = null;
				exchangeLeft = null;
				exchangeRight = null;
				addToast('카드를 교환했습니다', 'info');
			} else {
				addToast(result.error || '교환할 수 없습니다', 'error');
			}
			return;
		}
		const result = engine?.humanSubmitExchange({
			toPartner: exchangePartner,
			toLeft: exchangeLeft,
			toRight: exchangeRight
		});
		if (result) {
			saveNow();
			addToast('카드를 교환했습니다', 'info');
		}
	}

	// ===== Game Actions =====

	async function playSelectedCards() {
		if (selectedCards.size === 0 || actionInProgress) return;

		// Tutorial mode
		if (isTutorialMode && tutorialEngine) {
			actionInProgress = true;
			try {
				const cardIds = Array.from(selectedCards);
				const result = await tutorialEngine.humanPlayCards(cardIds);
				if (result.success) {
					selectedCards = new Set();
				} else {
					addToast(result.error || '카드를 낼 수 없습니다', 'error');
				}
			} finally {
				actionInProgress = false;
			}
			return;
		}

		if (!engine) return;
		actionInProgress = true;
		try {
			const cardIds = Array.from(selectedCards);
			const result = await engine.humanPlayCards(cardIds);
			if (result.success) {
				selectedCards = new Set();
				saveNow();
			} else {
				addToast(result.error || '카드를 낼 수 없습니다', 'error');
			}
		} finally {
			actionInProgress = false;
		}
	}

	function pass() {
		// Tutorial mode
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanPass();
			if (result.success) {
				selectedCards = new Set();
			} else {
				addToast(result.error || '패스할 수 없습니다', 'error');
			}
			return;
		}

		if (!engine || actionInProgress) return;
		const result = engine.humanPass();
		if (result.success) {
			saveNow();
		} else {
			addToast(result.error || '패스할 수 없습니다', 'error');
		}
	}

	function declareGrandTichu() {
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanDeclareGrandTichu();
			if (result.success) {
				addToast('그랜드 티츄를 선언했습니다!', 'success');
			} else {
				addToast(result.error || '그랜드 티츄를 선언할 수 없습니다', 'error');
			}
			return;
		}
		const result = engine?.humanDeclareGrandTichu();
		if (result) {
			saveNow();
			addToast('그랜드 티츄를 선언했습니다!', 'success');
		}
	}

	function passGrandTichu() {
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanPassGrandTichu();
			if (!result.success) {
				addToast(result.error || '패스할 수 없습니다', 'error');
			}
			return;
		}
		if (engine?.humanPassGrandTichu()) {
			saveNow();
		}
	}

	function declareSmallTichu() {
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanDeclareSmallTichu();
			if (result.success) {
				addToast('스몰 티츄를 선언했습니다!', 'success');
			} else {
				addToast(result.error || '스몰 티츄를 선언할 수 없습니다', 'error');
			}
			return;
		}
		if (engine?.humanDeclareSmallTichu()) {
			saveNow();
			addToast('스몰 티츄를 선언했습니다!', 'success');
		}
	}

	function setWish(rank: number | null) {
		showWishModal = false;
		if (isTutorialMode && tutorialEngine) {
			const ok = tutorialEngine.humanSetWish(rank);
			if (!ok) {
				showWishModal = true;
				const step = tutorialEngine.currentStep;
				if (step) addToast(tutorialEngine.getHintForStep(step), 'info');
			}
			return;
		}
		engine?.humanSetWish(rank);
		saveNow();
	}

	function giftDragon(seat: SeatIndex) {
		showDragonGiftModal = false;
		if (isTutorialMode && tutorialEngine) {
			const result = tutorialEngine.humanGiftDragon(seat);
			if (!result.success) {
				addToast(result.error || '양도할 수 없습니다', 'error');
			}
			return;
		}
		engine?.humanGiftDragon(seat);
		saveNow();
	}

	async function playBomb(cardIds: string[]) {
		if (!engine || actionInProgress) return;
		actionInProgress = true;
		try {
			const result = await engine.humanPlayBomb(cardIds);
			if (result.success) {
				selectedCards = new Set();
				saveNow();
				addToast('💣 폭탄!', 'warning');
			} else {
				addToast(result.error || '폭탄을 사용할 수 없습니다', 'error');
			}
		} finally {
			actionInProgress = false;
		}
	}

	return {
		// View & setup
		get view() { return view; },
		get partnerStrategy() { return partnerStrategy; },
		set partnerStrategy(v: AiStrategy) { partnerStrategy = v; },
		get aiSpeed() { return aiSpeed; },
		set aiSpeed(v: AiSpeed) { aiSpeed = v; },
		get targetScore() { return targetScore; },
		set targetScore(v: number) { targetScore = v; },

		// Game state (derived from engine)
		// Access stateVersion to subscribe to engine state changes in components
		get stateVersion() { return stateVersion; },
		get gameState() { return gameState; },
		get humanExchangeIds() { return engine?.getHumanExchangeIds() ?? []; },
		get phase() { return phase; },

		// UI state
		get selectedCards() { return selectedCards; },
		get exchangePartner() { return exchangePartner; },
		get exchangeLeft() { return exchangeLeft; },
		get exchangeRight() { return exchangeRight; },
		get exchangeReady() { return exchangeReady; },
		get showDragonGiftModal() { return showDragonGiftModal; },
		set showDragonGiftModal(v: boolean) { showDragonGiftModal = v; },
		get showWishModal() { return showWishModal; },
		set showWishModal(v: boolean) { showWishModal = v; },
		get showRoundEndModal() { return showRoundEndModal; },
		set showRoundEndModal(v: boolean) { showRoundEndModal = v; },
		get showGameOverModal() { return showGameOverModal; },
		set showGameOverModal(v: boolean) { showGameOverModal = v; },
		get showExitConfirmModal() { return showExitConfirmModal; },
		get roundResult() { return roundResult; },
		get lastTrickPlay() { return lastTrickPlay; },
		get gameEndData() { return gameEndData; },
		set gameEndData(v: { winner: TeamId; scoreA: number; scoreB: number } | null) { gameEndData = v; },
		get rankingResult() { return rankingResult; },
		get newTitleName() { return newTitleName; },
		set newTitleName(v: string | null) { newTitleName = v; },
		get showVisitPrompt() { return showVisitPrompt; },
		set showVisitPrompt(v: boolean) { showVisitPrompt = v; },
		get toasts() { return toasts; },
		get lastEvent() { return lastEvent; },
		get aiTichuDeclareInfo() { return aiTichuDeclareInfo; },
		get aiSpeech() { return aiSpeech; },
		dismissAiTichuDeclare,
		get exchangeResultData() { return exchangeResultData; },

		// Derived
		get isMyTurn() { return isMyTurn; },
		get isGrandTichuPhase() { return isGrandTichuPhase || showGrandTichuInTutorial; },
		get actionInProgress() { return actionInProgress; },
		get myTeam() { return myTeam; },
		get partnerSeat() { return partnerSeat; },
		get canDeclareSmallTichu() { return canDeclareSmallTichu; },
		get sortedHand() { return sortedHand; },
		get myHand() { return myHand; },

		// Save/restore
		get savedGameAvailable() { return savedGameAvailable; },
		get currentForfeitScore() { return currentForfeitScore; },
		savedForfeitScore,
		resumeGame,
		flushSave,

		// Tutorial
		get isTutorialMode() { return isTutorialMode; },
		get tutorialStep() { return tutorialStep; },
		get tutorialStepIndex() { return tutorialStepIndex; },
		get tutorialTotalSteps() { return tutorialTotalSteps; },
		get highlightCardIds() { return highlightCardIds; },
		get tutorialLessonId() { return tutorialLessonId; },
		startTutorial,
		exitTutorial,
		tutorialTapNext,

		// Actions
		startGame,
		startNextRound,
		pauseGame,
		resumeFromPause,
		backToSetup,
		cleanup,
		toggleCard,
		clearSelection,
		setExchangeCard,
		submitExchange,
		dismissExchangeResult,
		playSelectedCards,
		pass,
		declareGrandTichu,
		passGrandTichu,
		declareSmallTichu,
		setWish,
		giftDragon,
		playBomb,
		addToast
	};
}
