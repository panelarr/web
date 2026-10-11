// SPDX-License-Identifier: GPL-3.0-or-later

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A read-only value with a copy button: API keys, invite links. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={value}
        aria-label={label}
        className="font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}
