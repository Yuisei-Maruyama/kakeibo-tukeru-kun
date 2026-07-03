import { cn } from "@/lib/utils";

// ドット絵 GIF を CSS で回転させる共通ローディングスピナー
function YadonSpinner({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/yadon-spinner.gif"
      alt=""
      aria-hidden="true"
      className={cn(
        "animate-spin object-contain [image-rendering:pixelated]",
        className,
      )}
    />
  );
}

export { YadonSpinner };
