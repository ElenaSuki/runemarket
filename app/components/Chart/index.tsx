import dayjs from "dayjs";
import { ColorType, Time, createChart } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { cn, formatNumber, satsToBTC } from "@/lib/utils";

import { Tabs, TabsList, TabsTrigger } from "@/components/Tabs";

export type KlineResponseType = {
  block_hour: string;
  avg_price: string;
  volume: string;
};

const Chart: React.FC<{
  kline: KlineResponseType[];
}> = ({ kline }) => {
  const { BTCPrice } = useBTCPrice();

  const chartRef = useRef<null | HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const [chartHover, setChartHover] = useState(false);
  const [useUSD, setUseUSD] = useState(false);
  const [tooltipsData, setTooltipsData] = useState({
    avgPrice: 0,
    totalVolume: 0,
    time: 0,
  });
  let prevVolume = 0;

  useEffect(() => {
    if (!chartRef.current || !kline) return;

    const chart = createChart(chartRef.current, {
      layout: {
        textColor: "#7F7F7F",
        background: {
          type: ColorType.Solid,
          color: "#141414",
        },
      },
      grid: {
        vertLines: {
          visible: false,
        },
        horzLines: {
          visible: false,
        },
      },
      leftPriceScale: {
        borderColor: "rgba(239,239,239,0.12)",
        visible: true,
        entireTextOnly: true,
        ticksVisible: true,
      },
      timeScale: {
        borderColor: "rgba(239,239,239,0.12)",
      },
      rightPriceScale: {
        visible: false,
      },
    });

    const baselineSeries = chart.addBaselineSeries({
      lineWidth: 1,
      topLineColor: "#38bdf8",
      topFillColor1: "rgba( 56, 189, 248, 0.28)",
      topFillColor2: "rgba( 56, 189, 248, 0.05)",
      priceScaleId: "left",
      priceLineVisible: false,
    });

    const histogramSeries = chart.addHistogramSeries({
      priceScaleId: "",
      priceLineVisible: false,
    });

    baselineSeries.setData(
      kline.map((d) => ({
        time: dayjs.utc(d.block_hour).unix() as Time,
        value:
          useUSD && BTCPrice
            ? (
                parseFloat(satsToBTC(parseFloat(d.avg_price))) * BTCPrice
              ).toFixed(4)
            : d.avg_price,
      })),
    );

    histogramSeries.setData(
      kline.map((d) => {
        const color = parseInt(d.volume) > prevVolume ? "#00AC4F" : "#E02345";
        prevVolume = parseInt(d.volume);
        return {
          time: dayjs.utc(d.block_hour).unix() as Time,
          value: parseFloat(satsToBTC(parseFloat(d.volume), { digits: 8 })),
          color,
        };
      }),
    );

    histogramSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.75,
        bottom: 0,
      },
    });

    if (kline.length > 0) {
      chart.timeScale().setVisibleRange({
        from: dayjs
          .utc(kline[kline.length - 1].block_hour)
          .subtract(1, "month")
          .unix() as Time,
        to: dayjs.utc(kline[kline.length - 1].block_hour).unix() as Time,
      });
    }

    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        setChartHover(true);
        const avgPriceData = param.seriesData.get(baselineSeries);
        const totalVolumeData = param.seriesData.get(histogramSeries);

        if (
          avgPriceData &&
          totalVolumeData &&
          "value" in avgPriceData &&
          "value" in totalVolumeData
        ) {
          setTooltipsData({
            avgPrice: avgPriceData.value,
            totalVolume: totalVolumeData.value,
            time: param.time as number,
          });
        }
      } else {
        setChartHover(false);
      }
    });

    setLoading(false);

    return () => {
      chart.remove();
    };
  }, [chartRef.current, useUSD]);

  return (
    <div
      className="relative flex h-[412px] w-full"
      ref={chartRef}
    >
      {loading && (
        <div className="absolute left-0 top-0 z-20 flex h-full w-full animate-pulse items-center justify-center rounded-lg bg-skeleton"></div>
      )}
      {/* <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full w-full items-center justify-center opacity-10">
          
        </div> */}
      <div
        className={cn(
          "pointer-events-none absolute left-3 top-3 z-10 flex flex-col space-y-1 rounded-md bg-secondary p-2 text-xs",
          {
            hidden: !chartHover,
          },
        )}
      >
        <div className="oswald text-search-placeholder dark:text-muted-background">
          {dayjs.unix(tooltipsData.time).utc().format("YYYY-MM-DD HH:mm")}
        </div>
        <div className="flex items-center space-x-1">
          <span className="text-search-placeholder dark:text-muted-background">
            Avg Price:
          </span>
          <span className="oswald text-search-icon">
            {formatNumber(Number(tooltipsData.avgPrice))}{" "}
            {useUSD ? "USD" : "Sats"}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="text-search-placeholder dark:text-muted-background">
            Volume:
          </span>
          <span className="oswald text-search-icon">
            {tooltipsData.totalVolume} BTC
          </span>
        </div>
      </div>
      <Tabs
        value={useUSD ? "usd" : "sats"}
        onValueChange={(value) => {
          setUseUSD(value === "usd");
        }}
        className={cn("absolute right-3 top-3 z-10", {
          hidden: BTCPrice === undefined,
        })}
      >
        <TabsList className="px-1">
          <TabsTrigger
            className="rounded-lg data-[state=active]:text-theme"
            value="sats"
          >
            Sats
          </TabsTrigger>
          <TabsTrigger
            className="rounded-lg data-[state=active]:text-theme"
            value="usd"
          >
            USD
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};

export default Chart;
