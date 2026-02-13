<script lang="ts">
	import { tick } from 'svelte';

	let { game } = $props<{ game: any }>();

	let message = $state('');
	let messagesEl: HTMLDivElement | undefined = $state();

	const emotes = ['👍', '👎', '😂', '😱', '🤔', '💪', '🔥', '💣'];

	const messageCount = $derived(game.chatMessages.length);
	$effect(() => {
		messageCount; // track changes
		tick().then(() => {
			if (messagesEl) {
				messagesEl.scrollTop = messagesEl.scrollHeight;
			}
		});
	});

	function send() {
		if (!message.trim()) return;
		game.sendMessage(message.trim());
		message = '';
	}

	function sendEmote(emote: string) {
		game.sendEmote(emote);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			send();
		}
	}

	function getPlayerName(seat: number): string {
		return game.gameState?.players[seat]?.name ?? `P${seat + 1}`;
	}
</script>

<div class="chat-panel">
	<div class="chat-header">
		<span>채팅</span>
		<button class="btn-close" onclick={() => game.showChat = false}>✕</button>
	</div>

	<div class="chat-messages" bind:this={messagesEl}>
		{#each game.chatMessages as msg}
			<div class="chat-msg" class:emote={msg.isEmote}>
				<span class="sender">{getPlayerName(msg.seat)}</span>
				{#if msg.isEmote}
					<span class="emote-text">{msg.message}</span>
				{:else}
					<span class="msg-text">{msg.message}</span>
				{/if}
			</div>
		{/each}
	</div>

	<div class="emote-bar">
		{#each emotes as e}
			<button class="emote-btn" onclick={() => sendEmote(e)}>{e}</button>
		{/each}
	</div>

	<div class="chat-input">
		<input
			type="text"
			placeholder="메시지..."
			bind:value={message}
			onkeydown={handleKeydown}
			maxlength="100"
		/>
		<button class="btn-send" onclick={send} disabled={!message.trim()}>전송</button>
	</div>
</div>

<style>
	.chat-panel {
		position: fixed;
		bottom: 0;
		right: 0;
		width: 280px;
		max-height: 360px;
		background: #1e293b;
		border-radius: 12px 0 0 0;
		display: flex;
		flex-direction: column;
		z-index: 800;
		box-shadow: -2px -2px 12px rgba(0,0,0,0.3);
	}
	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		border-bottom: 1px solid rgba(255,255,255,0.1);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.btn-close {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		opacity: 0.5;
		font-size: 1rem;
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 200px;
	}
	.chat-msg {
		font-size: 0.8rem;
	}
	.sender {
		font-weight: 600;
		margin-right: 4px;
		opacity: 0.7;
	}
	.msg-text {
		word-break: break-word;
	}
	.emote .emote-text {
		font-size: 1.2rem;
	}

	.emote-bar {
		display: flex;
		gap: 2px;
		padding: 4px 8px;
		border-top: 1px solid rgba(255,255,255,0.05);
		flex-wrap: wrap;
	}
	.emote-btn {
		background: none;
		border: none;
		font-size: 1.1rem;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
	}
	.emote-btn:hover { background: rgba(255,255,255,0.1); }

	.chat-input {
		display: flex;
		gap: 4px;
		padding: 6px 8px;
		border-top: 1px solid rgba(255,255,255,0.1);
	}
	.chat-input input {
		flex: 1;
		background: rgba(255,255,255,0.1);
		border: none;
		border-radius: 6px;
		padding: 6px 10px;
		color: white;
		font-size: 0.8rem;
		outline: none;
	}
	.btn-send {
		padding: 6px 12px;
		border-radius: 6px;
		border: none;
		background: #3b82f6;
		color: white;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.btn-send:disabled { opacity: 0.4; }
</style>
