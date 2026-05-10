"use client";

import Image from "next/image";
import type { BlogPost } from "@/types/blog";
import { getHeroAsset } from "@/lib/blog-hero";

interface Props {
  post: Pick<BlogPost, "slug" | "category" | "title">;
  priority?: boolean;
}

export default function BlogHero({ post, priority = false }: Props) {
  const src = getHeroAsset(post);
  return (
    <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] mb-6 sm:mb-8 rounded-lg overflow-hidden bg-gray-100">
      <Image
        src={src}
        alt={post.title}
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 800px"
        className="object-cover"
      />
    </div>
  );
}
