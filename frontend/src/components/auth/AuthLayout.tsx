"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { DataSourceBadges } from "@/components/pricing/DataSourceBadges";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  hideBadges?: boolean;
}

export function AuthLayout({ title, description, children, hideBadges }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="font-heading text-xl leading-snug font-medium">{title}</h1>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {!hideBadges && (
        <div className="w-full max-w-md mt-6">
          <DataSourceBadges variant="compact" />
        </div>
      )}
    </div>
  );
}
