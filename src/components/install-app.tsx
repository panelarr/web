// SPDX-License-Identifier: GPL-3.0-or-later

import { Download, Share, SquarePlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstall } from "@/hooks/use-install";

/**
 * "Install the app": the browser's own prompt where it has one, the steps on iOS. Renders
 * nothing once installed or where installing isn't offered.
 */
export function InstallApp({ render }: { render: (props: { onClick: () => void }) => React.ReactNode }) {
  const { installed, canPrompt, ios, install } = useInstall();
  const [steps, setSteps] = useState(false);
  if (installed || (!canPrompt && !ios)) return null;
  return (
    <>
      {render({ onClick: () => (canPrompt ? void install() : setSteps(true)) })}
      <Dialog open={steps} onOpenChange={setSteps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install Panelarr</DialogTitle>
            <DialogDescription>It opens full screen, like an app, from your home screen.</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-3 text-sm">
            <li className="flex items-center gap-3">
              <Share className="size-5 shrink-0 text-primary" aria-hidden />
              Tap Share in Safari's toolbar.
            </li>
            <li className="flex items-center gap-3">
              <SquarePlus className="size-5 shrink-0 text-primary" aria-hidden />
              Choose “Add to Home Screen”.
            </li>
          </ol>
          <DialogFooter>
            <Button onClick={() => setSteps(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { Download as InstallIcon };
