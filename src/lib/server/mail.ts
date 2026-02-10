import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
});

/**
 * Sends an email using the configured transporter.
 * @param to Recipient email address
 * @param subject Subject line
 * @param text Plain text body
 * @param html HTML body (optional)
 */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.warn('SMTP credentials not configured. Email will not be sent.');
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: `"HonNol System" <${env.SMTP_USER}>`, // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}
