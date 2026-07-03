import { YadonSpinner } from "@/components/ui/yadon-spinner";

// 親要素に relative が必要
function LoadingOverlay({
  show,
  label = "読み込み中",
}: {
  show: boolean;
  label?: string;
}) {
  if (!show) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-background/75"
    >
      <span className="flex items-center gap-2 font-display text-sm text-muted-foreground">
        <YadonSpinner className="size-10" />
        {label}
      </span>
    </div>
  );
}

export { LoadingOverlay };
