import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import QRCode from 'qrcode';
import crypto from 'crypto';

export const load: PageServerLoad = async ({ url }) => {
    // 1. Generate random token
    const token = crypto.randomBytes(32).toString('hex');

    // 2. Set expiration (100 years - effectively forever)
    const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);

    // 3. Save to DB
    await db.execute(sql`INSERT INTO qr_tokens (token, expires_at) VALUES (${token}, ${expiresAt.toISOString()})`);

    // 4. Generate QR Code URL
    // 접속한 도메인(url.origin) 기준으로 생성 — 여러 도메인을 동시에 서빙하므로 ORIGIN 고정값 사용 불가
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
