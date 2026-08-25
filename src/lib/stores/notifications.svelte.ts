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

export function getToasts() {
	return toasts;
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
