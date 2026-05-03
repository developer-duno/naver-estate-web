"use client";

interface Props {
  publishedManwon: number;
  houses: 1 | 2 | 3;
  isSingleHouseEligible: boolean;
  ageYears: number;
  holdYears: number;
  prevYearTaxManwon: number;
  excludedHouses: number;

  onPublishedManwonChange: (v: number) => void;
  onHousesChange: (v: 1 | 2 | 3) => void;
  onIsSingleHouseEligibleChange: (v: boolean) => void;
  onAgeYearsChange: (v: number) => void;
  onHoldYearsChange: (v: number) => void;
  onPrevYearTaxManwonChange: (v: number) => void;
  onExcludedHousesChange: (v: number) => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]";
const RADIO_LABEL_CLASS =
  "flex items-center gap-2 min-h-[44px] px-3 rounded-md border border-gray-300 cursor-pointer hover:bg-gray-50";

export default function PropertyTaxInputs(props: Props) {
  const {
    publishedManwon, houses, isSingleHouseEligible, ageYears, holdYears, prevYearTaxManwon, excludedHouses,
    onPublishedManwonChange, onHousesChange, onIsSingleHouseEligibleChange,
    onAgeYearsChange, onHoldYearsChange, onPrevYearTaxManwonChange, onExcludedHousesChange,
  } = props;

  const singleActive = isSingleHouseEligible && houses === 1;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5">
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs sm:text-sm text-blue-900">
        <strong>표준 계산:</strong> 지방세법 §111 + 종부세법 §8/§9 기준 (국세청 PDF 16개 권위 출처).
      </div>

      <div>
        <label htmlFor="publishedManwon" className="block text-sm font-medium text-gray-700 mb-1.5">
          공시가격 (만원)
        </label>
        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 mb-2 text-xs text-yellow-900">
          ⚠️ <strong>시세가 아닌 공시가격</strong>입니다. 시세의 약 70~80% 수준이며{" "}
          <a
            href="https://www.realtyprice.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-yellow-700"
          >
            부동산공시가격알리미
          </a>
          에서 확인 가능합니다.
        </div>
        <input
          id="publishedManwon"
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={0}
          value={publishedManwon || ""}
          onChange={(e) => onPublishedManwonChange(Number(e.target.value) || 0)}
          placeholder="예: 100000 (10억원 공시)"
          className={INPUT_CLASS}
        />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1.5">보유 주택수</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <label key={n} className={RADIO_LABEL_CLASS}>
              <input
                type="radio"
                name="houses"
                value={n}
                checked={houses === n}
                onChange={() => onHousesChange(n as 1 | 2 | 3)}
              />
              <span className="text-sm">{n === 3 ? "3주택 이상" : `${n}주택`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 min-h-[44px]">
        <input
          type="checkbox"
          checked={isSingleHouseEligible}
          onChange={(e) => onIsSingleHouseEligibleChange(e.target.checked)}
          disabled={houses !== 1}
        />
        <span className={`text-sm ${houses !== 1 ? "text-gray-400" : "text-gray-700"}`}>
          1세대1주택자 (공제 12억 + 특례세율 + 연령/보유 세액공제)
        </span>
      </label>

      {houses > 1 && (
        <div>
          <label htmlFor="excludedHouses" className="block text-sm font-medium text-gray-700 mb-1.5">
            합산배제 신청 주택 수 (선택)
          </label>
          <select
            id="excludedHouses"
            value={excludedHouses}
            onChange={(e) => onExcludedHousesChange(Number(e.target.value) || 0)}
            className={INPUT_CLASS}
          >
            {Array.from({ length: houses + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? "0채 (미적용)" : `${i}채 임대등록·종교/사원용 등`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            종부세법 §8③ — 합산배제 신청한 주택은 종부세 산정에서 제외 (재산세는 영향 없음). 자격 요건은 세무사 상담 권장.
          </p>
        </div>
      )}

      {singleActive ? (
        <>
          <div>
            <label htmlFor="ageYears" className="block text-sm font-medium text-gray-700 mb-1.5">
              연령 (만 나이)
            </label>
            <input
              id="ageYears"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={0}
              max={120}
              value={ageYears || ""}
              onChange={(e) => onAgeYearsChange(Number(e.target.value) || 0)}
              placeholder="예: 65 (60세+ 20% / 65세+ 30% / 70세+ 40%)"
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-gray-500">60세 미만은 연령 세액공제 없음 (한도 80%)</p>
          </div>
          <div>
            <label htmlFor="holdYears" className="block text-sm font-medium text-gray-700 mb-1.5">
              보유연수
            </label>
            <input
              id="holdYears"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              min={0}
              step={0.1}
              value={holdYears || ""}
              onChange={(e) => onHoldYearsChange(Number(e.target.value) || 0)}
              placeholder="예: 10 (5년+ 20% / 10년+ 40% / 15년+ 50%)"
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-gray-500">5년 미만은 보유 세액공제 없음 (연령+보유 합산 한도 80%)</p>
          </div>
        </>
      ) : (
        <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <strong>다주택자 또는 1세대1주택 미적용:</strong> 연령·보유 세액공제 없음 (1세대1주택자에게만 적용).
        </div>
      )}

      <div>
        <label htmlFor="prevYearTaxManwon" className="block text-sm font-medium text-gray-700 mb-1.5">
          전년도 보유세 합계 (만원, 선택)
        </label>
        <input
          id="prevYearTaxManwon"
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={0}
          value={prevYearTaxManwon || ""}
          onChange={(e) => onPrevYearTaxManwonChange(Number(e.target.value) || 0)}
          placeholder="예: 200 (200만원 = 작년 재산세+종부세 합계)"
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-gray-500">
          입력하시면 지방세법 §122 의 <strong>세부담 상한 150% cap</strong>이 자동 적용됩니다 (올해 세금이 작년의 1.5배를 넘지 않도록 자동 제한). 비워두면 cap 미적용.
        </p>
      </div>
    </section>
  );
}
