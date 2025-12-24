import { query } from '$lib/server/db';
import type { PageServerLoad } from './$types';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async () => {
    // 1. Generate random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // 2. Set expiration (30 seconds)
    const expiresAt = new Date(Date.now() + 30 * 1000);

    // 3. Save to DB
    await query('INSERT INTO qr_tokens (token, expires_at) VALUES ($1, $2)', [token, expiresAt]);

    // 4. Generate QR Code URL
    // Use ORIGIN from env, fallback to localhost for dev
    const origin = env.ORIGIN || 'http://localhost:3000';
    const checkinUrl = `${origin}/checkin/${token}`;
    
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
