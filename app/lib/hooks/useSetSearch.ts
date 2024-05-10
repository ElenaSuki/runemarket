import { useSearchParams } from "@remix-run/react";

export const useSetSearch = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const updateSearchParams = (
    params: Record<string, any>,
    options?: {
      action?: "push" | "replace";
      scroll?: boolean;
    },
  ) => {
    const newSearchParams =
      options?.action === "replace"
        ? new URLSearchParams()
        : new URLSearchParams(searchParams);

    if (!("page" in params)) {
      newSearchParams.delete("page");
    }

    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newSearchParams.set(key, value);
      } else if (newSearchParams.has(key)) {
        newSearchParams.delete(key);
      }
    });

    setSearchParams(newSearchParams, {
      replace: newSearchParams.has("page") ? false : true,
      preventScrollReset: options?.scroll === false ? true : false,
    });
  };

  return {
    searchParams,
    updateSearchParams,
  };
};
