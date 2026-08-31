import { redirect } from '@sveltejs/kit';
import { PartyService } from '$lib/server/services/partyService';
import { CommentService } from '$lib/server/services/commentService';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params }) => {
	const { user } = await parent();
	if (!user) throw redirect(302, '/login');

	const partyId = Number(params.partyId);
	if (!partyId || isNaN(partyId)) throw redirect(302, '/mypage');

	const isMember = await PartyService.isPartyMember(partyId, user.id);
	if (!isMember) throw redirect(302, '/mypage');

	// 파티 정보 + 초기 메시지 — 둘 다 partyId에만 의존하고 서로 독립적이라 병렬로 조회
	const [partyResult, { comments, hasMore }] = await Promise.all([
		db.execute(sql`
			SELECT gp.id, gp.name,
				COALESCE(json_agg(json_build_object(
					'id', a.id, 'name', a.name
				) ORDER BY a.name) FILTER (WHERE a.id IS NOT NULL), '[]') as members
			FROM game_parties gp
			LEFT JOIN game_party_members gpm ON gp.id = gpm.party_id AND gpm.status = 'accepted'
			LEFT JOIN attendees a ON gpm.attendee_id = a.id
			WHERE gp.id = ${partyId}
			GROUP BY gp.id, gp.name
		`),
		CommentService.getComments(`party_${partyId}`, undefined, 30),
	]);

	const party = (partyResult as any[])[0];
	if (!party) throw redirect(302, '/mypage');

	return {
		party: {
			id: party.id,
			name: party.name,
			members: party.members,
		},
		initialComments: comments,
		hasMore,
	};
};
