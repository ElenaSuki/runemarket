import { useEffect, useMemo, useState } from "react";

import { useGasFee } from "@/lib/hooks/useGasFee";
import { cn } from "@/lib/utils";

import { Input } from "../Input";
import { Slider } from "../Slider";

const GasFeeSelector: React.FC<{
  feeRate: number;
  onFeeRateChange: (feeRate: number) => void;
}> = ({ feeRate, onFeeRateChange }) => {
  const [selectedIndex, setSelectedIndex] = useState(2);
  const { gasFee, refreshGasFee } = useGasFee();

  const minGas = useMemo(() => (gasFee ? gasFee[0].value : 1), [gasFee]);

  useEffect(() => {
    if (!gasFee) return;

    if (selectedIndex === 3) {
    } else {
      const gas = gasFee[selectedIndex];
      onFeeRateChange(gas.value);
    }
  }, [gasFee, selectedIndex]);

  if (!gasFee) return null;

  return (
    <div className="flex w-full flex-col space-y-4">
      <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
        {gasFee.map((gas, index) => (
          <div
            key={gas.title}
            onClick={() => setSelectedIndex(index)}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center space-y-2 rounded-md border bg-card p-4 transition-colors",
              {
                "border-theme": selectedIndex == index,
              },
            )}
          >
            <div className="text-sm">{gas.description}</div>
            <div className="text-base">{gas.value}</div>
          </div>
        ))}
        <div
          onClick={() => setSelectedIndex(3)}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center space-y-4 rounded-md border bg-card p-4 transition-colors",
            {
              "border-theme": selectedIndex === 3,
            },
          )}
        >
          <div className="text-sm">Custom</div>
        </div>
      </div>
      {selectedIndex === 3 && (
        <div className="flex w-full items-center space-x-2">
          <div className="w-full">
            <Slider
              max={200}
              min={minGas}
              value={
                feeRate < minGas ? [minGas] : feeRate > 200 ? [200] : [feeRate]
              }
              onValueChange={(value) => onFeeRateChange(value[0])}
            />
          </div>
          <Input
            type="number"
            value={feeRate === 0 ? undefined : feeRate}
            min={minGas}
            step={1}
            max={200}
            onChange={(e) => {
              const value = e.target.value;
              if (e.target.value.includes("e")) return;

              onFeeRateChange(Number(value));
            }}
            className="w-16"
          />
        </div>
      )}
    </div>
  );
};

export default GasFeeSelector;
