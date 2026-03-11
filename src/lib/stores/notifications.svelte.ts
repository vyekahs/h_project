interface ToastItem {
	id: number;
	title: string;
	body: string;
	url?: string;
}

let toasts = $state<ToastItem[]>([]);
let nextId = 0;

export function getToasts() {
	return toasts;
}

export function showToast(notification: { title: string; body: string; url?: string }) {
	const id = nextId++;
	toasts = [...toasts, { id, ...notification }];

	setTimeout(() => {
		dismissToast(id);
	}, 4000);
}

export function dismissToast(id: number) {
	toasts = toasts.filter(t => t.id !== id);
}
