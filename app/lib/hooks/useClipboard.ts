import { useCallback, useEffect, useState } from "react";

export const useClipboard = () => {
  const [success, setSuccess] = useState(false);

  const copyToClipboard = useCallback(
    async (text: string) => {
      if (!navigator.clipboard) {
        console.warn("Clipboard not available");
        return;
      }

      if (success) {
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        setSuccess(true);
      } catch (error) {
        console.error("Copy to clipboard failed", error);
      }
    },
    [success],
  );

  useEffect(() => {
    if (success) {
      const timeout = setTimeout(() => {
        setSuccess(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [success]);

  return { copyToClipboard, success };
};
