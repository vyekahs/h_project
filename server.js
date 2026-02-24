import { createServer } from 'http';
import { handler } from './build/handler.js';

const PORT = process.env.PORT || 3000;

const server = createServer(handler);

// Keep-alive: Caddy 기본 idle timeout(60s)보다 길게 설정하여
// 리버스 프록시가 먼저 커넥션을 닫도록 함 (race condition 방지)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Graceful shutdown
function gracefulShutdown(signal) {
	console.log(`[Server] ${signal} received, shutting down...`);
	server.close(() => {
		console.log('[Server] Closed');
		process.exit(0);
	});

	// Force exit after 5 seconds
	setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
	console.log(`[Server] Running on port ${PORT}`);
});
