
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const pool = new Pool({
    connectionString: 'postgres://user:password@localhost:5432/boardgameclub'
});

const API_URL = 'http://localhost:3000/api/ble/report';
const SCANNER_KEY = 'test-scanner-key'; 

const TEST_IRK = '00112233445566778899aabbccddeeff'; // 128 bit key
const TEST_USER_NAME = 'BLE_TEST_USER';
let testUserId;

function generateRPA(irkHex) {
    const key = Buffer.from(irkHex, 'hex');
    const prand = crypto.randomBytes(3); 
    
    const input = Buffer.alloc(16, 0);
    input[0] = prand[2];
    input[1] = prand[1];
    input[2] = prand[0];
    
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(false);
    const encrypted = cipher.update(input);
    
    const hash = Buffer.from([encrypted[2], encrypted[1], encrypted[0]]);
    
    const mac = [
        hash.toString('hex').substring(0,2),
        hash.toString('hex').substring(2,4),
        hash.toString('hex').substring(4,6),
        prand.toString('hex').substring(0,2),
        prand.toString('hex').substring(2,4),
        prand.toString('hex').substring(4,6)
    ].join(':').toUpperCase();

    return mac;
}

async function runTest() {
    try {
        console.log('--- 1. Setup Test User ---');
        const existing = await pool.query('SELECT id FROM attendees WHERE name = $1', [TEST_USER_NAME]);
        if (existing.rows.length > 0) {
            testUserId = existing.rows[0].id;
             await pool.query("UPDATE attendees SET status = 'left' WHERE id = $1", [testUserId]);
        } else {
            const res = await pool.query("INSERT INTO attendees (name, status) VALUES ($1, 'left') RETURNING id", [TEST_USER_NAME]);
            testUserId = res.rows[0].id;
        }

        await pool.query('DELETE FROM user_devices WHERE attendee_id = $1', [testUserId]);
        await pool.query('INSERT INTO user_devices (attendee_id, irk, name) VALUES ($1, $2, $3)', [testUserId, TEST_IRK, 'Test Device']);
        
        console.log(`User ${TEST_USER_NAME} (ID: ${testUserId}) ready with IRK.`);

        console.log('\n--- 2. Simulate SCAN (Check IN) ---');
        const rpa = generateRPA(TEST_IRK);
        console.log(`Generated RPA: ${rpa}`);
        
        const res1 = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': SCANNER_KEY },
            body: JSON.stringify({
                scanner_id: 'test_script',
                timestamp: Date.now(),
                devices: [{ mac: rpa, rssi: -50 }]
            })
        });
        console.log('API Response:', await res1.json());

        const status1 = await pool.query('SELECT status FROM attendees WHERE id = $1', [testUserId]);
        console.log(`Attendee Status (Should be 'present'): ${status1.rows[0].status}`);

        console.log('\n--- 3. Simulate Timeout (Check OUT) ---');
        await pool.query("UPDATE user_devices SET last_seen_at = NOW() - interval '15 minutes' WHERE attendee_id = $1", [testUserId]);
        console.log('Forced last_seen_at to 15 mins ago.');

        const res2 = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': SCANNER_KEY },
            body: JSON.stringify({
                scanner_id: 'test_script',
                timestamp: Date.now(),
                devices: [] 
            })
        });
        console.log('API Response (Trigger):', await res2.json());

         const status2 = await pool.query('SELECT status FROM attendees WHERE id = $1', [testUserId]);
         console.log(`Attendee Status (Should be 'left'): ${status2.rows[0].status}`);

    } catch (e) {
        console.error('Test Failed', e);
    } finally {
        await pool.end();
    }
}

runTest();
