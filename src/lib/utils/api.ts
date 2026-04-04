/**
 * Client-side API fetch wrapper with retry and error reporting.
 */
export async function apiFetch<T = any>(
    url: string,
    options: RequestInit,
    context?: string
): Promise<{ ok: true; data: T; status: number } | { ok: false; status: number | null }> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) {
                const data = await res.json();
                return { ok: true, data, status: res.status };
            }
            // 401/403은 재시도 의미 없음
            if (res.status === 401 || res.status === 403) {
                return { ok: false, status: res.status };
            }
            // 그 외 에러는 재시도
            if (attempt === 1) {
                reportError(context ?? url, `HTTP ${res.status}`, res.status);
            }
        } catch (e) {
            if (attempt === 1) {
                reportError(context ?? url, String(e), null);
            }
        }
    }
    return { ok: false, status: null };
}

function reportError(context: string, error: string, status: number | null) {
    console.error(`[apiFetch] ${context}:`, error);
    try {
        navigator.sendBeacon(
            '/api/client-log',
            JSON.stringify({ context, error, meta: { status, ua: navigator.userAgent } })
        );
    } catch {
        // beacon 실패는 무시
    }
}
