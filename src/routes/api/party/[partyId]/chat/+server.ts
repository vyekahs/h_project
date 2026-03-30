import { json } from '@sveltejs/kit';
import { CommentService } from '$lib/server/services/commentService';
import { PartyService } from '$lib/server/services/partyService';
import { verifyAttendeeSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const partyId = Number(params.partyId);
	if (!partyId || isNaN(partyId)) return json({ error: '잘못된 요청입니다' }, { status: 400 });

	const isMember = await PartyService.isPartyMember(partyId, user.id);
	if (!isMember) return json({ error: '팟 멤버만 접근할 수 있습니다' }, { status: 403 });

	const beforeId = url.searchParams.get('before') ? Number(url.searchParams.get('before')) : undefined;
	const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);

	const result = await CommentService.getComments(`party_${partyId}`, beforeId, limit);
	return json(result);
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const partyId = Number(params.partyId);
	if (!partyId || isNaN(partyId)) return json({ error: '잘못된 요청입니다' }, { status: 400 });

	const isMember = await PartyService.isPartyMember(partyId, user.id);
	if (!isMember) return json({ error: '팟 멤버만 메시지를 보낼 수 있습니다' }, { status: 403 });

	const { content } = await request.json();
	if (!content || typeof content !== 'string') {
		return json({ error: '메시지 내용이 필요합니다' }, { status: 400 });
	}

	try {
		const result = await CommentService.createComment(user.id, `party_${partyId}`, content);
		return json(result, { status: 201 });
	} catch (e: any) {
		const status = e.message.includes('천천히') ? 429 : 400;
		return json({ error: e.message }, { status });
	}
};
