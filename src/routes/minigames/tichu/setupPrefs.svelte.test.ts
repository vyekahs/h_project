/**
 * 게임 설정 기억 — 한번 고른 파트너·속도·목표 점수가 다음 방문에도 그대로인지.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadSetupPrefs, saveSetupPrefs, DEFAULT_SETUP } from './setupPrefs';
import { createTichuGameState } from './gameState.svelte';

const KEY = 'tichu_setup';

/** 티츄 페이지를 여는 것처럼 화면 상태를 새로 만든다 (상태 안의 $effect 때문에 root가 필요하다) */
const closers: (() => void)[] = [];
function openPage() {
	let game!: ReturnType<typeof createTichuGameState>;
	closers.push($effect.root(() => { game = createTichuGameState(); }));
	return game;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
	vi.restoreAllMocks();
	while (closers.length) closers.pop()!();
});

describe('설정 저장·읽기', () => {
	it('저장한 적이 없으면 기본값', () => {
		expect(loadSetupPrefs()).toEqual(DEFAULT_SETUP);
	});

	it('저장한 값을 그대로 읽는다', () => {
		const prefs = { partnerStrategy: 'balanced', aiSpeed: 'fast', targetScore: 500 } as const;
		saveSetupPrefs(prefs);
		expect(loadSetupPrefs()).toEqual(prefs);
	});

	it('깨진 값이면 기본값', () => {
		for (const raw of ['{', 'null', '"abc"', '[1,2]', '42']) {
			localStorage.setItem(KEY, raw);
			expect(loadSetupPrefs(), raw).toEqual(DEFAULT_SETUP);
		}
	});

	it('지금 고를 수 없는 값은 그 항목만 기본값으로 돌린다', () => {
		// cautious(없어진 캐릭터)·very_slow(화면에 없는 속도)·999(없는 점수)
		localStorage.setItem(KEY, JSON.stringify({ partnerStrategy: 'cautious', aiSpeed: 'fast', targetScore: 300 }));
		expect(loadSetupPrefs()).toEqual({ partnerStrategy: DEFAULT_SETUP.partnerStrategy, aiSpeed: 'fast', targetScore: 300 });

		localStorage.setItem(KEY, JSON.stringify({ partnerStrategy: 'wild', aiSpeed: 'very_slow', targetScore: 999 }));
		expect(loadSetupPrefs()).toEqual({ partnerStrategy: 'wild', aiSpeed: DEFAULT_SETUP.aiSpeed, targetScore: DEFAULT_SETUP.targetScore });

		// 숫자가 문자열로 들어 있어도 받지 않는다
		localStorage.setItem(KEY, JSON.stringify({ targetScore: '500' }));
		expect(loadSetupPrefs().targetScore).toBe(DEFAULT_SETUP.targetScore);
	});

	it('저장소를 못 써도 게임은 열린다', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
		expect(loadSetupPrefs()).toEqual(DEFAULT_SETUP);
		expect(() => saveSetupPrefs(DEFAULT_SETUP)).not.toThrow();
	});
});

describe('설정 화면', () => {
	it('고른 설정이 다음에 들어왔을 때 그대로다', () => {
		const first = openPage();
		expect(first.partnerStrategy).toBe(DEFAULT_SETUP.partnerStrategy);
		first.partnerStrategy = 'tricky';
		first.aiSpeed = 'slow';
		first.targetScore = 300;

		// 페이지를 새로 열면 상태가 다시 만들어진다
		const next = openPage();
		expect(next.partnerStrategy).toBe('tricky');
		expect(next.aiSpeed).toBe('slow');
		expect(next.targetScore).toBe(300);
	});

	it('하나만 바꿔도 나머지는 유지된다', () => {
		saveSetupPrefs({ partnerStrategy: 'wild', aiSpeed: 'fast', targetScore: 700 });
		const game = openPage();
		game.targetScore = 500;
		expect(loadSetupPrefs()).toEqual({ partnerStrategy: 'wild', aiSpeed: 'fast', targetScore: 500 });
	});

	it('진행 중인 게임 저장을 지워도 설정은 남는다', () => {
		const game = openPage();
		game.aiSpeed = 'fast';
		localStorage.removeItem('tichu_save');
		expect(openPage().aiSpeed).toBe('fast');
	});
});
