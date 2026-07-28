import { useState } from "react";
import { useSpring, animated } from "@react-spring/web";
import { Boxes, ArrowRight } from "lucide-react";

import { useSessionStore } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

/**
 * Mock sign-in. There's no backend yet - "logging in" just flips the session
 * to authenticated, which reveals the workspace and triggers the welcome tour.
 */
export function LoginPage() {
  const login = useSessionStore((s) => s.login);
  const [busy, setBusy] = useState(false);

  const enter = useSpring({
    from: { opacity: 0, transform: "translateY(12px)" },
    to: { opacity: 1, transform: "translateY(0px)" },
    config: { tension: 260, friction: 26 },
  });

  const handleLogin = () => {
    setBusy(true);
    // tiny delay so the click feels like it does something
    window.setTimeout(() => login(), 280);
  };

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-background">
      {/* soft glow backdrop */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />

      <animated.div style={enter}>
        <Card className="w-[380px]">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-2xl border border-border bg-secondary">
              <Boxes className="size-7 text-primary" />
            </div>
            <CardTitle>Spine Workbench</CardTitle>
            <CardDescription>
              Drop a skeleton to measure and inspect it at true scale.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              className="w-full"
              size="lg"
              disabled={busy}
              onClick={handleLogin}
            >
              {busy ? "Opening…" : "Enter the workbench"}
              {!busy && <ArrowRight />}
            </Button>
          </CardFooter>
        </Card>
      </animated.div>
    </div>
  );
}
