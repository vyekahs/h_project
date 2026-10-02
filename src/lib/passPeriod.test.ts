import { describe, it, expect } from 'vitest';
import { computePassPeriod, formatKstDate, PASS_DAYS } from './passPeriod';

/*
    이 계산은 정기권 페이지에서 가장 까다로운 로직인데 테스트가 없었다.
    월·화 보정과 KST 23:59:59 보정이 둘 다 여기 있다.
*/
describe('computePassPeriod', () => {
    it('시작일 당일을 포함해 30일이다', () => {
        // 2026-09-10(목) + 29일 = 2026-10-09(금) — 보정 없음
        const p = computePassPeriod('2026-09-10')!;
        expect(p.expiresDate).toBe('2026-10-09');
        expect(p.totalDays).toBe(PASS_DAYS);
        expect(p.shiftDays).toBe(0);
        expect(p.explanation).toBeNull();
    });

    it('월요일에 걸리면 하루씩 두 번 밀리고, 이유가 각각 남는다', () => {
        // 2026-09-13(일) + 29일 = 2026-10-12(월) → 화(10/13)도 막혀 있어 수(10/14)
        const p = computePassPeriod('2026-09-13')!;
        expect(p.expiresDate).toBe('2026-10-14');
        expect(p.shiftDays).toBe(2);
        expect(p.totalDays).toBe(32);
        // 이틀이지만 이유는 둘이다. 뭉치면 나중에 한쪽 규칙만 바뀔 때 구분이 안 된다.
        expect(p.shifts).toEqual([
            { from: '2026-10-12', dow: '월', reason: '휴무', days: 1 },
            { from: '2026-10-13', dow: '화', reason: '정기권을 적용하지 않는 날', days: 1 }
        ]);
        expect(p.explanation).toBe(
            '만료일 10/12(월)은 휴무 +1일 · 만료일 10/13(화)은 정기권을 적용하지 않는 날 +1일'
        );
    });

    it('화요일에 걸리면 하루만, 그 이유로만 밀린다', () => {
        // 2026-09-14(월) + 29일 = 2026-10-13(화)
        const p = computePassPeriod('2026-09-14')!;
        expect(p.expiresDate).toBe('2026-10-14');
        expect(p.shiftDays).toBe(1);
        expect(p.totalDays).toBe(31);
        expect(p.shifts).toEqual([
            { from: '2026-10-13', dow: '화', reason: '정기권을 적용하지 않는 날', days: 1 }
        ]);
        expect(p.explanation).toBe('만료일 10/13(화)은 정기권을 적용하지 않는 날 +1일');
    });

    it('만료 시각은 그 날 23:59:59.999 KST 다', () => {
        const p = computePassPeriod('2026-09-10')!;
        // KST 23:59:59.999 = UTC 14:59:59.999
        expect(p.expiresAt.toISOString()).toBe('2026-10-09T14:59:59.999Z');
    });

    it('서버 타임존이 KST가 아니어도 같은 답을 낸다', () => {
        // 날짜 산술을 UTC 컴포넌트로만 하므로 프로세스 TZ에 흔들리지 않는다.
        // (예전 구현은 UTC 자정 Date에 로컬 getDate()/getDay()를 섞어 썼다.)
        const tz = process.env.TZ;
        try {
            process.env.TZ = 'America/New_York';
            const a = computePassPeriod('2026-09-13')!;
            process.env.TZ = 'Asia/Seoul';
            const b = computePassPeriod('2026-09-13')!;
            expect(a.expiresDate).toBe(b.expiresDate);
            expect(a.expiresAt.toISOString()).toBe(b.expiresAt.toISOString());
        } finally {
            process.env.TZ = tz;
        }
    });

    it('일수를 바꿔도 보정 규칙은 같이 따라온다', () => {
        // 2026-09-01(화) + 6일 = 2026-09-07(월) → 수요일로
        const p = computePassPeriod('2026-09-01', 7)!;
        expect(p.expiresDate).toBe('2026-09-09');
        expect(p.shiftDays).toBe(2);
        expect(p.totalDays).toBe(9);
        expect(p.shifts.map((x) => x.reason)).toEqual(['휴무', '정기권을 적용하지 않는 날']);
    });

    it('형식이 틀린 시작일은 null', () => {
        expect(computePassPeriod('2026-9-1')).toBeNull();
        expect(computePassPeriod('')).toBeNull();
        expect(computePassPeriod('오늘')).toBeNull();
    });
});

describe('formatKstDate', () => {
    it('요일까지 붙인다', () => {
        expect(formatKstDate('2026-10-14')).toBe('10/14(수)');
        expect(formatKstDate('2026-10-12')).toBe('10/12(월)');
    });
    it('시각이 붙어 있어도 날짜만 읽는다 — 시간대 변환을 하지 않는다', () => {
        expect(formatKstDate('2026-10-14T23:59:59.999+09:00')).toBe('10/14(수)');
    });
});
