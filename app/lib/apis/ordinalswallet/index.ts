import axios from "axios";
import { Network, networks } from "bitcoinjs-lib";

const BaseUrl = (network: Network) =>
  network === networks.testnet
    ? "https://turbo.ordinalswallet.com"
    : "https://turbo.ordinalswallet.com";

export const getInscriptionLocation = async (
  network: Network,
  inscriptionId: string,
) => {
  const resp = await axios.get<{
    inscription: {
      id: string;
      sat_offset: number;
      outpoint: string;
      address: string;
      sats: number;
    };
    owner: string;
    sats: number;
  }>(`${BaseUrl(network)}/inscription/${inscriptionId}/outpoint`);

  return resp.data;
};

export const getAddressInscription = async (
  network: Network,
  address: string,
) => {
  const resp = await axios.get<{
    inscriptions: {
      id: string;
      outpoint: {
        outpoint: string;
      };
    }[];
  }>(`https://turbo.ordinalswallet.com/wallet/${address}`);
};
