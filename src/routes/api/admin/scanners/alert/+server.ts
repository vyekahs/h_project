import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAdminSession } from '$lib/server/auth';
import { setScannerAlertEnabled } from '$lib/server/scannerHealth';

/**
 * 스캐너별 무응답 알림 on/off.
 *
 * 예비 스캐너를 치워두거나 등록용 단말을 꺼두는 일이 실제로 있다. 그때마다
 * 알림이 오면 알림 자체를 무시하게 되므로, 어느 기기를 감시할지는 사람이 정한다.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const adminToken = cookies.get('admin_session');
	if (!adminToken || !(await verifyAdminSession(adminToken))) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { id, enabled } = (body ?? {}) as { id?: unknown; enabled?: unknown };
	if (typeof id !== 'string' || id.length === 0 || typeof enabled !== 'boolean') {
		return json({ error: 'id(string)와 enabled(boolean)가 필요합니다' }, { status: 400 });
	}

	const ok = await setScannerAlertEnabled(id, enabled);
	if (!ok) {
		// 없는 스캐너를 성공으로 돌려주면 화면의 토글만 바뀌고 실제로는 아무 일도
		// 일어나지 않는다 — 알림이 꺼진 줄 알고 있다가 계속 받게 된다.
		return json({ error: '해당 스캐너를 찾을 수 없습니다' }, { status: 404 });
	}

	return json({ success: true, id, enabled });
};
