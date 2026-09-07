import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateWifiCode } from '$lib/server/wifi-codes';

/**
 * WiFi 기기 등록용 일회용 코드 발급.
 *
 * 반드시 로그인한 본인에게만, 본인 계정으로 발급한다.
 *
 * 예전에는 인증 없이 body의 attendeeId를 그대로 믿었다. 그 코드는
 * /api/devices/register/wifi에서 "이 MAC은 이 회원의 기기"로 등록하는 데 쓰이고,
 * 등록된 MAC이 스캐너에 잡히면 그 회원이 자동 체크인된다. 즉 누구나 남의
 * attendeeId로 코드를 받아 자기 기기를 남의 계정에 붙일 수 있었고, 그러면 그 사람이
 * 매장에 있는 것처럼 출입 기록이 만들어졌다.
 */
export const POST: RequestHandler = async ({ locals }) => {
    const user = locals.user;
    if (!user) {
        return json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    try {
        // 클라이언트가 보낸 attendeeId는 신뢰하지 않고 세션의 본인 ID만 쓴다.
        const code = generateWifiCode(user.id);

        console.log(`[WiFi] Code generated for attendee ${user.id}`);
        return json({ success: true, code });
    } catch (e: any) {
        console.error('WiFi Code Generation Error:', e);
        return json({ error: 'Server Error' }, { status: 500 });
    }
};
