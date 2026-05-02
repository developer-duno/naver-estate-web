import type { MDXComponents } from "mdx/types";
import Image from "next/image";
import Link from "next/link";

const components: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2 mb-4 leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-8 mb-3">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm sm:text-base leading-relaxed text-gray-700 mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-6 mb-4 text-sm sm:text-base text-gray-700 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 mb-4 text-sm sm:text-base text-gray-700 space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-300 bg-blue-50 px-4 py-2 my-4 text-sm text-gray-700">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-xs sm:text-sm border border-gray-200">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-gray-200 px-2 sm:px-3 py-1.5 text-left font-semibold text-gray-800">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-gray-200 px-2 sm:px-3 py-1.5 text-gray-700">{children}</td>,
  code: ({ children }) => (
    <code className="bg-gray-100 text-pink-700 px-1.5 py-0.5 rounded text-xs sm:text-sm">{children}</code>
  ),
  hr: () => <hr className="my-8 border-gray-200" />,
  // raw <img> 금지 (web-rules.md). next/Image 로 강제 매핑.
  // src 가 /로 시작하는 절대 경로 또는 외부 URL 만 허용. width/height 미지정 시 차트 비율 기본값.
  img: (props) => {
    const src = typeof props.src === "string" ? props.src : "";
    if (!src) return null;
    return (
      <Image
        src={src}
        alt={props.alt ?? ""}
        width={typeof props.width === "number" ? props.width : 800}
        height={typeof props.height === "number" ? props.height : 450}
        className="my-4 rounded border border-gray-200"
        sizes="(max-width: 768px) 100vw, 800px"
      />
    );
  },
  a: ({ href, children }) => {
    const url = href ?? "#";
    if (url.startsWith("/")) {
      return (
        <Link href={url} className="text-blue-600 hover:text-blue-700 underline">
          {children}
        </Link>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-700 underline"
      >
        {children}
      </a>
    );
  },
};

export function useMDXComponents(): MDXComponents {
  return components;
}
