interface ToastItem {
	id: number;
	title: string;
	body: string;
	url?: string;
}

let toasts = $state<ToastItem[]>([]);
let nextId = 0;
let lastShownKey = '';
let lastShownAt = 0;
let unreadCount = $state(0);
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function getToasts() {
	return toasts;
}

export function getUnreadCount() {
	return unreadCount;
}

export function setUnreadCount(n: number) {
	unreadCount = Math.max(0, n);
}

export function incrementUnread() {
	unreadCount++;
}

export function decrementUnread(by = 1) {
	unreadCount = Math.max(0, unreadCount - by);
}

// 알림 SSE 연결은 앱 세션 전체에서 딱 한 번만 연결한다.
// NotificationBell이 여러 페이지(레이아웃/홈/마이페이지)에 따로 마운트되기 때문에,
// 연결을 컴포넌트 마운트에 묶으면 페이지 이동마다 연결이 끊겼다 재연결되는 문제가 있었다.
export function initNotificationsSSE() {
	if (eventSource) return;
	connectSSE();
}

function connectSSE() {
	eventSource = new EventSource('/api/sse/notifications');

	eventSource.addEventListener('notification', (e) => {
		try {
			const data = JSON.parse(e.data);
			incrementUnread();
			showToast({ title: data.title, body: data.body, url: data.url });
		} catch {}
	});

	eventSource.addEventListener('error', () => {
		eventSource?.close();
		eventSource = null;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		reconnectTimer = setTimeout(connectSSE, 5000);
	});
}

export function showToast(notification: { title: string; body: string; url?: string }) {
	// 알림 컴포넌트가 여러 곳에 마운트되는 순간(라우트 전환 등)에 같은 이벤트가
	// 중복 수신될 수 있어, 같은 내용이 짧은 시간 안에 다시 오면 무시한다.
	const key = `${notification.title}::${notification.body}`;
	const now = Date.now();
	if (key === lastShownKey && now - lastShownAt < 1000) return;
	lastShownKey = key;
	lastShownAt = now;

	const id = nextId++;
	toasts = [...toasts, { id, ...notification }];

	setTimeout(() => {
		dismissToast(id);
	}, 4000);
}

export function dismissToast(id: number) {
	toasts = toasts.filter(t => t.id !== id);
}
