import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronIcon } from "./icons";

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="page-title page-head">
      {back ? (
        <button className="icon-button" type="button" aria-label={title} onClick={() => router.history.back()}>
          <ChevronIcon />
        </button>
      ) : null}
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
