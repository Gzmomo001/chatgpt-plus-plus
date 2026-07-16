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

type SettingsSurfaceProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  detail?: string;
  title: string;
};

export function SettingsSurface({
  children,
  className,
  contentClassName,
  detail,
  title,
}: SettingsSurfaceProps) {
  return (
    <Card className={cn("panel", "settings-surface", className)}>
      <CardHead title={title} detail={detail} />
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

export function SettingsCard(props: SettingsSurfaceProps) {
  return <SettingsSurface {...props} className={cn("settings-card", props.className)} />;
}

export function SettingsCardStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("settings-surface-stack", "settings-card-stack", className)}>{children}</div>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
