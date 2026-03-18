import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "도움말 - 아파트 매물 조회",
  description: "네이버 아파트 매물 조회 서비스 사용 가이드",
};

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">사용 가이드</h1>
        <p className="text-gray-500 text-sm">네이버 아파트 매물 조회 서비스를 효과적으로 활용하는 방법</p>
      </div>

      {/* 1. 검색 */}
      <Section num={1} title="아파트 검색하기">
        <H3>키워드 검색</H3>
        <p>홈 화면 상단의 검색창에 아파트 단지명을 입력하세요.</p>
        <Example>래미안, 힐스테이트, 강남, 서초 등</Example>
        <p>검색 버튼을 클릭하거나 Enter 키를 누르면 검색 결과 페이지로 이동합니다.</p>

        <H3>지역 검색</H3>
        <p>홈 화면 하단의 지역 선택에서 시도 → 시군구 → 읍면동 순서로 선택하세요.</p>
        <p>선택한 지역의 모든 아파트 단지가 표시됩니다.</p>

        <H3>검색 결과</H3>
        <p>검색 결과 테이블에서 원하는 단지를 클릭하면 해당 단지의 매물 목록으로 이동합니다.</p>

        <Tip>
          처음 검색하는 단지는 네이버 부동산에서 실시간으로 데이터를 수집하기 때문에
          시간이 다소 걸릴 수 있습니다. 이후 동일 단지 재방문 시에는 저장된 데이터가
          즉시 표시됩니다.
        </Tip>
      </Section>

      {/* 2. 필터 */}
      <Section num={2} title="매물 필터링">
        <p>단지 상세 페이지 상단에 7개의 필터 버튼이 있습니다. 각 버튼을 클릭하면 드롭다운이 열립니다.</p>

        <FilterDesc name="거래유형" desc="매매, 전세, 월세, 단기임대 중 선택" />
        <FilterDesc name="가격" desc="프리셋 버튼(~3억, 3~6억 등)으로 빠른 선택 또는 직접 입력. 평당가 필터도 포함" />
        <FilterDesc name="면적" desc="프리셋(~59m², 84m² 등) 또는 직접 입력. m²/평 단위 전환 가능" />
        <FilterDesc name="층수" desc="저층(1~5층), 중층(6~10층), 고층(11층 이상)" />
        <FilterDesc name="입주" desc="즉시입주, 1개월, 3개월, 6개월, 협의" />
        <FilterDesc name="방/욕실" desc="최소 방 수, 최소 욕실 수 선택" />
        <FilterDesc name="상세" desc="동, 방향, 관리비, 준공년도, 매물유형, 인증매물, 정렬" />

        <H3>필터 칩</H3>
        <p>활성화된 필터는 버튼 아래에 파란색 칩으로 표시됩니다. 칩의 &times; 버튼을 클릭하면 해당 필터가 해제됩니다.</p>
        <p>&quot;초기화&quot; 버튼을 클릭하면 모든 필터가 초기화됩니다.</p>
      </Section>

      {/* 3. 정렬 */}
      <Section num={3} title="매물 정렬">
        <p>테이블의 컬럼 헤더(거래, 동, 층, 가격 등)를 클릭하면 정렬됩니다.</p>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2">
          <li>첫 클릭: ▲ 오름차순</li>
          <li>두 번째 클릭: ▼ 내림차순</li>
          <li>세 번째 클릭: 정렬 해제</li>
        </ul>
        <p className="mt-2">&quot;상세&quot; 드롭다운 내 정렬 옵션에서도 정렬 기준을 변경할 수 있습니다.</p>
      </Section>

      {/* 4. 데이터 갱신 */}
      <Section num={4} title="데이터 갱신">
        <Tip>
          페이지를 새로고침하면 기존 DB 데이터만 빠르게 표시됩니다.
          네이버에서 최신 매물을 가져오려면 &quot;데이터 갱신&quot; 버튼을 클릭하세요.
        </Tip>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2">
          <li><strong>데이터 갱신 버튼</strong>: 네이버 부동산에서 최신 매물을 수집합니다 (로그인 필요)</li>
          <li><strong>마지막 크롤링 시간</strong>: 단지명 옆에 &quot;2시간 전&quot;과 같이 표시됩니다</li>
          <li><strong>크롤링 진행 상황</strong>: 수집 중에는 진행률 배너가 표시됩니다</li>
        </ul>
      </Section>

      {/* 5. 매물 상세 */}
      <Section num={5} title="매물 상세 보기">
        <p>매물 테이블에서 원하는 행을 클릭하면 상세 정보 모달이 열립니다.</p>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2">
          <li>기본 정보: 거래유형, 가격, 면적, 층, 방향, 방/욕실</li>
          <li>특징 및 상세 설명</li>
          <li>태그 (예: 2년 이내, 대단지, 역세권)</li>
          <li>중개사 정보 및 연락처</li>
          <li>세금/수수료 (취득세, 중개보수)</li>
          <li><strong>네이버 부동산에서 상세보기</strong>: 네이버 부동산 페이지로 바로 이동</li>
          <li><strong>네이버 지도에서 보기</strong>: 해당 단지 위치를 지도에서 확인</li>
        </ul>
      </Section>

      {/* 6. 엑셀 */}
      <Section num={6} title="엑셀 내보내기">
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2">
          <li><strong>전체 내보내기</strong>: &quot;엑셀 내보내기&quot; 버튼을 클릭하면 현재 필터 조건의 매물을 Excel 파일로 다운로드합니다</li>
          <li><strong>선택 내보내기</strong>: 체크박스로 원하는 매물을 선택한 후 &quot;선택 N건 내보내기&quot; 버튼을 클릭합니다</li>
        </ul>
      </Section>

      {/* 7. 계정 */}
      <Section num={7} title="회원가입 / 로그인">
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2">
          <li><strong>비회원</strong>: 검색, 필터, 정렬, 매물 상세 보기 가능</li>
          <li><strong>로그인 시</strong>: 데이터 갱신, 엑셀 내보내기 기능 사용 가능</li>
          <li><strong>비밀번호 분실</strong>: 로그인 페이지에서 &quot;비밀번호 찾기&quot; → 이메일로 재설정 링크 발송</li>
        </ul>
      </Section>

      {/* 하단 */}
      <div className="text-center pt-6 border-t">
        <Link href="/" className="text-blue-600 hover:underline text-sm">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}

function Section({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold">{num}</span>
        {title}
      </h2>
      <div className="space-y-2 text-sm text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-semibold text-gray-800 mt-4 mb-1">{children}</h3>;
}

function Example({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5 inline-block">{children}</p>;
}

function FilterDesc({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex gap-2 items-start ml-2 mt-1">
      <span className="text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded px-2 py-0.5 whitespace-nowrap">{name} ▾</span>
      <span className="text-sm text-gray-600">{desc}</span>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-md px-4 py-2 mb-2">
      {children}
    </div>
  );
}
