<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = '한줄 댓글을 남겨보세요...',
		maxLength = 200,
		onsubmit,
		disabled = false,
		dark = false,
	}: {
		value?: string;
		placeholder?: string;
		maxLength?: number;
		onsubmit?: (content: string) => void;
		disabled?: boolean;
		dark?: boolean;
	} = $props();

	let textareaEl: HTMLTextAreaElement | undefined = $state();
	let dropdownEl: HTMLDivElement | undefined = $state();
	let showDropdown = $state(false);
	let suggestions: { id: number; name: string }[] = $state([]);
	let selectedIndex = $state(0);
	let mentionStartPos = $state(-1);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// Track confirmed mentions (selected from dropdown)
	interface ConfirmedMention { name: string; start: number; end: number; }
	let confirmedMentions: ConfirmedMention[] = $state([]);

	const highlightedHtml = $derived.by(() => {
		if (confirmedMentions.length === 0) return escapeHtml(value) + '\n';

		// Build HTML with only confirmed mentions highlighted
		let result = '';
		let lastIdx = 0;
		// Sort by start position
		const sorted = [...confirmedMentions].sort((a, b) => a.start - b.start);
		for (const m of sorted) {
			result += escapeHtml(value.slice(lastIdx, m.start));
			result += `<span class="mention-highlight">${escapeHtml(value.slice(m.start, m.end))}</span>`;
			lastIdx = m.end;
		}
		result += escapeHtml(value.slice(lastIdx));
		return result + '\n';
	});

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function handleInput() {
		if (!textareaEl) return;
		// Read directly from DOM — bind:value may not have synced yet
		const currentValue = textareaEl.value;
		const pos = textareaEl.selectionStart;
		const text = currentValue.slice(0, pos);

		// Validate confirmed mentions — remove any that were edited
		validateMentions(currentValue);

		// Find the last @ that might be a mention
		const atIdx = text.lastIndexOf('@');
		if (atIdx >= 0) {
			const afterAt = text.slice(atIdx + 1);
			// Check there's no space after @ (still typing the mention)
			if (!afterAt.includes(' ')) {
				mentionStartPos = atIdx;
				searchUsers(afterAt);
				return;
			}
		}
		closeDropdown();
	}

	function validateMentions(currentValue: string) {
		if (confirmedMentions.length === 0) return;
		confirmedMentions = confirmedMentions.filter(m => {
			// Check bounds
			if (m.start < 0 || m.end > currentValue.length) return false;
			// Check text still matches exactly
			const expected = `@${m.name}`;
			return currentValue.slice(m.start, m.end) === expected;
		});
	}

	function searchUsers(query: string) {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			try {
				// Guard: if dropdown was closed before fetch, skip
				if (mentionStartPos === -1) return;
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
				if (!res.ok || mentionStartPos === -1) return;
				const data = await res.json();
				suggestions = data.users ?? [];
				selectedIndex = 0;
				showDropdown = suggestions.length > 0;
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
		const mentionText = `@${u.name}`;
		const newValue = `${before}${mentionText} ${after}`;

		// Calculate how many chars were replaced
		const oldLen = currentValue.length;
		const newLen = newValue.length;
		const delta = newLen - oldLen;

		// Shift existing mentions that come after the insertion point
		confirmedMentions = confirmedMentions
			.filter(m => m.end <= mentionStartPos || m.start >= textareaEl!.selectionStart)
			.map(m => m.start >= textareaEl!.selectionStart
				? { ...m, start: m.start + delta, end: m.end + delta }
				: m
			);

		// Add new confirmed mention
		const mentionEnd = mentionStartPos + mentionText.length;
		confirmedMentions = [...confirmedMentions, { name: u.name, start: mentionStartPos, end: mentionEnd }];

		value = newValue;
		closeDropdown();

		// Focus back and set cursor
		const cursorPos = mentionEnd + 1; // after @name + space
		requestAnimationFrame(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(cursorPos, cursorPos);
		});
	}

	function scrollToSelected() {
		requestAnimationFrame(() => {
			const item = dropdownEl?.children[selectedIndex] as HTMLElement | undefined;
			item?.scrollIntoView({ block: 'nearest' });
		});
	}

	function closeDropdown() {
		if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; }
		showDropdown = false;
		suggestions = [];
		mentionStartPos = -1;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showDropdown) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
				scrollToSelected();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				scrollToSelected();
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

<div class="mention-input-wrapper" class:dark>
	{#if showDropdown && suggestions.length > 0}
		<div class="mention-dropdown" bind:this={dropdownEl}>
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
		<div class="textarea-wrapper">
			<div class="highlight-layer" aria-hidden="true">{@html highlightedHtml}</div>
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
		</div>
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
		max-height: 200px;
		overflow-y: auto;
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

	.textarea-wrapper {
		position: relative;
		flex: 1;
		min-height: 1.4em;
		max-height: 4.2em;
	}

	.highlight-layer {
		position: absolute;
		inset: 0;
		font-size: 0.9rem;
		line-height: 1.4;
		font-family: inherit;
		color: transparent;
		white-space: pre-wrap;
		word-break: break-word;
		overflow: hidden;
		pointer-events: none;
	}

	.highlight-layer :global(.mention-highlight) {
		color: var(--color-blue-bright, #1565c0);
		font-weight: 600;
		background: rgba(21, 101, 192, 0.1);
		border-radius: 3px;
		padding: 0 1px;
	}

	.comment-textarea {
		position: relative;
		width: 100%;
		border: none;
		background: transparent;
		resize: none;
		font-size: 0.9rem;
		line-height: 1.4;
		color: var(--text-primary);
		caret-color: var(--text-primary);
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

	/* Dark theme overrides */
	.dark .mention-dropdown {
		background: rgba(30,41,59,0.95);
		border-color: rgba(255,255,255,0.15);
		box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
	}
	.dark .mention-option { color: #e2e8f0; }
	.dark .mention-option:hover,
	.dark .mention-option.selected { background: rgba(255,255,255,0.1); }
	.dark .input-row {
		background: rgba(255,255,255,0.08);
		border-color: rgba(255,255,255,0.15);
	}
	.dark .highlight-layer :global(.mention-highlight) {
		color: #93c5fd;
		background: rgba(147, 197, 253, 0.15);
	}
	.dark .comment-textarea { color: #f1f5f9; caret-color: #f1f5f9; }
	.dark .comment-textarea::placeholder { color: rgba(255,255,255,0.3); }
	.dark .char-count { color: rgba(255,255,255,0.3); }
	.dark .char-count.near-limit { color: #fca5a5; }
	.dark .submit-btn {
		background: linear-gradient(135deg, #fbbf24, #d97706);
		color: #fff;
	}
</style>
