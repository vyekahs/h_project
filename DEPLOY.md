# 🏠 홈서버 배포 가이드

이 문서는 보드게임 동아리 현황판을 리눅스 홈서버에 배포하고, GitHub Actions를 통해 자동 업데이트를 설정하는 방법을 설명합니다.

## 📋 사전 준비

1.  **리눅스 홈서버**: 24시간 켜져 있는 리눅스 PC (Ubuntu, Debian 등 추천).
2.  **도메인**: 구입한 도메인 주소 (예: `myclub.com`). 무료 도메인(DuckDNS 등)도 가능하지만, 안정성을 위해 저렴한 도메인 구입을 권장합니다.
3.  **공유기 설정 권한**: 포트포워딩 설정을 위해 공유기 관리자 페이지에 접속할 수 있어야 합니다.

---

## 1단계: 홈서버 환경 설정

홈서버 터미널에서 다음을 설치하고 설정합니다.

### 1. Docker 및 Docker Compose 설치
```bash
# Docker 설치 (공식 스크립트 사용)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 명령어 사용)
sudo usermod -aG docker $USER
# (로그아웃 후 다시 로그인해야 적용됨)
```

### 2. SSH 키 생성 (GitHub Actions용)
서버에 접속할 때 비밀번호 대신 사용할 SSH 키 쌍을 만듭니다.
```bash
# 키 생성 (엔터만 계속 누르세요)
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions

# 공개키를 인증된 키 목록에 추가
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# 개인키 내용 확인 (이 내용을 나중에 GitHub에 등록합니다)
cat ~/.ssh/github_actions
# -----BEGIN OPENSSH PRIVATE KEY----- 로 시작하는 전체 내용을 복사해두세요.
```

---

## 2단계: 네트워크 및 도메인 설정

### 1. 포트포워딩
공유기 관리자 페이지(보통 `192.168.0.1` 등)에서 다음 포트를 홈서버의 내부 IP(예: `192.168.0.10`)로 포트포워딩 해줍니다.
*   **80** (HTTP) -> 홈서버 80
*   **443** (HTTPS) -> 홈서버 443
*   **22** (SSH) -> 홈서버 22 (보안을 위해 외부 포트는 2222 등으로 바꾸는 것도 좋습니다)

### 2. 도메인 연결 (DDNS)
구입한 도메인의 DNS 설정에서 **A 레코드**를 집의 **공인 IP**로 설정합니다.
*   집 IP가 자주 바뀐다면 공유기의 DDNS 기능을 사용하거나, `ddclient` 등을 서버에 설치해야 합니다.

---

## 3단계: GitHub 저장소 설정

### 1. 저장소 생성 및 코드 푸시
GitHub에 새 저장소(Repository)를 만들고, 작업한 코드를 올립니다.
```bash
# 로컬 컴퓨터에서
git remote add origin <당신의_GITHUB_저장소_주소>
git push -u origin main
```

### 2. Secrets 변수 등록
GitHub 저장소의 **Settings > Secrets and variables > Actions** 메뉴로 이동하여 **New repository secret**을 클릭하고 다음 변수들을 추가합니다.

| 이름 | 값 (예시) | 설명 |
| :--- | :--- | :--- |
| `HOST` | `myclub.com` 또는 공인 IP | 홈서버의 외부 주소 |
| `USERNAME` | `ubuntu` | 홈서버 리눅스 계정 아이디 |
| `KEY` | `-----BEGIN...` | 아까 확인한 SSH 개인키 전체 내용 |
| `PORT` | `22` | SSH 포트 번호 |
| `DOMAIN_NAME` | `myclub.com` | 사용할 도메인 주소 |
| `EMAIL` | `admin@myclub.com` | HTTPS 인증서 발급용 이메일 |

---

## 4단계: 서버에 초기 배포

자동 배포가 작동하려면 서버에 프로젝트 폴더가 한 번은 있어야 합니다.

```bash
# 홈서버에서
cd ~
git clone <당신의_GITHUB_저장소_주소> boardgame-club
cd boardgame-club

# .env 파일 생성 (GitHub Actions가 나중에 덮어쓰지만, 초기 실행을 위해)
echo "DOMAIN_NAME=myclub.com" > .env
echo "EMAIL=admin@myclub.com" >> .env

# 실행 테스트
docker compose up -d --build
```
브라우저로 도메인에 접속해 보세요. HTTPS가 적용된 페이지가 뜬다면 성공입니다! 🎉

---

## 5단계: 자동 배포 테스트

이제부터는 로컬 컴퓨터에서 코드를 수정하고 GitHub에 `push`만 하면 됩니다.
1. 로컬에서 코드 수정.
2. `git commit -am "Update feature"`
3. `git push`
4. GitHub 저장소의 **Actions** 탭에서 배포 진행 상황을 확인할 수 있습니다.
5. 배포가 완료되면(초록색 체크), 잠시 후 홈서버에도 자동으로 반영됩니다.

---

## ❓ 자주 묻는 질문 (FAQ)

### Q. 포트포워딩을 80/443이 아닌 다른 포트(예: 8989)로 했어요.
**1. SSH 포트가 8989인 경우:**
*   GitHub Secrets의 `PORT` 값을 `8989`로 설정하세요.

**2. 웹사이트 접속 포트가 8989인 경우:**
*   **방법 A (외부 8989 -> 내부 80 포트포워딩):**
    *   공유기 설정에서 외부포트 `8989`를 내부 IP의 `80`번 포트로 연결했다면, 별도 설정 없이 `http://myclub.com:8989`로 접속하면 됩니다.
*   **방법 B (외부 8989 -> 내부 8989 포트포워딩):**
    *   `docker-compose.yml` 파일을 수정해야 합니다.
    ```yaml
    caddy:
      ports:
        - "8989:80" # 80:80을 8989:80으로 변경
    ```
    *   이 경우 HTTPS(SSL) 자동 발급이 어려울 수 있으니, 가능하면 80/443 포트 사용을 권장합니다.
