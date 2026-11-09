import { describe, it, expect } from 'vitest';
import { kstDateKey, shiftDateKey, dailySeed, seededRandom, dailyStreak } from './dailyPuzzle';
import { generateDailyLevel } from './water-sort/levels';

describe('오늘의 퍼즐', () => {
	it('날짜는 한국 시간 기준이다 (UTC 15:00 = 다음날 자정)', () => {
		expect(kstDateKey(new Date('2026-11-09T14:59:59Z'))).toBe('2026-11-09');
		expect(kstDateKey(new Date('2026-11-09T15:00:00Z'))).toBe('2026-11-10');
	});

	it('날짜 키를 하루씩 옮긴다 (월·연 경계 포함)', () => {
		expect(shiftDateKey('2026-12-01', -1)).toBe('2026-11-30');
		expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('같은 날짜는 같은 난수열, 다른 날짜는 다른 난수열', () => {
		const a = seededRandom(dailySeed('2026-11-09', 'water-sort'));
		const b = seededRandom(dailySeed('2026-11-09', 'water-sort'));
		const c = seededRandom(dailySeed('2026-11-10', 'water-sort'));
		const seqA = [a(), a(), a()];
		expect([b(), b(), b()]).toEqual(seqA);
		expect([c(), c(), c()]).not.toEqual(seqA);
	});

	it('워터소트: 같은 날이면 누구에게나 같은 문제', () => {
		const one = generateDailyLevel('2026-11-09');
		const two = generateDailyLevel('2026-11-09');
		expect(two).toEqual(one);
		expect(generateDailyLevel('2026-11-10').tubes).not.toEqual(one.tubes);
	});

	it('연속 참여: 오늘 안 했으면 어제부터 센다', () => {
		const played = ['2026-11-06', '2026-11-07', '2026-11-08'];
		expect(dailyStreak(played, '2026-11-09')).toBe(3);
		expect(dailyStreak([...played, '2026-11-09'], '2026-11-09')).toBe(4);
		expect(dailyStreak(['2026-11-06', '2026-11-08'], '2026-11-09')).toBe(1);
		expect(dailyStreak(['2026-11-05'], '2026-11-09')).toBe(0);
	});
});
