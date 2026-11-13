/**
 * 학습 모델이 실제로 불러와지고, 게임 끝까지 규칙에 맞는 수만 고르는지 확인한다.
 * (규칙에 어긋난 수를 내면 엔진이 [Engine] 경고를 남기고 대체 수를 낸다 — 그 경고가 없어야 한다)
 */
import { describe, it, expect } from 'vitest';
import { loadHumanModel } from './humanModel';
import * as hm from './humanModel';
import { simulateGame, clampTimers, seedRandom } from './simHarness';
import type { AiStrategy } from './types';

describe('사람 기록 학습 모델', () => {
	it('불러와진다', async () => {
		const model = await loadHumanModel();
		expect(model).not.toBeNull();
		expect(model!.trees.length).toBeGreaterThan(0);
		expect(model!.features).toContain('u_rami');
	});

	it('모든 캐릭터가 모델로 게임을 끝까지 둔다', async () => {
		await loadHumanModel();
		const restore = clampTimers();
		const un = seedRandom(42);
		try {
			const presets: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
			for (let g = 0; g < 2; g++) {
				const r = await simulateGame({
					presets: [presets[g], presets[(g + 1) % 5], presets[(g + 2) % 5], presets[(g + 3) % 5]] as [AiStrategy, AiStrategy, AiStrategy, AiStrategy],
					targetScore: 300
				});
				expect(r.crash).toBeNull();
				expect(r.completed).toBe(true);
				expect(r.consoleNoise.filter(n => /\[Engine\]/.test(n))).toEqual([]);
			}
			expect(hm.getHumanModel()).not.toBeNull();
		} finally {
			un();
			restore();
		}
	}, 120_000);
});
