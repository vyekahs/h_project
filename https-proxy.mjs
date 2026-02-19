import https from 'https';
import http from 'http';
import fs from 'fs';

const options = {
    key: fs.readFileSync('./certs/key.pem'),
    cert: fs.readFileSync('./certs/cert.pem'),
};

https.createServer(options, (req, res) => {
    const proxyReq = http.request(
        { hostname: '127.0.0.1', port: 3000, path: req.url, method: req.method, headers: req.headers },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        }
    );
    req.pipe(proxyReq);
    proxyReq.on('error', () => { res.writeHead(502); res.end(); });
}).listen(8443, '0.0.0.0', () => {
    console.log('HTTPS proxy running on https://192.168.219.103:8443');
});
