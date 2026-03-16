<svelte:head>
	<title>티츄 완벽 가이드 - 규칙, 전략, 플레이 방법 | 혼자놀다가게</title>
	<meta name="description" content="티츄(Tichu) 카드 게임의 규칙, 카드 조합, 특수 카드, 티츄 선언, 점수 계산법, 초보자 전략까지 상세하게 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>

		<div class="hero">
			<span class="hero-icon">🃏</span>
			<h1>티츄 완벽 가이드</h1>
			<p class="subtitle">2:2 팀 대전 카드 게임의 모든 것</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">티츄란?</a></li>
				<li><a href="#setup">게임 구성</a></li>
				<li><a href="#goal">게임 목표</a></li>
				<li><a href="#combinations">카드 조합</a></li>
				<li><a href="#special">특수 카드</a></li>
				<li><a href="#tichu">티츄 선언</a></li>
				<li><a href="#scoring">점수 계산</a></li>
				<li><a href="#exchange">카드 교환</a></li>
				<li><a href="#tips">초보자 전략 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>티츄란?</h2>
				<p>
					티츄(Tichu)는 스위스의 게임 디자이너 우르스 호스테틀러(Urs Hostettler)가 1991년에 만든 4인 팀 카드 게임입니다.
					중국 전통 카드 게임에서 영감을 받아 만들어졌으며, 세계적으로 가장 인기 있는 트릭 테이킹(trick-taking) 카드 게임 중 하나로 자리잡았습니다.
				</p>
				<p>
					게임은 4명이 2:2 팀으로 나뉘어 진행합니다. 마주보는 두 사람이 한 팀이 되며,
					각 팀은 협력하여 상대 팀보다 먼저 카드를 모두 내는 것을 목표로 합니다.
					단순히 카드를 빨리 내는 것뿐만 아니라, 파트너와의 호흡, 티츄 선언의 타이밍, 특수 카드의 활용이 승패를 좌우합니다.
				</p>
				<p>
					혼자놀다가게에서는 AI 파트너와 함께 플레이할 수 있어, 혼자서도 티츄의 전략적 재미를 충분히 즐길 수 있습니다.
				</p>
			</section>

			<section id="setup">
				<h2>게임 구성</h2>
				<h3>카드 덱</h3>
				<p>
					티츄는 총 56장의 카드로 진행됩니다. 일반 카드 52장과 특수 카드 4장으로 구성됩니다.
				</p>
				<ul>
					<li><strong>일반 카드 52장</strong>: 4개 문양(옥, 검, 탑, 별) × 13장(2~에이스). 숫자가 클수록 강합니다.</li>
					<li><strong>특수 카드 4장</strong>: 참새(1), 피닉스, 드래곤, 개. 각각 고유한 능력을 가지고 있습니다.</li>
				</ul>

				<h3>플레이어와 팀</h3>
				<p>
					4명의 플레이어가 참여하며, 마주보는 두 사람이 한 팀입니다.
					혼자놀다가게에서는 플레이어(아래)와 AI 파트너(위)가 한 팀, 양옆의 AI가 상대 팀이 됩니다.
				</p>

				<h3>카드 배분</h3>
				<p>
					게임 시작 시 각 플레이어에게 8장씩 배분한 뒤, 그랜드 티츄 선언 기회가 주어집니다.
					이후 나머지 6장이 추가 배분되어 총 14장을 들고 게임을 시작합니다.
				</p>
			</section>

			<section id="goal">
				<h2>게임 목표</h2>
				<p>
					각 라운드에서 손에 든 카드를 가장 먼저 모두 내려놓는 것이 목표입니다.
					가장 먼저 카드를 다 내는 플레이어가 1등, 그다음이 2등이 됩니다.
				</p>
				<div class="info-box">
					<strong>원투 피니시</strong>: 같은 팀 두 명이 1등과 2등을 모두 차지하면 200점을 획득합니다.
					이 경우 카드 점수는 계산하지 않습니다.
				</div>
				<p>
					라운드가 종료되면 양 팀의 점수를 합산합니다. 먼저 1,000점에 도달하는 팀이 승리합니다.
				</p>
			</section>

			<section id="combinations">
				<h2>카드 조합</h2>
				<p>
					티츄에서는 다양한 카드 조합을 낼 수 있습니다. 한 트릭에서는 첫 번째 플레이어가 낸 조합과 같은 종류의 조합만 낼 수 있으며, 반드시 더 높은 값이어야 합니다.
				</p>

				<h3>싱글 (Single)</h3>
				<p>카드 1장을 내는 가장 기본적인 플레이입니다. 숫자가 높은 카드가 이깁니다. 카드 서열은 2가 가장 낮고 에이스가 가장 높습니다.</p>

				<h3>페어 (Pair)</h3>
				<p>같은 숫자 카드 2장의 조합입니다. 예를 들어 7 두 장, 잭 두 장 등을 낼 수 있습니다. 더 높은 숫자의 페어로만 이길 수 있습니다.</p>

				<h3>연속 페어 (Stairs)</h3>
				<p>
					연속된 숫자의 페어가 이어진 조합입니다. 예를 들어 3-3-4-4-5-5처럼 연속된 3개 이상의 페어로 구성됩니다.
					상대의 연속 페어를 이기려면 같은 개수의 연속 페어이면서 시작 숫자가 더 높아야 합니다.
				</p>

				<h3>트리플 (Triple)</h3>
				<p>같은 숫자 카드 3장의 조합입니다. 페어와 마찬가지로 더 높은 숫자의 트리플로 이깁니다.</p>

				<h3>스트레이트 (Straight)</h3>
				<p>
					5장 이상의 연속된 숫자 카드입니다. 예를 들어 3-4-5-6-7이나 8-9-10-J-Q-K-A 등이 가능합니다.
					같은 장수의 스트레이트이면서 시작(또는 끝) 숫자가 더 높은 스트레이트만 이길 수 있습니다.
					2는 스트레이트에 포함될 수 없습니다.
				</p>

				<h3>풀하우스 (Full House)</h3>
				<p>
					트리플 1세트와 페어 1세트의 조합입니다(총 5장). 예를 들어 7-7-7-J-J처럼 구성됩니다.
					풀하우스의 강약은 트리플 부분의 숫자로 결정됩니다.
				</p>

				<h3>봄 (Bomb)</h3>
				<p>
					티츄의 핵심 메카닉 중 하나입니다. 봄에는 두 종류가 있습니다:
				</p>
				<ul>
					<li><strong>4장 봄</strong>: 같은 숫자 카드 4장 (예: 8-8-8-8)</li>
					<li><strong>스트레이트 플러시</strong>: 같은 문양의 연속 5장 이상 (예: 옥3-옥4-옥5-옥6-옥7)</li>
				</ul>
				<div class="info-box">
					<strong>봄의 특별한 규칙</strong>: 봄은 아무 때나 낼 수 있습니다. 다른 사람의 차례에도 끼어들 수 있으며,
					어떤 조합이든 이길 수 있습니다. 봄은 더 강한 봄으로만 이길 수 있습니다 (더 높은 4장 봄 또는 더 긴/높은 스트레이트 플러시).
				</div>
			</section>

			<section id="special">
				<h2>특수 카드</h2>

				<h3>참새 (Mahjong) — 값: 1</h3>
				<p>
					참새를 가진 플레이어가 라운드의 첫 카드를 냅니다. 참새는 값이 1인 싱글 카드로 사용되며,
					스트레이트에서 가장 낮은 카드(1)로 포함시킬 수 있습니다.
				</p>
				<p>
					참새를 낼 때 특정 숫자를 지정하는 "소원(Wish)" 기능을 사용할 수 있습니다.
					소원을 선언하면 이후 카드를 내는 플레이어 중 해당 숫자를 가진 사람은 가능하다면 반드시 그 숫자를 포함하여 카드를 내야 합니다.
				</p>

				<h3>피닉스 (Phoenix) — 값: 가변</h3>
				<p>
					가장 유연한 특수 카드입니다. 싱글로 낼 때는 직전에 나온 카드보다 0.5 높은 값을 가집니다.
					예를 들어 상대가 잭(J)을 냈다면, 피닉스는 잭+0.5의 값이 됩니다.
				</p>
				<p>
					조합에서는 어떤 숫자든 대체할 수 있는 와일드카드로 사용됩니다.
					페어, 트리플, 스트레이트, 풀하우스에서 부족한 카드를 대신할 수 있습니다.
					단, 봄에는 사용할 수 없습니다.
				</p>
				<div class="warning-box">
					<strong>주의</strong>: 피닉스는 -25점의 감점 카드입니다. 라운드 종료 시 피닉스를 획득한 팀은 25점이 감점됩니다.
				</div>

				<h3>드래곤 (Dragon) — 값: 최강</h3>
				<p>
					게임에서 가장 강력한 싱글 카드입니다. 에이스보다 높으며, 봄을 제외한 모든 싱글 카드를 이깁니다.
					단, 드래곤은 싱글로만 사용할 수 있고, 어떤 조합에도 포함시킬 수 없습니다.
				</p>
				<p>
					드래곤으로 트릭을 이기면 해당 트릭의 모든 카드를 상대 팀 중 한 명에게 넘겨야 합니다.
					이 규칙 때문에 드래곤은 강력하지만 신중하게 사용해야 합니다.
				</p>
				<div class="info-box">
					<strong>25점의 무게</strong>: 드래곤은 25점짜리 카드입니다. 드래곤으로 트릭을 이기면 그 점수를 상대에게 넘겨야 하므로,
					때로는 오히려 불리할 수 있습니다.
				</div>

				<h3>개 (Dog) — 값: 없음</h3>
				<p>
					차례의 시작(리드)에만 낼 수 있는 특수한 카드입니다. 개를 내면 자신의 차례를 파트너에게 넘깁니다.
					파트너가 이미 카드를 다 냈다면, 다음 상대 플레이어에게 차례가 넘어갑니다.
				</p>
				<p>
					개는 점수가 없고, 다른 카드와 조합할 수 없으며, 오직 리드 시에만 사용 가능합니다.
					파트너에게 기회를 넘겨주는 전략적 카드입니다.
				</p>
			</section>

			<section id="tichu">
				<h2>티츄 선언</h2>
				<p>
					티츄 선언은 게임의 핵심 요소로, "이번 라운드에서 내가 1등을 하겠다"라는 도전 선언입니다.
					성공하면 보너스 점수를 얻고, 실패하면 벌점을 받습니다.
				</p>

				<h3>스몰 티츄 (Small Tichu)</h3>
				<p>
					14장의 카드를 모두 받은 후, 자신의 첫 카드를 내기 전에 선언할 수 있습니다.
					성공하면 +100점, 실패하면 -100점입니다.
				</p>

				<h3>그랜드 티츄 (Grand Tichu)</h3>
				<p>
					처음 8장만 받은 상태에서 선언합니다. 나머지 6장을 보기 전에 결정해야 하므로 더 큰 리스크가 있습니다.
					성공하면 +200점, 실패하면 -200점입니다.
				</p>

				<div class="info-box">
					<strong>선언 타이밍</strong>: 그랜드 티츄는 8장만 보고 결정해야 하지만 보상이 크고,
					스몰 티츄는 14장을 다 보고 결정할 수 있지만 보상이 작습니다.
					자신의 패가 매우 강할 때만 선언하는 것이 좋습니다.
				</div>
			</section>

			<section id="scoring">
				<h2>점수 계산</h2>
				<p>각 라운드가 끝나면 다음과 같이 점수를 계산합니다.</p>

				<h3>카드 점수</h3>
				<ul>
					<li>5: 5점</li>
					<li>10, K(킹): 각 10점</li>
					<li>드래곤: 25점</li>
					<li>피닉스: -25점</li>
					<li>나머지 카드: 0점</li>
				</ul>
				<p>한 라운드의 총 카드 점수는 항상 100점입니다 (25 - 25 + 4×5 + 4×10 + 4×10 = 100).</p>

				<h3>순위 보너스</h3>
				<ul>
					<li><strong>원투 피니시</strong>: 한 팀이 1, 2등을 모두 차지하면 카드 점수 무시, 해당 팀 +200점</li>
					<li><strong>일반 종료</strong>: 꼴찌(4등)가 획득한 카드의 점수는 1등 팀에게 전달됩니다. 꼴찌의 남은 손패는 상대 팀에게 넘어갑니다.</li>
				</ul>

				<h3>티츄 보너스</h3>
				<ul>
					<li>스몰 티츄 성공: +100점 / 실패: -100점</li>
					<li>그랜드 티츄 성공: +200점 / 실패: -200점</li>
				</ul>
			</section>

			<section id="exchange">
				<h2>카드 교환</h2>
				<p>
					14장을 모두 받은 후, 각 플레이어는 다른 3명에게 카드를 1장씩 줍니다(총 3장).
					파트너에게 1장, 왼쪽 상대에게 1장, 오른쪽 상대에게 1장을 동시에 교환합니다.
				</p>
				<p>
					교환은 전략적으로 매우 중요합니다. 파트너에게는 에이스나 드래곤 같은 강한 카드를 주어 도와줄 수 있고,
					상대에게는 약한 카드나 피닉스(-25점)를 넘기는 것이 일반적입니다.
				</p>
			</section>

			<section id="tips">
				<h2>초보자 전략 팁</h2>

				<h3>1. 카드 관리를 철저히 하세요</h3>
				<p>
					에이스와 드래곤 같은 강한 카드는 후반에 사용하는 것이 좋습니다.
					초반에 약한 카드를 정리하고, 후반에 강한 카드로 마무리하는 것이 기본 전략입니다.
				</p>

				<h3>2. 봄을 아끼세요</h3>
				<p>
					봄(4장 같은 숫자 또는 스트레이트 플러시)은 아무 때나 끼어들 수 있는 강력한 무기입니다.
					상대가 티츄를 선언했을 때나, 상대의 드래곤을 막아야 할 때 사용하세요.
				</p>

				<h3>3. 파트너를 도와주세요</h3>
				<p>
					파트너가 카드가 적다면 일부러 패스하여 파트너에게 기회를 주는 것이 좋습니다.
					개 카드를 활용하면 직접 파트너에게 차례를 넘길 수 있습니다.
				</p>

				<h3>4. 점수 카드에 주목하세요</h3>
				<p>
					5(5점), 10(10점), K(10점)이 있는 트릭을 가져가는 것이 중요합니다.
					특히 드래곤(25점)이 포함된 트릭은 큰 점수 차이를 만들 수 있습니다.
				</p>

				<h3>5. 티츄 선언은 신중하게</h3>
				<p>
					강한 패(에이스 2장 이상, 드래곤, 봄 등)가 있을 때만 티츄를 선언하세요.
					무리한 선언은 -100점 또는 -200점의 벌점으로 돌아옵니다.
					확실하지 않으면 선언하지 않는 것이 안전합니다.
				</p>

				<h3>6. 상대의 패를 읽으세요</h3>
				<p>
					상대가 어떤 카드를 냈는지 기억하면 남은 카드를 추측할 수 있습니다.
					특히 봄이 아직 나오지 않았다면 경계하면서 플레이해야 합니다.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 티츄는 AI 3명과 함께 플레이합니다. 파트너 AI의 전략 스타일을 직접 선택할 수 있어,
					공격적인 파트너와 함께 빠른 승리를 노리거나 수비적인 파트너와 안정적으로 플레이할 수 있습니다.
				</p>
				<p>
					인게임 튜토리얼도 제공되니, 규칙이 익숙하지 않다면 튜토리얼부터 시작해보세요.
					4개의 레슨을 통해 기본 플레이, 카드 조합, 특수 카드, 실전 전략까지 단계별로 배울 수 있습니다.
				</p>
				<div class="cta-box">
					<a href="/minigames/tichu" class="cta-btn">티츄 플레이하기</a>
				</div>
			</section>
		</article>
	</div>
</div>

<style>
	.guide-page {
		min-height: 100vh;
		background: var(--bg-primary);
		color: var(--text-primary);
		padding: 24px 16px 80px;
	}
	.container {
		max-width: 720px;
		margin: 0 auto;
	}
	.back-link {
		display: inline-block;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9rem;
		margin-bottom: 24px;
		transition: color 0.2s;
	}
	.back-link:hover { color: var(--text-primary); }
	.hero {
		text-align: center;
		margin-bottom: 32px;
	}
	.hero-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 12px;
	}
	.hero h1 {
		font-size: 2rem;
		font-weight: 800;
		margin: 0 0 8px;
	}
	.subtitle {
		font-size: 1.05rem;
		color: var(--text-secondary);
		margin: 0;
	}

	/* Table of Contents */
	.toc {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: 16px;
		padding: 20px 24px;
		margin-bottom: 40px;
	}
	.toc h2 {
		font-size: 1rem;
		font-weight: 700;
		margin: 0 0 12px;
		color: var(--text-primary);
	}
	.toc ol {
		margin: 0;
		padding-left: 20px;
	}
	.toc li {
		margin-bottom: 6px;
	}
	.toc a {
		color: var(--color-blue);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.toc a:hover { text-decoration: underline; }

	/* Article Content */
	article section {
		margin-bottom: 40px;
	}
	article h2 {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 16px;
		padding-top: 16px;
		border-top: 1px solid var(--border-light);
	}
	article section:first-child h2 {
		border-top: none;
		padding-top: 0;
	}
	article h3 {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 20px 0 10px;
	}
	article p {
		font-size: 0.95rem;
		line-height: 1.8;
		color: var(--text-secondary);
		margin: 0 0 12px;
	}
	article ul, article ol {
		margin: 0 0 16px;
		padding-left: 20px;
	}
	article li {
		font-size: 0.95rem;
		line-height: 1.7;
		color: var(--text-secondary);
		margin-bottom: 4px;
	}

	/* Info & Warning Boxes */
	.info-box {
		background: var(--color-info-bg);
		border-left: 4px solid var(--color-blue);
		border-radius: 8px;
		padding: 14px 16px;
		margin: 16px 0;
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	.warning-box {
		background: var(--color-warning-bg);
		border-left: 4px solid var(--color-orange);
		border-radius: 8px;
		padding: 14px 16px;
		margin: 16px 0;
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	/* CTA */
	.cta-box {
		text-align: center;
		margin-top: 24px;
	}
	.cta-btn {
		display: inline-block;
		background: var(--bg-dark);
		color: var(--bg-primary);
		padding: 14px 32px;
		border-radius: 12px;
		font-size: 1rem;
		font-weight: 600;
		text-decoration: none;
		transition: opacity 0.2s;
	}
	.cta-btn:hover { opacity: 0.85; }
</style>
