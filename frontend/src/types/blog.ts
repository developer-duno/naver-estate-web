export type BlogCategory = "시세 분석" | "세금" | "미분양" | "도구 활용";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: BlogCategory;
  readingTime: number;
  draft?: boolean;
};
