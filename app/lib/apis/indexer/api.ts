import axios from "axios";

const BaseUrl = "http://10.0.4.6:3000/api";
// const BaseUrl = "https://indexer.runemarket.top/api";

export const getAddressRuneWithLocation = async (address: string) => {
  const resp = await axios.get<{
    result: {
      data: {
        rune_id: string;
        rune_name: string;
        location_txid: string;
        location_vout: number;
      }[];
      total: number;
    };
  }>(`${BaseUrl}/balance/${address}`);

  return resp.data.result;
};
