<script lang="ts">
    /*
        /admin 전체를 감싸는 껍데기. 하는 일은 하나 — 디자인 토큰을 닿게 하는 것.

        토큰은 원래 (dashboard)/+layout.svelte 안에만 있었고, /admin/login 과
        /admin/qr 은 그 라우트 그룹 밖이라 토큰을 못 받았다. 그런데 두 화면은
        var(--space-*) 로 간격을 쓰고 있어서 선언 32개가 통째로 무효가 됐다
        (로그인 카드 padding 이 실제로 0px 였다). 이 레이아웃이 그룹 밖까지
        포함한 /admin/* 전부를 덮는다.
    */
    import '$lib/styles/admin-tokens.css';

    let { children } = $props();
</script>

<!--
    data-theme="light" + .force-light 은 짝이다. 토큰이 이 클래스 안에서만
    선언되므로, 감싸지 않으면 어드민이 공개 사이트의 다크모드를 따라간다.
    반대로 클래스 밖으로는 어드민 토큰이 새지 않는다.
-->
<div data-theme="light" class="force-light">
    {@render children()}
</div>
