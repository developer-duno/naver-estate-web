"use client";

import Image from "next/image";

interface Props {
  src: string;
  alt: string;
  caption?: string;
  priority?: boolean;
  aspect?: "video" | "square" | "portrait";
}

const ASPECT_CLASS = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
} as const;

export default function BlogFigure({
  src,
  alt,
  caption,
  priority = false,
  aspect = "video",
}: Props) {
  return (
    <figure className="my-6 sm:my-8">
      <div
        className={`relative w-full ${ASPECT_CLASS[aspect]} rounded-lg overflow-hidden bg-gray-100`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, 800px"
          className="object-cover"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs sm:text-sm text-gray-500 text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
