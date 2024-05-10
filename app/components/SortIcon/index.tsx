import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useCallback } from "react";

const SortIcon: React.FC<{
  clickHandler: (sorting: string) => void;
  sortKey: string;
  sorting: string;
}> = ({ clickHandler, sortKey, sorting }) => {
  const handleSort = useCallback(() => {
    const nextSort =
      sorting === `${sortKey}:asc` ? `${sortKey}:desc` : `${sortKey}:asc`;
    clickHandler(nextSort);
  }, [sortKey, sorting]);

  return (
    <>
      {sorting === `${sortKey}:asc` ? (
        <ChevronUp
          onClick={handleSort}
          className="h-4 w-4 cursor-pointer"
        />
      ) : sorting === `${sortKey}:desc` ? (
        <ChevronDown
          onClick={() => clickHandler("")}
          className="h-4 w-4 cursor-pointer"
        />
      ) : (
        <ChevronsUpDown
          onClick={handleSort}
          className="h-4 w-4 cursor-pointer"
        />
      )}
    </>
  );
};

export default SortIcon;
