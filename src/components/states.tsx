// SPDX-License-Identifier: GPL-3.0-or-later

import { AlertCircle, Check, Copy, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ApiError, errorMessage } from "@/api/errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A page's title row: the title, an optional description and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  level = 1,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** 2 for a header inside another page (a tab's own page, say). */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-60">
        <Heading
          className={cn("font-semibold tracking-tight [overflow-wrap:anywhere]", level === 1 ? "text-2xl" : "text-xl")}
        >
          {title}
        </Heading>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** Shows any error: the server's message, its code and request ID (copyable), and Retry. */
export function ErrorAlert({ error, title, onRetry }: { error: unknown; title?: string; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : undefined;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden />
      <AlertTitle>{title ?? api?.title ?? "Something went wrong"}</AlertTitle>
      <AlertDescription>
        <p className="[overflow-wrap:anywhere]">{errorMessage(error)}</p>
        {api && (api.requestId || api.status > 0) ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>
              {api.code}
              {api.status > 0 ? ` · HTTP ${api.status}` : null}
            </span>
            {api.requestId ? <CopyText label="Request ID" value={api.requestId} /> : null}
          </p>
        ) : null}
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function CopyText({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex min-w-0 items-center gap-1 font-mono hover:text-foreground"
      title={`Copy ${label.toLowerCase()}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <span className="truncate">
        {label}: {value}
      </span>
      {copied ? <Check className="size-3" aria-label="Copied" /> : <Copy className="size-3" aria-hidden />}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground [&_svg]:size-10">{icon}</div> : null}
      <h2 className="text-lg font-medium">{title}</h2>
      {children ? <div className="max-w-prose text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
