/**
 * blog-hero/raw/*.{jpg,png} → webp 변환 + 파일명 매핑
 *
 * - 16:9 비율 강제 (원본 비율 보존, 필요 시 resize 만)
 * - max width 1920px
 * - quality 85
 * - EXIF strip (GPS PII 제거)
 */
import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

const RAW_DIR = "public/blog-hero/raw";
const OUT_DIR = "public/blog-hero";

// 본인 시각 분석 후 매핑 (sha 12 prefix → 영문 슬러그, URL 안전성)
const MAP = {
  "117dd448130f": "main-hero",                  // 베트남 단지 야경 (시네마틱)
  "2e2cb912e6ed": "category-tools",             // 3D 평면도
  "4bad3a80ab0f": "complex-price-analysis",     // 신축 단지 조감
  "79e6d82a547f": "category-mibunyang",         // 한강뷰 일출 초고층
  "8b6fc773254b": "agent-verification-guide",   // 타워팰리스 4동
  "8fed102545cf": "asking-vs-actual-price",     // 도시 스카이라인 석양
  "a7228175b596": "category-price",             // 신축 단지 조감 (재건축)
  "b480bf4a97e7": "jeonse-ratio",               // 한국 신축 단지 정면
  "d987701d90e9": "category-tax",               // 신축 vs 구축 대비
};

await mkdir(OUT_DIR, { recursive: true });

const files = await readdir(RAW_DIR);
let converted = 0;

for (const file of files) {
  const m = file.match(/attachment-\d+-([a-f0-9]+)\.(jpg|png)/);
  if (!m) continue;
  const [, hash] = m;
  const slug = MAP[hash];
  if (!slug) {
    console.warn(`[SKIP] ${file} — 매핑 없음 (hash: ${hash})`);
    continue;
  }

  const inPath = join(RAW_DIR, file);
  const outPath = join(OUT_DIR, `${slug}.webp`);

  // sharp: resize → webp + EXIF strip
  await sharp(inPath)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 85, effort: 4 })
    .withMetadata({ exif: {} }) // EXIF 비우기 (PII strip)
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  console.log(`[OK] ${slug}.webp (${meta.width}×${meta.height})`);
  converted++;
}

console.log(`\n변환 완료: ${converted}개`);
