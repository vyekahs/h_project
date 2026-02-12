import crypto from 'crypto';

// 일회용 코드 저장소 (메모리, 서버 재시작 시 초기화)
// code → { attendeeId, expiresAt }
const wifiCodes = new Map<string, { attendeeId: number; expiresAt: number }>();

const CODE_TTL_MS = 5 * 60 * 1000; // 5분 만료

/** 코드 생성 */
export function generateWifiCode(attendeeId: number): string {
    // 6자리 랜덤 코드 생성
    const code = crypto.randomBytes(3).toString('hex');

    // 만료된 코드 정리
    const now = Date.now();
    for (const [key, val] of wifiCodes) {
        if (val.expiresAt < now) wifiCodes.delete(key);
    }

    wifiCodes.set(code, {
        attendeeId,
        expiresAt: now + CODE_TTL_MS
    });

    return code;
}

/** 코드 검증 (wifi register API에서 사용) */
export function verifyWifiCode(code: string): { attendeeId: number } | null {
    const entry = wifiCodes.get(code);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        wifiCodes.delete(code);
        return null;
    }
    // 일회용: 사용 즉시 폐기
    wifiCodes.delete(code);
    return { attendeeId: entry.attendeeId };
}
