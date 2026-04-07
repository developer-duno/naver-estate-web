"use client";

import dynamic from "next/dynamic";

const MbLocationMap = dynamic(() => import("@/components/mb/MbLocationMap"), { ssr: false });

interface Props {
  latitude?: number;
  longitude?: number;
  name?: string;
}

export default function ArticleMap({ latitude, longitude, name }: Props) {
  if (!latitude || !longitude) return null;
  return <MbLocationMap latitude={latitude} longitude={longitude} name={name} />;
}
