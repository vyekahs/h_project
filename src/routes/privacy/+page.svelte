<svelte:head>
	<title>개인정보처리방침 - 혼자라운지</title>
</svelte:head>

<div class="privacy-page">
	<div class="container">
		<a href="/" class="back-link">← 홈으로</a>
		<h1>개인정보처리방침</h1>
		<p class="updated">최종 수정일: 2025년 2월</p>

		<section>
			<h2>1. 수집하는 정보</h2>
			<p>혼놀라운지는 실명, 이메일, 전화번호 등 개인을 특정할 수 있는 정보를 수집하지 않습니다. 수집하는 정보는 다음과 같습니다.</p>
			<ul>
				<li><strong>회원가입 시:</strong> 닉네임(자유 입력), 비밀번호(암호화 저장)</li>
				<li><strong>서비스 이용 시:</strong> 게임 기록, 포인트 내역</li>
			</ul>
		</section>

		<section>
			<h2>2. 정보의 이용 목적</h2>
			<ul>
				<li>회원 식별 및 로그인 기능 제공</li>
				<li>게임 기록 저장 및 랭킹 서비스</li>
				<li>포인트 적립 및 보상 제공</li>
			</ul>
		</section>

		<section>
			<h2>3. 정보의 보유 및 삭제</h2>
			<p>계정 삭제 요청 시 관련 데이터를 즉시 삭제합니다.</p>
		</section>

		<section>
			<h2>4. 광고 서비스</h2>
			<p>혼놀라운지는 Google AdSense를 통해 광고를 게재합니다.</p>
			<ul>
				<li>Google은 쿠키를 사용하여 방문 기록을 기반으로 광고를 게재할 수 있습니다.</li>
				<li>Google의 광고 쿠키 사용에 대해서는 <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">Google 광고 정책</a>을 참고하세요.</li>
				<li>맞춤 광고를 원하지 않는 경우 <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">Google 광고 설정</a>에서 비활성화할 수 있습니다.</li>
			</ul>
		</section>

		<section>
			<h2>5. 쿠키 사용</h2>
			<p>로그인 세션 유지를 위해 쿠키를 사용합니다. 브라우저 설정에서 쿠키를 거부할 수 있으나, 로그인 기능이 제한될 수 있습니다.</p>
		</section>

		<section>
			<h2>6. 문의</h2>
			<p>관련 문의사항은 혼놀라운지 관리자에게 문의해 주세요.</p>
		</section>
	</div>
</div>

<style>
	.privacy-page {
		min-height: 100vh;
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
		color: var(--border-light);
		padding: 24px 16px 60px;
	}
	.container {
		max-width: 720px;
		margin: 0 auto;
	}
	.back-link {
		display: inline-block;
		color: var(--color-slate);
		text-decoration: none;
		font-size: 0.9rem;
		margin-bottom: 24px;
		transition: color 0.2s;
	}
	.back-link:hover { color: var(--border-light); }
	h1 {
		font-size: 1.8rem;
		font-weight: 800;
		color: var(--bg-secondary);
		margin: 0 0 8px;
	}
	.updated {
		font-size: 0.85rem;
		color: var(--color-slate-dark);
		margin: 0 0 32px;
	}
	section {
		margin-bottom: 28px;
	}
	h2 {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--bg-secondary);
		margin: 0 0 12px;
	}
	p {
		font-size: 0.95rem;
		line-height: 1.7;
		color: var(--border-default);
		margin: 0 0 12px;
	}
	ul {
		margin: 0 0 12px;
		padding-left: 20px;
	}
	li {
		font-size: 0.95rem;
		line-height: 1.7;
		color: var(--border-default);
		margin-bottom: 4px;
	}
	a {
		color: var(--color-blue);
	}
	a:hover { color: var(--color-blue); }
</style>
