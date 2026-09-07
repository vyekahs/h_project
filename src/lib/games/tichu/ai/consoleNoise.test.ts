/**
 * AI와 엔진이 어긋나는 지점을 콘솔 경고로 잡는다.
 *
 * 엔진은 AI가 낸 수가 규칙에 안 맞으면 거부하고 console.warn을 남긴 뒤
 * autoPlayForAi로 대체한다. 게임은 계속 진행되므로 점수 측정으로는 절대
 * 드러나지 않지만, 실제로는 AI가 "낼 수 없는 수"를 고르고 있다는 뜻이다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateBatch, clampTimers } from './simHarness';
import type { AiStrategy } from './types';

const PRESETS: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];

describe('엔진 경고', () => {
	let restore: () => void;
	beforeAll(() => { restore = clampTimers(); });
	afterAll(() => restore?.());

	it('AI가 규칙에 안 맞는 수를 고르지 않는다', async () => {
		const noise = new Map<string, number>();
		let games = 0;
		for (let batch = 0; batch < 12; batch++) {
			const presets = [0, 1, 2, 3].map(i => PRESETS[(batch + i) % PRESETS.length]) as [AiStrategy, AiStrategy, AiStrategy, AiStrategy];
			const results = await simulateBatch({ presets }, 25, 8);
			for (const r of results) {
				games++;
				for (const line of r.consoleNoise) {
					// 좌석 번호·카드 id 같은 가변 부분을 지워 묶는다
					const key = line.replace(/\d+/g, 'N').slice(0, 120);
					noise.set(key, (noise.get(key) ?? 0) + 1);
				}
				if (r.crash) noise.set(`CRASH: ${r.crash}`.slice(0, 120), (noise.get(`CRASH: ${r.crash}`) ?? 0) + 1);
			}
		}
		const rows = [...noise.entries()].sort((a, b) => b[1] - a[1]);
		if (rows.length > 0) {
			console.log(`\n[경고] ${games}게임 중`);
			for (const [k, n] of rows.slice(0, 10)) console.log(`  ${n}회  ${k}`);
		} else {
			console.log(`\n[경고] ${games}게임 이상 없음`);
		}
		expect(rows.map(r => r[0]), '엔진 경고 발생').toEqual([]);
	}, 3000000);
});
