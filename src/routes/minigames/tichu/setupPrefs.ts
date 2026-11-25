/**
 * 게임 설정 기억 — 파트너·속도·목표 점수를 한번 고르면 다음에 들어와도 그대로다.
 *
 * 이 기기(브라우저)에만 저장한다. 진행 중인 게임 저장(localGameEngine.ts의 tichu_save)과는
 * 별개라, 게임을 끝내거나 포기해도 설정은 남는다.
 */
import type { AiStrategy, AiSpeed } from '$lib/games/tichu/ai/types';
import { STRATEGY_PRESETS } from '$lib/games/tichu/ai/presets';

/** 설정 화면에서 고를 수 있는 속도 */
export const SPEED_OPTIONS: { id: AiSpeed; label: string }[] = [
	{ id: 'fast', label: '빠름' },
	{ id: 'normal', label: '보통' },
	{ id: 'slow', label: '느림' }
];

/** 설정 화면에서 고를 수 있는 목표 점수 */
export const SCORE_OPTIONS = [300, 500, 700, 1000];

export interface SetupPrefs {
	partnerStrategy: AiStrategy;
	aiSpeed: AiSpeed;
	targetScore: number;
}

export const DEFAULT_SETUP: SetupPrefs = {
	partnerStrategy: 'aggressive',
	aiSpeed: 'normal',
	targetScore: 1000
};

const KEY = 'tichu_setup';

/**
 * 저장된 설정을 읽는다. 지금 화면에서 고를 수 없는 값(없어진 캐릭터·속도 등)은
 * 항목별로 기본값으로 돌린다 — 아무것도 선택 안 된 화면이 뜨지 않게.
 */
export function loadSetupPrefs(): SetupPrefs {
	let saved: Partial<Record<keyof SetupPrefs, unknown>> = {};
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (parsed && typeof parsed === 'object') saved = parsed;
	} catch { /* 저장소를 못 쓰거나 값이 깨졌으면 기본값 */ }

	const strategy = STRATEGY_PRESETS.find(p => p.id === saved.partnerStrategy)?.id;
	const speed = SPEED_OPTIONS.find(o => o.id === saved.aiSpeed)?.id;
	const score = SCORE_OPTIONS.find(s => s === saved.targetScore);
	return {
		partnerStrategy: strategy ?? DEFAULT_SETUP.partnerStrategy,
		aiSpeed: speed ?? DEFAULT_SETUP.aiSpeed,
		targetScore: score ?? DEFAULT_SETUP.targetScore
	};
}

export function saveSetupPrefs(prefs: SetupPrefs): void {
	try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
