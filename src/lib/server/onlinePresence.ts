// "지금 앱을 열어둔 사람"을 추적한다.
//
// 알림 SSE(/api/sse/notifications)는 로그인한 유저가 어느 페이지에 있든 root layout에서
// 하나씩 여는 연결이라, 그 수명을 그대로 접속 여부로 쓴다. 별도 하트비트 폴링이 필요 없고
// 연결이 끊기면(탭 닫기/이동) 즉시 반영된다.
//
// 탭을 여러 개 띄우면 같은 유저가 여러 연결을 갖게 되므로 참조 수로 센다.
// 프로세스 메모리라 배포(블루/그린 전환)로 초기화되지만, 클라이언트가 5초 뒤 재연결하므로
// 잠깐 적게 세는 것 외에 영향은 없다.

function store(): Map<number, number> {
    if (!(globalThis as any).__onlineUsers) {
        (globalThis as any).__onlineUsers = new Map<number, number>();
    }
    return (globalThis as any).__onlineUsers;
}

export function addOnlineConnection(userId: number) {
    const m = store();
    m.set(userId, (m.get(userId) ?? 0) + 1);
}

export function removeOnlineConnection(userId: number) {
    const m = store();
    const next = (m.get(userId) ?? 0) - 1;
    if (next > 0) m.set(userId, next);
    else m.delete(userId);
}

export function getOnlineUserIds(): number[] {
    return [...store().keys()];
}
