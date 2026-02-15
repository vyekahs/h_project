import { createServer } from 'http';
import { handler } from './build/handler.js';

const PORT = process.env.PORT || 3000;

const server = createServer(handler);

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
