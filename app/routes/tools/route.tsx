import { Outlet, useLocation, useNavigate } from "@remix-run/react";
import { useMemo } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/Tabs";

export default function ToolsPage() {
  const navigate = useNavigate();

  const { pathname } = useLocation();

  const tabsValue = useMemo(() => {
    return pathname.split("/")[2] || "rbf";
  }, [pathname]);

  return (
    <div className="w-full space-y-6">
      <div className="flex h-32 w-full items-center justify-center">
        <div className="text-3xl font-medium">Tools For Bitcoin</div>
      </div>
      <Tabs
        className="w-full border-b"
        value={tabsValue}
      >
        <TabsList>
          <TabsTrigger
            className="h-10 data-[state=active]:border-b data-[state=active]:border-theme data-[state=active]:text-theme"
            value="rbf"
            onClick={() => {
              navigate(`/tools/rbf`);
            }}
          >
            RBF
          </TabsTrigger>
          <TabsTrigger
            disabled
            className="h-10 data-[state=active]:border-b data-[state=active]:border-theme data-[state=active]:text-theme"
            value="accelerate"
            onClick={() => {
              navigate(`/tools/accelerate`);
            }}
          >
            Accelerate
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
