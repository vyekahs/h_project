import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import QRCode from 'qrcode';
import crypto from 'crypto';

export const load: PageServerLoad = async ({ url }) => {
    // 방에 붙여두고 계속 쓰는 상설 QR이라 페이지를 열 때마다 새로 만들지 않는다.
    // 이전에는 방문 1회마다 100년짜리 토큰이 한 줄씩 쌓였고, 그 토큰들이 전부
    // 계속 유효했다. 유효한 토큰이 있으면 재사용하고, 없을 때만 만든다.
    const existing = await db.execute(sql`
        SELECT token FROM qr_tokens
        WHERE expires_at > NOW()
        ORDER BY expires_at DESC
        LIMIT 1
    `);

    let token = (existing as any[])[0]?.token as string | undefined;

    if (!token) {
        token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
        await db.execute(sql`INSERT INTO qr_tokens (token, expires_at) VALUES (${token}, ${expiresAt.toISOString()})`);
    }

    // 접속한 도메인(url.origin) 기준으로 생성 — 여러 도메인을 동시에 서빙하므로 ORIGIN 고정값 사용 불가
    // /open 은 UA를 보고 크롬으로 넘겨주는 중간 페이지다(인앱 브라우저 회피).
    const checkinUrl = `${url.origin}/open/${token}`;

    const qrCode = await QRCode.toDataURL(checkinUrl, {
        width: 400,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });

    return {
        qrCode
    };
};
