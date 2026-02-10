import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendMail } from '$lib/server/mail';
import { env } from '$env/dynamic/private';
import { query } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    const { message } = await request.json();

    if (!message || message.trim() === '') {
        return json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // 1. Store in Database
    let feedbackId: number;
    try {
        const result = await query(
            `INSERT INTO feedback (user_id, message, status) 
             VALUES ($1, $2, 'pending') RETURNING id`,
            [user?.id || null, message]
        );
        feedbackId = result.rows[0].id;
    } catch (e) {
        console.error('Database error:', e);
        return json({ error: 'Database error' }, { status: 500 });
    }

    // 2. Send Email
    if (!env.SMTP_TO) {
        console.error('SMTP_TO not configured');
        // Even if email fails, we saved it in DB, so we can return success or partial success
        return json({ success: true, warning: 'Email configuration missing' });
    }

    try {
        const subject = `[HonNol Feedback] New Suggestion from ${user?.name || 'User'}`;
        const body = `
User: ${user?.name || 'Anonymous'}
Message:
----------------------------------------
${message}
----------------------------------------
        `;

        await sendMail(env.SMTP_TO, subject, body);
        
        // 3. Update Status to 'sent'
        await query(`UPDATE feedback SET status = 'sent', sent_at = NOW() WHERE id = $1`, [feedbackId]);
        
        return json({ success: true });
    } catch (error) {
        console.error('Feedback email failed:', error);
        
        // 3. Update Status to 'failed'
        try {
            await query(`UPDATE feedback SET status = 'failed' WHERE id = $1`, [feedbackId]);
        } catch (dbError) {
            console.error('Failed to update feedback status:', dbError);
        }

        // Return success because we saved it in DB
        return json({ success: true, warning: 'Email failed but saved to database' });
    }
};
