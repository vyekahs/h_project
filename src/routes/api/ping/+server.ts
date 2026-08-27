import { json } from '@sveltejs/kit';

// 순수 네트워크 왕복 시간 측정용 — DB 조회 없이 즉시 응답한다.
// (hooks.server.ts에서 세션 검증도 스킵하도록 예외 처리되어 있음)
export function GET() {
	return json({ ok: true });
}
