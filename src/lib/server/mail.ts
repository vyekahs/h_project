import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            host: env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS,
            },
        });
    }
    return _transporter;
}

export async function sendMail(to: string, subject: string, text: string, html?: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.warn('SMTP credentials not configured. Email will not be sent.');
        return;
    }

    try {
        const transporter = getTransporter();
        const info = await transporter.sendMail({
            from: `"HonNol System" <${env.SMTP_USER}>`,
            to,
            subject,
            text,
            html,
        });
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}
