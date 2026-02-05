
import crypto from 'crypto';

const resolveRPA = (mac, irkHex) => {
    try {
        const macClean = mac.replace(/:/g, '');
        const macBytes = Buffer.from(macClean, 'hex');
        const irk = Buffer.from(irkHex, 'hex');

        console.log(`Testing MAC: ${mac}, IRK: ${irkHex}`);

        if (macBytes.length !== 6) {
             console.log("Invalid MAC length");
             return false;
        }

        const candidates = [
            { prand: macBytes.subarray(3, 6), hash: macBytes.subarray(0, 3), name: "Standard [H][P]" }, 
            { prand: macBytes.subarray(0, 3), hash: macBytes.subarray(3, 6), name: "Swapped [P][H]" }  
        ];

        for (const { prand, hash, name } of candidates) {
            const isRPA = (prand[0] & 0xc0) === 0x40 || (prand[2] & 0xc0) === 0x40;
            console.log(`Candidate ${name}: RPA Check (01xx) = ${isRPA}`);
            
            if (isRPA) {
                if (verify(hash, prand, irk, false)) {
                    console.log(`MATCH FOUND! Config: ${name}, Key: Big Endian`);
                    return true;
                }
                if (verify(hash, prand, irk, true)) {
                    console.log(`MATCH FOUND! Config: ${name}, Key: Little Endian`);
                    return true;
                }
            }
        }
        console.log("No match found.");
        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
};

function verify(hash, prand, irk, reverse) {
    const plaintext = Buffer.alloc(16);
    const key = reverse ? Buffer.from(irk).reverse() : irk;
    
    if (reverse) {
        plaintext[0] = prand[2];
        plaintext[1] = prand[1];
        plaintext[2] = prand[0];
    } else {
        plaintext[13] = prand[0];
        plaintext[14] = prand[1];
        plaintext[15] = prand[2];
    }

    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    if (reverse) {
        return encrypted[0] === hash[2] && encrypted[1] === hash[1] && encrypted[2] === hash[0];
    } else {
        return encrypted[13] === hash[0] && encrypted[14] === hash[1] && encrypted[15] === hash[2];
    }
}

// Test User Data
const mac = "78:46:D4:9F:50:20";
const irk = "3ef47c22b47fca3cb451d67733b05826";

resolveRPA(mac, irk);
