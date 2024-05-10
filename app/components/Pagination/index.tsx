import { useMemo } from "react";

import { Button } from "../Button";

export const Pagination: React.FC<{
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}> = ({ page, total, onPageChange }) => {
  const pageCursor = useMemo(() => {
    const start = Math.max(page - 2, 1);
    const end = Math.min(page + 2, total);

    const pages = new Array(end - start + 1).fill(0).map((_, i) => i + start);

    const withEdges = [];

    if (start > 2) {
      withEdges.push(1, "...");
    } else if (start === 2) {
      withEdges.push(1);
    }

    withEdges.push(...pages);

    if (end < total - 1) {
      withEdges.push("...", total);
    } else if (end === total - 1) {
      withEdges.push(total);
    }

    return withEdges;
  }, [page, total]);

  return (
    <div className="flex w-full items-center justify-center space-x-2">
      {pageCursor.map((p, index) =>
        p === "..." ? (
          <div key={index}>...</div>
        ) : (
          <Button
            key={index}
            disabled={p === page}
            onClick={() => {
              if (typeof p === "number") {
                onPageChange(p);
              }
            }}
          >
            {p}
          </Button>
        ),
      )}
    </div>
  );
};

export default Pagination;
