import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processScanResults } from '$lib/server/ble';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

const SCANNER_API_KEY = process.env.SCANNER_API_KEY;

// ESP32-C6: 더 긴 스캔, 큰 배치 가능
// ESP32-C3: 메모리 제한으로 보수적 설정
const SCANNER_CONFIG: Record<string, { scan_time: number; scan_rounds: number; batch_size: number; scan_interval: number }> = {
    // 펌웨어가 실제로 보내는 ID는 "scanner_main_hall"이다 (esp32-c3-scanner.ino의 SCANNER_ID).
    // 여기에 키가 없어서 그동안 조용히 DEFAULT_CONFIG(scan_time 10)로 폴백했고,
    // C6용으로 의도한 15초 대신 짧은 스캔을 받아 약한 신호 탐지율이 떨어졌다.
    scanner_main_hall: { scan_time: 15, scan_rounds: 3, batch_size: 50, scan_interval: 50 },  // C6
    scanner_main:  { scan_time: 15, scan_rounds: 3, batch_size: 50, scan_interval: 50 },  // C6 (레거시 ID)
    scanner_sub_hall: { scan_time: 10, scan_rounds: 3, batch_size: 30, scan_interval: 30 },  // C3
    scanner_entrance:  { scan_time: 10, scan_rounds: 3, batch_size: 30, scan_interval: 30 },  // C3
    scanner_2f:        { scan_time: 10, scan_rounds: 3, batch_size: 30, scan_interval: 30 },  // C3
};
const DEFAULT_CONFIG = { scan_time: 10, scan_rounds: 3, batch_size: 30, scan_interval: 30 };

export const POST: RequestHandler = async ({ request }) => {
    // 1. Auth Check
    const authHeader = request.headers.get('x-api-key');
    if (authHeader !== SCANNER_API_KEY) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const t0 = Date.now();
        // Parse JSON with control character sanitization (BLE device names may contain them)
        const rawText = await request.text();
        const t1 = Date.now();
        const sanitized = rawText.replace(/[\x00-\x1F\x7F]/g, '');
        const body = JSON.parse(sanitized);
        const { scanner_id, timestamp, devices, batch_index, total_batches } = body;
        const isLastBatch = !total_batches || (batch_index === total_batches - 1);

        console.log(`[BLE] ⏱️ request.text() took ${t1 - t0}ms (${rawText.length} bytes)`);
        console.log(`[BLE] Report from ${scanner_id}: ${devices?.length || 0} devices (batch ${(batch_index ?? 0) + 1}/${total_batches ?? 1})`);
        // Log MACs with RSSI to identify close devices
        console.log(`[BLE] Devices: ${devices?.map((d: any) => `${d.mac} (${d.rssi}dBm)`).join(', ')}`);

        // Support fallback ID
        const actualScannerId = scanner_id || 'unknown_scanner';

        if (!Array.isArray(devices)) {
            return json({ error: 'Invalid Format' }, { status: 400 });
        }

        // 2. Log Scanner Heartbeat (fire-and-forget, 응답 차단 방지)
        db.execute(sql`
            INSERT INTO scanners (id, last_seen_at, status)
            VALUES (${actualScannerId}, NOW(), 'active')
            ON CONFLICT (id) DO UPDATE
            SET last_seen_at = NOW(), status = 'active'
        `).catch(e => {
            console.error('Failed to update scanner heartbeat', e);
        });

        // 3. Quick Response Strategy: Respond immediately, process in background
        // This prevents ECONNRESET errors when processScanResults takes too long
        const config = SCANNER_CONFIG[actualScannerId] ?? DEFAULT_CONFIG;
        const responsePromise = json({ success: true, count: devices.length, config });

        // Process in background without blocking response
        processScanResults(actualScannerId, timestamp, devices, isLastBatch).catch(e => {
            console.error('[BLE] Background processing error:', e);
        });

        return responsePromise;
    } catch (e) {
        // Only log non-connection errors (avoid logging ECONNRESET spam)
        if (e && typeof e === 'object' && 'code' in e && e.code === 'ECONNRESET') {
            console.log('[API] Scanner disconnected early (ECONNRESET)');
        } else {
            console.error('[API] Scanner Report Error', e);
        }
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
