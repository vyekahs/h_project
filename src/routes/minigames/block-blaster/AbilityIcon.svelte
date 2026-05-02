<script lang="ts">
	let { id, size = 24 } = $props<{ id: string; size?: number }>();
</script>

{#if id === "clear-row"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="m18 8 4 4-4 4" />
		  <path d="M2 12h20" />
		  <path d="m6 8-4 4 4 4" />
	</svg>
{:else if id === "clear-col"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M12 2v20" />
		  <path d="m8 18 4 4 4-4" />
		  <path d="m8 6 4-4 4 4" />
	</svg>
{:else if id === "bomb-3x3"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="11" cy="13" r="9" />
		  <path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95" />
		  <path d="m22 2-1.5 1.5" />
	</svg>
{:else if id === "clear-color"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
		  <path d="m14 7 3 3" />
		  <path d="M5 6v4" />
		  <path d="M19 14v4" />
		  <path d="M10 2v2" />
		  <path d="M7 8H3" />
		  <path d="M21 16h-4" />
		  <path d="M11 3H9" />
	</svg>
{:else if id === "single-cell"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M5 3a2 2 0 0 0-2 2" />
		  <path d="M19 3a2 2 0 0 1 2 2" />
		  <path d="M21 19a2 2 0 0 1-2 2" />
		  <path d="M5 21a2 2 0 0 1-2-2" />
		  <path d="M9 3h1" />
		  <path d="M9 21h1" />
		  <path d="M14 3h1" />
		  <path d="M14 21h1" />
		  <path d="M3 9v1" />
		  <path d="M21 9v1" />
		  <path d="M3 14v1" />
		  <path d="M21 14v1" />
	</svg>
{:else if id === "swap-block"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M14 4a1 1 0 0 1 1-1" />
		  <path d="M15 10a1 1 0 0 1-1-1" />
		  <path d="M21 4a1 1 0 0 0-1-1" />
		  <path d="M21 9a1 1 0 0 1-1 1" />
		  <path d="m3 7 3 3 3-3" />
		  <path d="M6 10V5a2 2 0 0 1 2-2h2" />
		  <rect x="3" y="14" width="7" height="7" rx="1" />
	</svg>
{:else if id === "rotate-block"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
		  <path d="M21 3v5h-5" />
	</svg>
{:else if id === "undo"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M9 14 4 9l5-5" />
		  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
	</svg>
{:else if id === "peek-next"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
		  <circle cx="12" cy="12" r="3" />
	</svg>
{:else if id === "revive"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
		  <path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
	</svg>
{:else if id === "extra-slot"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M12 22V12" />
		  <path d="M16 17h6" />
		  <path d="M19 14v6" />
		  <path d="M21 10.535V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955" />
		  <path d="M3.29 7 12 12l8.71-5" />
		  <path d="m7.5 4.27 8.997 5.148" />
	</svg>
{:else if id === "info"}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="12" cy="12" r="10" />
		  <path d="M12 16v-4" />
		  <path d="M12 8h.01" />
	</svg>
{:else}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="12" cy="12" r="9" stroke-opacity="0.5" />
		<path d="M9 12h6M12 9v6" stroke-opacity="0.5" />
	</svg>
{/if}
