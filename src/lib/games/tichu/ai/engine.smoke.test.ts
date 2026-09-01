/**
 * 티츄 엔진 스모크 테스트.
 * 5개 프리셋이 섞인 게임을 끝까지 돌려 크래시·경고 없이 완주하는지 확인한다.
 * (AI 로직을 고칠 때 규칙 위반이나 무한루프를 조기에 잡기 위한 최소 회귀 테스트)
 */
import { describe, it, expect } from 'vitest';
import { simulateGame, clampTimers } from './simHarness';
import type { AiStrategy } from './types';

const COMBOS: [AiStrategy, AiStrategy, AiStrategy, AiStrategy][] = [
	['aggressive', 'defensive', 'balanced', 'tricky'],
	['wild', 'balanced', 'defensive', 'aggressive'],
	['tricky', 'wild', 'aggressive', 'balanced'],
	['balanced', 'balanced', 'balanced', 'balanced'],
	['defensive', 'tricky', 'wild', 'defensive']
];

describe('티츄 엔진 스모크', () => {
	it('프리셋 조합별로 게임이 크래시 없이 완주된다', async () => {
		const restore = clampTimers();
		try {
			for (const presets of COMBOS) {
				const r = await simulateGame({ presets, targetScore: 300 });
				expect(r.crash, `crash with ${presets.join('/')}`).toBeNull();
				expect(r.completed, `did not finish with ${presets.join('/')}`).toBe(true);
				expect(r.consoleNoise, `console noise with ${presets.join('/')}`).toEqual([]);
				expect(r.rounds).toBeGreaterThan(0);
			}
		} finally {
			restore();
		}
	}, 120000);
});
