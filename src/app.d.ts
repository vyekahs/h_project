// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
            user?: {
                id: number;
                name: string;
                is_admin: boolean;
                can_manage_games: boolean;
                penalty_points: number;
                is_blacklisted: boolean;
                season_pass_expires_at?: Date | string | null;
                title?: {
                    id: number;
                    title_name: string;
                    description?: string;
                    is_equipped: boolean;
                };
            }
        }
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
