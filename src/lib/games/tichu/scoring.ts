import type { TichuPlayer, TichuRoundResult, TeamId, SeatIndex } from './types';
import { getCardPoints, getTeam, getPartnerSeat } from './constants';

/**
 * Calculate round scores after all players finish (or 1-2 detected).
 */
export function calculateRoundResult(
	players: TichuPlayer[],
	finishOrder: SeatIndex[],
	roundNumber: number
): TichuRoundResult {
	const oneTwo = detectOneTwo(finishOrder);

	let teamAScore: number;
	let teamBScore: number;

	if (oneTwo) {
		// 1-2: winning team gets 200, losing team gets 0
		teamAScore = oneTwo === 'A' ? 200 : 0;
		teamBScore = oneTwo === 'B' ? 200 : 0;
	} else {
		// Normal scoring
		const scores = calculateCardScores(players, finishOrder);
		teamAScore = scores.teamA;
		teamBScore = scores.teamB;
	}

	// Grand/Small Tichu bonuses
	const grandDecl: { seat: SeatIndex; success: boolean }[] = [];
	const smallDecl: { seat: SeatIndex; success: boolean }[] = [];

	for (const player of players) {
		if (player.grandTichu === true) {
			const success = player.finishOrder === 1;
			grandDecl.push({ seat: player.seat, success });
			const bonus = success ? 200 : -200;
			if (player.team === 'A') teamAScore += bonus;
			else teamBScore += bonus;
		}
		if (player.smallTichu) {
			const success = player.finishOrder === 1;
			smallDecl.push({ seat: player.seat, success });
			const bonus = success ? 100 : -100;
			if (player.team === 'A') teamAScore += bonus;
			else teamBScore += bonus;
		}
	}

	return {
		roundNumber,
		teamAScore,
		teamBScore,
		oneTwo,
		finishOrder,
		grandTichuDeclarations: grandDecl,
		smallTichuDeclarations: smallDecl
	};
}

/**
 * Detect 1-2: same team finishes 1st and 2nd
 */
export function detectOneTwo(finishOrder: SeatIndex[]): TeamId | null {
	if (finishOrder.length < 2) return null;
	const firstTeam = getTeam(finishOrder[0]);
	const secondTeam = getTeam(finishOrder[1]);
	if (firstTeam === secondTeam) return firstTeam;
	return null;
}

/**
 * Calculate card point scores (normal scoring, not 1-2).
 * - Last player gives remaining hand cards to the opposing team
 * - Last player gives won trick cards to 1st place finisher
 */
function calculateCardScores(
	players: TichuPlayer[],
	finishOrder: SeatIndex[]
): { teamA: number; teamB: number } {
	const firstSeat = finishOrder[0];
	const lastSeat = finishOrder[finishOrder.length - 1];

	let teamAPoints = 0;
	let teamBPoints = 0;

	for (const player of players) {
		let cards = [...player.wonCards];

		if (player.seat === lastSeat) {
			// Last player: hand cards go to opposing team
			const handPoints = player.hand.reduce((sum, c) => sum + getCardPoints(c), 0);
			if (player.team === 'A') teamBPoints += handPoints;
			else teamAPoints += handPoints;

			// Won trick cards go to 1st place
			const trickPoints = cards.reduce((sum, c) => sum + getCardPoints(c), 0);
			if (getTeam(firstSeat) === 'A') teamAPoints += trickPoints;
			else teamBPoints += trickPoints;
			continue;
		}

		// Normal: count own won cards
		const points = cards.reduce((sum, c) => sum + getCardPoints(c), 0);
		if (player.team === 'A') teamAPoints += points;
		else teamBPoints += points;
	}

	return { teamA: teamAPoints, teamB: teamBPoints };
}

/**
 * Check if a team has reached the target score (game over).
 */
export function checkGameOver(
	scoreA: number,
	scoreB: number,
	targetScore: number
): TeamId | null {
	if (scoreA >= targetScore || scoreB >= targetScore) {
		if (scoreA !== scoreB) {
			return scoreA > scoreB ? 'A' : 'B';
		}
	}
	return null;
}
