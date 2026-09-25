import { describe, it, expect } from 'vitest';
import { getKillScore, calculateScore } from './gameLogic';

describe('레지사이드 점수', () => {
	it('처치한 적 수만큼 점수 — J 20 / Q 40 / K 60', () => {
		expect(getKillScore(0)).toBe(0);
		expect(getKillScore(1)).toBe(20);
		expect(getKillScore(4)).toBe(80);
		expect(getKillScore(5)).toBe(120);
		expect(getKillScore(8)).toBe(240);
		expect(getKillScore(9)).toBe(300);
		expect(getKillScore(12)).toBe(480);
		expect(getKillScore(99), '12 초과는 12로 본다').toBe(480);
		expect(getKillScore(-3)).toBe(0);
	});

	it('클리어하지 못한 판은 처치 점수만 (시간·광대와 무관)', () => {
		expect(calculateScore(7, 0, 10)).toBe(200);
		expect(calculateScore(7, 2, 900)).toBe(200);
	});

	it('클리어하면 등급·시간 보너스를 얹는다', () => {
		expect(calculateScore(12, 0, 400)).toBe(480 + 300 + 400);
		expect(calculateScore(12, 1, 400)).toBe(480 + 150 + 400);
		expect(calculateScore(12, 2, 700), '10분을 넘기면 시간 보너스 0').toBe(480 + 50);
	});
});
