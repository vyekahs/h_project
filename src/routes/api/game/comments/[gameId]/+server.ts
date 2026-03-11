import { json } from '@sveltejs/kit';
import { CommentService } from '$lib/server/services/commentService';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const gameId = params.gameId;
	const beforeId = url.searchParams.get('before') ? Number(url.searchParams.get('before')) : undefined;
	const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);

	const result = await CommentService.getComments(gameId, beforeId, limit);
	return json(result);
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const { content } = await request.json();
	if (!content || typeof content !== 'string') {
		return json({ error: '댓글 내용이 필요합니다' }, { status: 400 });
	}

	try {
		const result = await CommentService.createComment(user.id, params.gameId, content);
		return json(result, { status: 201 });
	} catch (e: any) {
		const status = e.message.includes('잠시 후') ? 429 : 400;
		return json({ error: e.message }, { status });
	}
};
