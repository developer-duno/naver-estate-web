import HomeSections from "./HomeSections";
import { HomeSearchBoxStatic } from "./HomeSearchBox";

export const HOME_FALLBACK_ID = "home-fallback";

/**
 * 검색어 있는 주소(/?q=…·/?sido=…&sigungu=…)로 바로 들어오면 대기 화면의 홈 칸이 잠깐 보였다가 결과로 바뀌던 것을 막는다(세션 508 맹점 🟠B).
 * 세션 525(B40 PR 2a)부터 홈 큰 띠(HomeHero · h1)도 이 상자 안(HomeSections 맨 위)이라 같이 숨는다 — 결과 화면엔 얇은 띠만.
 * 첫 HTML 안에서 홈 칸 바로 뒤에 놓여 그리기 전에 돈다. 판정은 SearchExperience 의 hasSearchParams 와 같다:
 * `q` 가 있거나 `sido`·`sigungu` 가 둘 다 있으면 검색 화면. CSP 는 script-src 'unsafe-inline' 이라 nonce 없이 돈다(next.config.ts).
 * React 19 는 <script> 의 글자 자식을 `</script` 만 바꾸고 그대로 내보낸다 — 이 글자에 `<` 를 쓰지 않는다.
 */
export const HIDE_FALLBACK_SCRIPT =
  `(function(){var p=new URLSearchParams(location.search);` +
  `if(p.get("q")||(p.get("sido")&&p.get("sigungu"))){var e=document.getElementById("${HOME_FALLBACK_ID}");if(e)e.style.display="none";}})();`;

/** 홈 Suspense 대기 화면 — 정적 홈 칸(GET 검색창) + 검색 주소면 숨기는 짧은 스크립트 */
export default function HomeFallback() {
  return (
    <>
      <div id={HOME_FALLBACK_ID}>
        <HomeSections search={<HomeSearchBoxStatic />} interactive={false} />
      </div>
      <script>{HIDE_FALLBACK_SCRIPT}</script>
    </>
  );
}
