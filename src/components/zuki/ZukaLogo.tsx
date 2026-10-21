import logo from "@/assets/zuka-logo-mark.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Official ZUKA PAY logo rendered as a CSS mask so its colour follows the
 * active theme (dark green in light mode, white in dark mode) without
 * changing its shape. Pass a text colour class to override (e.g. on a dark band).
 */
export function ZukaLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="ZUKA PAY"
      className={cn("inline-block aspect-[462/479] bg-current text-logo", className)}
      style={{
        maskImage: `url(${logo.url})`,
        WebkitMaskImage: `url(${logo.url})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
