import { json } from '@sveltejs/kit';
import { getSharedData } from '$lib/server/dataCache';
import { getOnlineUserIds } from '$lib/server/onlinePresence';

import type { RequestHandler } from './$types';

// 오락실에서 "지금 카페에 누가 있고, 앱에는 누가 접속해 있는지"를 보여주기 위한 요약.
// getSharedData()는 2초 캐시 + in-flight 공유라 홈과 같은 데이터를 추가 DB 부하 없이 재사용한다.
export const GET: RequestHandler = async ({ locals }) => {
    // 참석자 이름은 회원 정보라 로그인한 사용자에게만 내려준다.
    if (!locals.user) {
        return json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    try {
        const shared = await getSharedData();

        const present = shared.attendees ?? [];
        const checkedInIds = new Set(present.map((a: any) => a.id));

        // 홈(+page.svelte)의 "오늘 갈 예정" 병합 규칙과 동일하게:
        // 이미 체크인했거나 방문 계획을 낸 사람은 예약자 목록에서 제외한다.
        const plans = shared.dailyVisitPlans ?? [];
        const planIds = new Set(plans.map((p: any) => p.attendee_id));
        const scheduled = (shared.todayScheduledParticipants ?? []).filter(
            (p: any) => !checkedInIds.has(p.attendee_id) && !planIds.has(p.attendee_id)
        );
        const plannedCount =
            plans.filter((p: any) => !checkedInIds.has(p.attendee_id)).length + scheduled.length;

        // 카페에 있으면서 앱도 켜둔 사람은 양쪽에 중복으로 세지 않는다.
        // "카페 2 · 온라인 3"이 서로 겹치지 않는 5명을 뜻하도록 온라인에서 뺀다.
        // 자기 자신도 제외 — 배지를 보는 사람에게 본인이 집계되면 숫자가 부풀어 보인다.
        const onlineIds = getOnlineUserIds().filter(
            (id) => !checkedInIds.has(id) && id !== locals.user!.id
        );

        return json({
            isOpen: shared.isOpen,
            present: present.length,
            // 배지 설명용으로 앞 3명만 — 전체 명단은 홈에서 본다.
            presentNames: present.slice(0, 3).map((a: any) => a.name),
            planned: plannedCount,
            online: onlineIds.length,
        });
    } catch (e) {
        console.error('[API] presence failed:', e);
        return json({ error: 'Failed to fetch presence' }, { status: 500 });
    }
};
