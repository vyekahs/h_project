import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { handler } from './build/handler.js';
import pg from 'pg';

const PORT = process.env.PORT || 3000;

const server = createServer(handler);

const io = new SocketIOServer(server, {
	path: '/socket.io',
	cors: {
		origin: process.env.ORIGIN || 'http://localhost:5173',
		credentials: true
	},
	transports: ['websocket', 'polling'],
	pingTimeout: 30000,
	pingInterval: 10000
});

// Store io instance globally for SvelteKit server code to access
globalThis.__socketIO = io;

// Shared DB pool for socket auth
const authPool = new pg.Pool({
	connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub',
	max: 5
});

// Socket.IO auth middleware
io.use(async (socket, next) => {
	try {
		const cookies = socket.handshake.headers.cookie || '';
		const match = cookies.match(/user_session=([^;]+)/);
		if (!match) {
			return next(new Error('인증이 필요합니다'));
		}

		const token = match[1];
		const result = await authPool.query(`
			SELECT a.id, a.name, a.can_manage_games, a.is_admin
			FROM attendee_sessions s
			JOIN attendees a ON s.attendee_id = a.id
			WHERE s.session_token = $1 AND s.expires_at > NOW()
		`, [token]);

		if (result.rows.length === 0) {
			return next(new Error('세션이 만료되었습니다'));
		}

		socket.data.userId = result.rows[0].id;
		socket.data.userName = result.rows[0].name;
		next();
	} catch (err) {
		console.error('[Socket.IO Auth Error]', err);
		next(new Error('인증 오류'));
	}
});

io.on('connection', (socket) => {
	const userId = socket.data.userId;
	const userName = socket.data.userName;

	// Disconnect existing sockets for the same user (prevent duplicate connections)
	for (const [id, existingSocket] of io.sockets.sockets) {
		if (id !== socket.id && existingSocket.data.userId === userId) {
			existingSocket.emit('room:error', { message: '다른 탭에서 접속하여 연결이 해제되었습니다' });
			existingSocket.disconnect(true);
		}
	}

	console.log(`[Tichu] Connected: ${userName} (${userId})`);

	// Forward to SvelteKit's handler via global event system
	if (globalThis.__tichuHandler) {
		globalThis.__tichuHandler(io, socket, userId, userName);
	} else {
		socket.emit('room:error', { message: '서버 초기화 중입니다. 잠시 후 다시 시도해주세요.' });
	}
});

// Graceful shutdown
async function gracefulShutdown(signal) {
	console.log(`[Server] ${signal} received, shutting down...`);

	// Save all active games
	if (globalThis.__saveAllGames) {
		try {
			await globalThis.__saveAllGames();
			console.log('[Tichu] All active games saved before shutdown');
		} catch (e) {
			console.error('[Tichu] Error saving games:', e);
		}
	}

	io.close();
	await authPool.end();
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
