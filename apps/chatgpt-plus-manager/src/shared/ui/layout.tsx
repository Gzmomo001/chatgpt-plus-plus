import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

export function Panel({ children, fill = false, className = "" }: { children: ReactNode; fill?: boolean; className?: string }) {
  return (
    <Card className={`panel ${fill ? "fill" : ""} ${className}`}>
      {children}
    </Card>
  );
}

export function CardHead({ title, detail }: { title: string; detail?: string }) {
  return (
    <CardHeader className="panel-head">
      <CardTitle>{title}</CardTitle>
      {detail ? <CardDescription>{detail}</CardDescription> : null}
    </CardHeader>
  );
}

export function SettingsCard({
  children,
  className,
  contentClassName,
  detail,
  title,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  detail?: string;
  title: string;
}) {
  return (
    <Panel className={cn("settings-card", className)}>
      <CardHead title={title} detail={detail} />
      <CardContent className={contentClassName}>{children}</CardContent>
    </Panel>
  );
}

export function SettingsCardStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("settings-card-stack", className)}>{children}</div>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
