import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// POST /api/user/verify
// Used by ESP32 Captive Portal to pre-validate credentials BEFORE adding to queue.
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        let { username, password, mode, confirmPassword } = await request.json();

        if (!username || !password) {
            return json({ error: '정보를 모두 입력해주세요.' }, { status: 400 });
        }

        if (password.length > 72) {
            return json({ error: '비밀번호는 72자를 초과할 수 없습니다.' }, { status: 400 });
        }

        const userRes = await db.execute(sql`SELECT id, password FROM attendees WHERE name = ${username}`);

        // Logic split by Mode
        if (mode === 'signup') {
            // Signup Mode: Username MUST NOT exist
            if (userRes.length > 0) {
                return json({ error: '이미 존재하는 이름입니다.' }, { status: 409 });
            }
            if (password !== confirmPassword) {
                return json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 400 });
            }
            // OK to proceed
            return json({ success: true });

        } else {
            // Login Mode: Username MUST exist & Password MUST match
            if (userRes.length === 0) {
                return json({ error: '존재하지 않는 사용자입니다.' }, { status: 404 });
            }

            const user = userRes[0] as any;
            if (!user.password) {
                return json({ error: '비밀번호가 설정되지 않은 계정입니다.' }, { status: 401 });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
            }

            // OK to proceed
            return json({ success: true });
        }

    } catch (e) {
        console.error('[API] User Verification Error', e);
        return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
    }
}
