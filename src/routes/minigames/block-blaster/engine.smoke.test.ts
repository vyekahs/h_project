/**
 * 블럭블라스터 스모크 테스트.
 * 클래식/플러스 모드가 크래시 없이 끝까지 진행되는지 확인한다.
 * (밸런스 수치를 고칠 때 로직이 깨지지 않았는지 잡기 위한 최소 회귀 테스트)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runGame, clampTimers } from './simHarness';

let restoreFetch: (() => void) | null = null;
beforeAll(() => {
	// submitScore가 상대 URL로 fetch를 호출 — 노드 환경에서 의미 없으므로 차단
	const real = globalThis.fetch;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
	restoreFetch = () => { globalThis.fetch = real; };
});
afterAll(() => restoreFetch?.());

describe('블럭블라스터 스모크', () => {
	it('클래식/플러스가 정상 종료된다', async () => {
		const restore = clampTimers();
		try {
			for (const mode of ['classic', 'special'] as const) {
				for (let i = 0; i < 5; i++) {
					const r = await runGame({ mode });
					expect(r.stalled, `${mode} #${i} 진행 불가(무한루프 의심)`).toBe(false);
					expect(r.turns, `${mode} #${i} 한 수도 두지 못함`).toBeGreaterThan(0);
				}
			}
		} finally { restore(); }
	}, 180000);
});
