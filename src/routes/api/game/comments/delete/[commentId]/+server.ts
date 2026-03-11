import { json } from '@sveltejs/kit';
import { CommentService } from '$lib/server/services/commentService';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const commentId = Number(params.commentId);
	if (!commentId || isNaN(commentId)) {
		return json({ error: '잘못된 요청입니다' }, { status: 400 });
	}

	try {
		await CommentService.deleteComment(commentId, user.id, user.isAdmin ?? false);
		return json({ success: true });
	} catch (e: any) {
		const status = e.message.includes('권한') ? 403 : 404;
		return json({ error: e.message }, { status });
	}
};
