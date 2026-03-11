<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = '한줄 댓글을 남겨보세요...',
		maxLength = 200,
		onsubmit,
		disabled = false,
	}: {
		value?: string;
		placeholder?: string;
		maxLength?: number;
		onsubmit?: (content: string) => void;
		disabled?: boolean;
	} = $props();

	let textareaEl: HTMLTextAreaElement | undefined = $state();
	let showDropdown = $state(false);
	let suggestions: { id: number; name: string }[] = $state([]);
	let selectedIndex = $state(0);
	let mentionQuery = $state('');
	let mentionStartPos = $state(-1);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleInput() {
		if (!textareaEl) return;
		// Read directly from DOM — bind:value may not have synced yet
		const currentValue = textareaEl.value;
		const pos = textareaEl.selectionStart;
		const text = currentValue.slice(0, pos);

		// Find the last @ that might be a mention
		const atIdx = text.lastIndexOf('@');
		if (atIdx >= 0) {
			const afterAt = text.slice(atIdx + 1);
			// Check there's no space after @ (still typing the mention)
			if (!afterAt.includes(' ')) {
				mentionQuery = afterAt;
				mentionStartPos = atIdx;
				searchUsers(afterAt);
				return;
			}
		}
		closeDropdown();
	}

	function searchUsers(query: string) {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
				if (res.ok) {
					const data = await res.json();
					suggestions = data.users ?? [];
					selectedIndex = 0;
					showDropdown = suggestions.length > 0;
				}
			} catch {
				closeDropdown();
			}
		}, 300);
	}

	function selectSuggestion(u: { id: number; name: string }) {
		if (!textareaEl) return;
		const currentValue = textareaEl.value;
		const before = currentValue.slice(0, mentionStartPos);
		const after = currentValue.slice(textareaEl.selectionStart);
		value = `${before}@${u.name} ${after}`;
		closeDropdown();

		// Focus back and set cursor
		const cursorPos = mentionStartPos + u.name.length + 2; // @name + space
		requestAnimationFrame(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(cursorPos, cursorPos);
		});
	}

	function closeDropdown() {
		showDropdown = false;
		suggestions = [];
		mentionQuery = '';
		mentionStartPos = -1;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showDropdown) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
			} else if (e.key === 'Enter' && suggestions[selectedIndex]) {
				e.preventDefault();
				selectSuggestion(suggestions[selectedIndex]);
			} else if (e.key === 'Escape') {
				closeDropdown();
			}
			return;
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submitComment();
		}
	}

	function submitComment() {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onsubmit?.(trimmed);
	}
</script>

<div class="mention-input-wrapper">
	{#if showDropdown && suggestions.length > 0}
		<div class="mention-dropdown">
			{#each suggestions as user, i}
				<button
					class="mention-option"
					class:selected={i === selectedIndex}
					onclick={() => selectSuggestion(user)}
					type="button"
				>
					@{user.name}
				</button>
			{/each}
		</div>
	{/if}

	<div class="input-row">
		<textarea
			bind:this={textareaEl}
			bind:value
			{placeholder}
			maxlength={maxLength}
			rows="1"
			{disabled}
			oninput={handleInput}
			onkeydown={handleKeydown}
			class="comment-textarea"
		></textarea>
		<span class="char-count" class:near-limit={value.length > maxLength * 0.8}>
			{value.length}/{maxLength}
		</span>
		<button
			class="submit-btn"
			onclick={submitComment}
			disabled={disabled || !value.trim()}
			type="button"
		>
			등록
		</button>
	</div>
</div>

<style>
	.mention-input-wrapper {
		position: relative;
		width: 100%;
	}

	.mention-dropdown {
		position: absolute;
		bottom: 100%;
		left: 0;
		right: 0;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.6);
		border-radius: 12px;
		margin-bottom: 4px;
		box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
		overflow: hidden;
		z-index: 10;
	}

	.mention-option {
		display: block;
		width: 100%;
		padding: 0.6rem 1rem;
		background: transparent;
		border: none;
		text-align: left;
		font-size: 0.9rem;
		color: var(--text-primary);
		cursor: pointer;
		transition: background 0.15s;
	}

	.mention-option:hover,
	.mention-option.selected {
		background: rgba(0, 0, 0, 0.05);
	}

	.input-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.6);
		border-radius: 16px;
		padding: 0.5rem 0.6rem 0.5rem 1rem;
	}

	.comment-textarea {
		flex: 1;
		border: none;
		background: transparent;
		resize: none;
		font-size: 0.9rem;
		line-height: 1.4;
		color: var(--text-primary);
		font-family: inherit;
		outline: none;
		min-height: 1.4em;
		max-height: 4.2em;
		overflow-y: auto;
	}

	.comment-textarea::placeholder {
		color: var(--text-muted);
	}

	.char-count {
		font-size: 0.7rem;
		color: var(--text-muted);
		white-space: nowrap;
		flex-shrink: 0;
		align-self: flex-end;
		margin-bottom: 2px;
	}

	.char-count.near-limit {
		color: var(--color-red-dark, #c62828);
	}

	.submit-btn {
		background: linear-gradient(135deg, var(--bg-dark, #1a1a1a) 0%, #111 100%);
		color: var(--bg-primary, #fff);
		border: none;
		padding: 0.45rem 0.9rem;
		border-radius: 10px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.2s;
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.submit-btn:not(:disabled):active {
		transform: scale(0.96);
	}
</style>
