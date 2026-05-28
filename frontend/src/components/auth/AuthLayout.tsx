"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
          <CardTitle className="text-xl">{title}</CardTitle>
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
