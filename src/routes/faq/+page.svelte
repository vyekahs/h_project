<svelte:head>
	<title>자주 묻는 질문 (FAQ) | 혼놀라운지</title>
	<meta name="description" content="혼놀라운지 이용에 관한 자주 묻는 질문과 답변. 회원가입, 게임 이용, 랭킹, 포인트, 카페 방문 등을 안내합니다." />
</svelte:head>

<div class="faq-page">
	<div class="container">
		<a href="/" class="back-link">← 홈으로</a>
		<div class="hero">
			<span class="hero-icon">💬</span>
			<h1>자주 묻는 질문</h1>
			<p class="subtitle">혼놀라운지 이용 안내</p>
		</div>

		<nav class="toc">
			<h2>카테고리</h2>
			<ul>
				<li><a href="#account">계정 및 회원가입</a></li>
				<li><a href="#games">온라인 게임 이용</a></li>
				<li><a href="#ranking">랭킹 및 점수</a></li>
				<li><a href="#cafe">카페 방문</a></li>
				<li><a href="#tech">기술 관련</a></li>
			</ul>
		</nav>

		<article>
			<section id="account">
				<h2>계정 및 회원가입</h2>

				<div class="faq-item">
					<h3>회원가입은 어떻게 하나요?</h3>
					<p>
						혼놀라운지 홈페이지에서 간편하게 회원가입할 수 있습니다.
						이메일 주소와 닉네임만 입력하면 바로 가입이 완료됩니다.
						가입 후에는 온라인 미니게임 기록 저장, 랭킹 참여, 포인트 적립 등의 기능을 이용할 수 있습니다.
					</p>
				</div>

				<!-- <div class="faq-item">
					<h3>비밀번호를 잊어버렸어요. 어떻게 하나요?</h3>
					<p>
						로그인 페이지에서 "비밀번호 찾기"를 클릭하면 가입 시 등록한 이메일로 비밀번호 재설정 링크가 발송됩니다.
						메일이 오지 않는 경우 스팸함을 확인해주세요.
						그래도 문제가 해결되지 않으면 카페에 방문하시거나 문의해 주시면 도움을 드리겠습니다.
					</p>
				</div> -->

				<!-- <div class="faq-item">
					<h3>닉네임을 변경할 수 있나요?</h3>
					<p>
						마이페이지에서 닉네임을 변경할 수 있습니다.
						다른 사용자와 중복되지 않는 닉네임이어야 하며,
						부적절한 닉네임은 관리자에 의해 변경될 수 있습니다.
					</p>
				</div> -->

				<!-- <div class="faq-item">
					<h3>회원 탈퇴는 어떻게 하나요?</h3>
					<p>
						마이페이지 설정에서 회원 탈퇴를 진행할 수 있습니다.
						탈퇴 시 게임 기록, 랭킹, 포인트 등 모든 데이터가 삭제되며 복구할 수 없으니 신중하게 결정해주세요.
					</p>
				</div> -->
			</section>

			<section id="games">
				<h2>온라인 게임 이용</h2>

				<div class="faq-item">
					<h3>어떤 게임을 할 수 있나요?</h3>
					<p>
						혼놀라운지 온라인 오락실에서는 다양한 종류의 게임을 제공하고 있습니다.
					</p>
					<ul>
						<li><strong>티츄</strong> — AI 파트너와 함께하는 4인 트릭 테이킹 카드 게임</li>
						<li><strong>스도쿠</strong> — 9×9 격자에 숫자를 채우는 클래식 논리 퍼즐</li>
						<li><strong>킬러 스도쿠</strong> — 스도쿠에 덧셈 규칙이 더해진 변형 퍼즐</li>
						<li><strong>언블록미</strong> — 블록을 밀어 탈출시키는 슬라이딩 퍼즐</li>
						<li><strong>워터소트</strong> — 색깔 물을 같은 색끼리 정렬하는 퍼즐</li>
						<li><strong>에너지 서킷</strong> — 파이프를 연결하여 전력을 공급하는 퍼즐</li>
						<li><strong>트레인 트랙</strong> — 선로를 배치하여 기차길을 완성하는 논리 퍼즐</li>
						<li><strong>2048</strong> — 타일을 합쳐 2048을 만드는 슬라이딩 퍼즐</li>
						<li><strong>트리플 타일</strong> — 같은 타일 3개를 모아 제거하는 매칭 퍼즐</li>
					</ul>
					<p>
						각 게임에 대한 자세한 규칙과 전략은 <a href="/guides">게임 가이드</a> 페이지에서 확인할 수 있습니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>게임은 무료인가요?</h3>
					<p>
						네, 모든 온라인 미니게임은 완전 무료입니다.
						회원가입 후 로그인하면 게임 기록이 저장되고 랭킹에 참여할 수 있습니다.
						비로그인 상태에서도 게임 자체는 플레이할 수 있지만, 기록 저장과 랭킹 기능은 이용할 수 없습니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>게임 중에 인터넷이 끊기면 어떻게 되나요?</h3>
					<p>
						대부분의 미니게임은 브라우저에서 독립적으로 동작하므로, 게임 중 인터넷이 일시적으로 끊겨도
						플레이에는 영향이 없습니다. 다만 게임 완료 후 기록을 서버에 저장할 때 인터넷 연결이 필요합니다.
						연결이 복구되면 기록 저장이 자동으로 시도됩니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>난이도는 어떻게 선택하나요?</h3>
					<p>
						대부분의 퍼즐 게임은 게임 시작 화면에서 난이도를 선택할 수 있습니다.
						보통 1단계(가장 쉬움)부터 5단계(가장 어려움)까지 제공되며,
						처음 플레이하는 분은 1~2단계부터 시작하여 점차 난이도를 올리는 것을 추천합니다.
						각 난이도별 특징은 게임 가이드에서 확인할 수 있습니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>게임마다 규칙을 어디서 볼 수 있나요?</h3>
					<p>
						각 게임의 시작 화면에서 튜토리얼이나 규칙 안내를 제공하고 있습니다.
						더 자세한 규칙, 전략, 팁은 <a href="/guides">게임 가이드</a> 페이지에서 확인할 수 있습니다.
						가이드에는 기본 규칙부터 고급 전략까지 상세하게 설명되어 있어 초보자와 숙련자 모두에게 도움이 됩니다.
					</p>
				</div>
			</section>

			<section id="ranking">
				<h2>랭킹 및 점수</h2>

				<div class="faq-item">
					<h3>랭킹은 어떻게 산정되나요?</h3>
					<p>
						각 게임마다 점수 산정 방식이 다릅니다.
						퍼즐 게임(스도쿠, 킬러 스도쿠, 언블록미, 에너지 서킷, 트레인 트랙 등)은 클리어 시간과 난이도를 기반으로 점수가 계산됩니다.
						빠르게 클리어할수록, 높은 난이도일수록 더 높은 점수를 받습니다.
						워터소트는 이동 횟수와 시간이, 2048은 합산 점수가, 티츄는 승리 시 점수차가 기준이 됩니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>랭킹은 얼마 동안 유지되나요?</h3>
					<p>
						랭킹은 월별로 관리됩니다. 매월 1일에 새로운 시즌이 시작되며,
						이전 달의 랭킹은 기록으로 보존됩니다.
						매달 새로운 랭킹에 도전하여 순위를 올려보세요.
					</p>
				</div>

				<div class="faq-item">
					<h3>같은 게임을 여러 번 플레이하면 점수가 어떻게 되나요?</h3>
					<p>
						같은 게임을 여러 번 플레이하면 가장 높은 점수가 랭킹에 반영됩니다.
						여러 번 도전하여 더 좋은 기록을 세워보세요.
						이전 기록보다 높은 점수를 달성하면 자동으로 갱신됩니다.
					</p>
				</div>

				<!-- <div class="faq-item">
					<h3>포인트는 어떻게 적립되나요?</h3>
					<p>
						게임을 클리어하거나 카페에 방문하면 포인트가 적립됩니다.
						게임 포인트는 클리어 점수에 비례하여 지급되며,
						방문 포인트는 카페 체크인 시 자동으로 적립됩니다.
						적립된 포인트는 마이페이지에서 확인할 수 있습니다.
					</p>
				</div> -->
			</section>

			<section id="cafe">
				<h2>카페 방문</h2>

				<div class="faq-item">
					<h3>혼자놀다가게 보드카페는 어디에 있나요?</h3>
					<p>
						혼자놀다가게는 실제 보드게임 카페입니다.
						서울 합정역에서 5분 거리에 있는 곳에 있습니다.
						주소: 서울특별시 마포구 양화로6길 57
						방문 전에 미리 확인하시면 편리합니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>예약은 필수인가요?</h3>
					<p>
						예약 없이 방문하셔도 됩니다. 다만 주말이나 공휴일에는 자리가 부족할 수 있으므로,
						확실한 이용을 원하시면 사전 예약을 추천합니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>혼자 가도 되나요?</h3>
					<p>
						물론입니다! "혼자놀다가게"라는 이름처럼, 혼자 방문해서 즐기기에도 좋은 공간입니다.
						물론 친구나 가족과 함께 방문하셔도 환영합니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>어떤 보드게임이 있나요?</h3>
					<p>
						수십 종의 보드게임을 보유하고 있으며, 게임 목록은 홈페이지의 "보드게임" 메뉴에서 검색할 수 있습니다.
						인원수, 난이도, 장르별로 필터링하여 원하는 게임을 쉽게 찾을 수 있습니다.
						게임 선택이 어려우시면 스태프에게 추천을 요청해주세요.
					</p>
				</div>
			</section>

			<section id="tech">
				<h2>기술 관련</h2>

				<div class="faq-item">
					<h3>어떤 기기에서 이용할 수 있나요?</h3>
					<p>
						혼놀라운지 웹사이트는 스마트폰, 태블릿, PC 등 모든 기기에서 이용할 수 있습니다.
						별도의 앱 설치 없이 웹 브라우저(Chrome, Safari, Edge 등)에서 바로 접속하면 됩니다.
						모바일 환경에 최적화되어 있어 스마트폰에서 편하게 게임을 즐길 수 있습니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>홈 화면에 추가하면 앱처럼 쓸 수 있나요?</h3>
					<p>
						네! 혼놀라운지는 PWA(Progressive Web App)를 지원합니다.
						스마트폰의 브라우저에서 "홈 화면에 추가"를 선택하면 앱 아이콘이 생기고,
						앱처럼 전체 화면으로 편하게 이용할 수 있습니다.
						별도의 앱스토어 설치가 필요 없어 간편합니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>게임이 제대로 동작하지 않아요.</h3>
					<p>
						게임이 정상적으로 동작하지 않는 경우 다음 사항을 확인해보세요.
					</p>
					<ol>
						<li>브라우저를 최신 버전으로 업데이트해주세요.</li>
						<li>브라우저의 캐시를 삭제한 후 다시 접속해보세요.</li>
						<li>다른 브라우저(Chrome, Safari 등)에서 시도해보세요.</li>
						<li>인터넷 연결 상태를 확인해주세요.</li>
					</ol>
					<p>
						위 방법으로도 해결되지 않으면 카페에 방문하시거나 문의해 주시면 도움을 드리겠습니다.
					</p>
				</div>

				<div class="faq-item">
					<h3>개인정보는 안전하게 보호되나요?</h3>
					<p>
						혼놀라운지는 이용자의 개인정보를 안전하게 보호하고 있습니다.
						수집하는 정보는 서비스 이용에 필요한 최소한의 정보(닉네임, 비밀번호)로 한정하며,
						비밀번호는 암호화되어 저장됩니다.
						자세한 내용은 <a href="/privacy">개인정보처리방침</a>을 참고해주세요.
					</p>
				</div>
			</section>
		</article>
	</div>
</div>

<style>
	.faq-page { min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 24px 16px 80px; }
	.container { max-width: 720px; margin: 0 auto; }
	.back-link { display: inline-block; color: var(--text-muted); text-decoration: none; font-size: 0.9rem; margin-bottom: 24px; transition: color 0.2s; }
	.back-link:hover { color: var(--text-primary); }
	.hero { text-align: center; margin-bottom: 32px; }
	.hero-icon { font-size: 3rem; display: block; margin-bottom: 12px; }
	.hero h1 { font-size: 2rem; font-weight: 800; margin: 0 0 8px; }
	.subtitle { font-size: 1.05rem; color: var(--text-secondary); margin: 0; }
	.toc { background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 16px; padding: 20px 24px; margin-bottom: 40px; }
	.toc h2 { font-size: 1rem; font-weight: 700; margin: 0 0 12px; color: var(--text-primary); }
	.toc ul { margin: 0; padding-left: 20px; }
	.toc li { margin-bottom: 6px; }
	.toc a { color: var(--color-blue); text-decoration: none; font-size: 0.9rem; }
	.toc a:hover { text-decoration: underline; }
	article section { margin-bottom: 40px; }
	article h2 { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0 0 16px; padding-top: 16px; border-top: 1px solid var(--border-light); }
	article section:first-child h2 { border-top: none; padding-top: 0; }
	.faq-item { background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; }
	.faq-item h3 { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 10px; }
	.faq-item p { font-size: 0.9rem; line-height: 1.7; color: var(--text-secondary); margin: 0 0 8px; }
	.faq-item p:last-child { margin-bottom: 0; }
	.faq-item ul, .faq-item ol { margin: 8px 0; padding-left: 20px; }
	.faq-item li { font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); margin-bottom: 4px; }
	.faq-item a { color: var(--color-blue); text-decoration: none; }
	.faq-item a:hover { text-decoration: underline; }
</style>
