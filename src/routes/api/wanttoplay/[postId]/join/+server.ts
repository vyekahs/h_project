import { json } from '@sveltejs/kit';
import { verifyAttendeeSession } from '$lib/server/auth';
import { WantToPlayService } from '$lib/server/services/wantToPlayService';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	try {
		await WantToPlayService.joinPost(user.id, Number(params.postId));
		return json({ success: true });
	} catch (e: any) {
		return json({ error: e.message }, { status: 400 });
	}
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	try {
		const result = await WantToPlayService.leavePost(user.id, Number(params.postId));
		return json({ success: true, deleted: result.deleted });
	} catch (e: any) {
		return json({ error: e.message }, { status: 400 });
	}
};
