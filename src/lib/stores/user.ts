import { writable } from 'svelte/store';

interface UserState {
    points: {
        total_points: number;
        daily_earned: number;
    } | null;
    currentTitle: {
        title_name: string;
        title_code: string;
    } | null;
    inventory: any[];
    name: string | null;
    loading: boolean;
}

const initialState: UserState = {
    points: null,
    currentTitle: null,
    inventory: [],
    name: null,
    loading: true
};

function createUserStore() {
    const { subscribe, set, update } = writable<UserState>(initialState);

    return {
        subscribe,
        set,
        update,
        refresh: async () => {
            update(s => ({ ...s, loading: true }));
            try {
                const res = await fetch('/api/user/me');
                if (res.ok) {
                    const data = await res.json();
                    update(s => ({
                        points: data.points,
                        currentTitle: data.title,
                        inventory: data.inventory,
                        name: data.name,
                        loading: false
                    }));
                } else {
                    update(s => ({ ...s, loading: false }));
                }
            } catch (e) {
                console.error('Failed to fetch user data', e);
                update(s => ({ ...s, loading: false }));
            }
        },
        usePoints: (amount: number) => {
            update(s => {
                if (!s.points) return s;
                return {
                    ...s,
                    points: {
                        ...s.points,
                        total_points: s.points.total_points - amount
                    }
                };
            });
        }
    };
}

export const user = createUserStore();
