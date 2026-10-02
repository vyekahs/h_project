import { version, dev } from '$app/environment';

/*
    예전에는 새 버전을 감지하면 location.reload()를 바로 불렀다. 게임 중엔
    isInGame()으로 막았지만, 그 외엔 사용자가 뭘 하고 있든(글 쓰는 중, 스크롤
    중) 조용히 새로고침됐다. 이제는 감지만 하고 — 새로고침은 하단 네비 쪽
    배너를 눌러야 일어난다. 사용자가 고를 수 있어야 한다.
*/
let updateAvailable = $state(false);
let initialized = false;

export function getUpdateAvailable() {
    return updateAvailable;
}

async function checkForUpdate() {
    if (updateAvailable) return;
    try {
        const res = await fetch('/_app/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.version && data.version !== version) {
            updateAvailable = true;
        }
    } catch {
        // 오프라인이거나 일시적 오류 — 다음 주기에 다시 시도한다
    }
}

/**
 * 레이아웃 마운트 시 한 번만 건다.
 * shouldCheck()이 false면(하단 네비가 안 보이는 동안 — 오락실 게임 중 등)
 * 주기 체크도 탭 복귀 체크도 건너뛴다. 어차피 네비가 없으면 알려줄 곳도 없다.
 */
export function initUpdateCheck(shouldCheck: () => boolean) {
    if (dev || initialized) return;
    initialized = true;

    const tick = () => {
        if (shouldCheck()) checkForUpdate();
    };
    tick();
    setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick();
    });
}

export function applyUpdate() {
    location.reload();
}
