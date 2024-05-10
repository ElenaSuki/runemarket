import { Check, Copy } from "lucide-react";

import { useClipboard } from "@/lib/hooks/useClipboard";
import { cn } from "@/lib/utils";

const CopyButton: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className }) => {
  const { copyToClipboard, success } = useClipboard();

  const handleCopy = async () => {
    await copyToClipboard(text);
  };

  if (success) {
    return (
      <div
        className={cn(
          "flex rounded-md p-2 text-green-400 transition-colors hover:bg-secondary",
          className,
        )}
      >
        <Check className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex cursor-pointer rounded-md p-2 text-primary transition-colors hover:bg-secondary hover:text-theme",
        className,
      )}
    >
      <Copy
        onClick={() => {
          handleCopy();
        }}
        className="h-4 w-4"
      />
    </div>
  );
};

export default CopyButton;
