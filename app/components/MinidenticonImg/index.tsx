import { minidenticon } from "minidenticons";
import { useMemo } from "react";

const MinidenticonImg: React.FC<{
  username: string;
  saturation: number;
}> = ({ username, saturation, ...props }) => {
  const svgURI = useMemo(
    () =>
      "data:image/svg+xml;utf8," +
      encodeURIComponent(minidenticon(username, saturation)),
    [username, saturation],
  );

  return (
    <img
      src={svgURI}
      alt={username}
      className="h-full w-full overflow-hidden rounded-md bg-primary"
      {...props}
    />
  );
};

export default MinidenticonImg;
