import { ActionFunction, json } from "@remix-run/node";
import { Psbt, networks } from "bitcoinjs-lib";
import { createHash } from "crypto";
import dayjs from "dayjs";
import { z } from "zod";

import {
  getAddressInscriptions,
  getAddressRuneUTXOsByUnisat,
  getRuneInfo,
} from "@/lib/apis/unisat/api";
import DatabaseInstance from "@/lib/server/prisma.server";
import {
  OfferCreateReqSchema,
  OfferCreateReqSchemaType,
} from "@/lib/types/market";
import { getCollectionName } from "@/lib/utils";
import {
  detectScriptToAddressType,
  isTestnetAddress,
  reverseBuffer,
} from "@/lib/utils/address-helpers";
import { validateInputSignature } from "@/lib/utils/bitcoin-utils";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  psbt: z.string().min(1),
  address: z.string().min(1),
  rune_id: z.string().min(1),
  unit_price: z.string().min(1),
});

type RequestSchemaType = z.infer<typeof RequestSchema>;

export const action: ActionFunction = async ({ request }) => {
  try {
    const data: RequestSchemaType = await request.json();

    try {
      RequestSchema.parse(data);
    } catch (e) {
      return json(errorResponse(10001));
    }

    const network = isTestnetAddress(data.address)
      ? networks.testnet
      : networks.bitcoin;

    const psbt = Psbt.fromHex(data.psbt, {
      network,
    });

    // check psbt length
    if (psbt.txInputs.length === 0 || psbt.txOutputs.length === 0) {
      return json(errorResponse(30001));
    }

    if (psbt.txInputs.length !== psbt.txOutputs.length) {
      return json(errorResponse(30002));
    }

    const [runeAsset, utxos, inscriptions] = await Promise.all([
      getRuneInfo(network, data.rune_id),
      getAddressRuneUTXOsByUnisat(network, data.address, data.rune_id),
      getAddressInscriptions(network, data.address),
    ]);

    if (!runeAsset) {
      return json(errorResponse(30013));
    }

    const offers: OfferCreateReqSchemaType[] = [];

    if (psbt.txInputs.length === 1) {
      const psbtValid = validateInputSignature(psbt, 0);

      if (!psbtValid) {
        return json(errorResponse(30008));
      }

      const input = psbt.txInputs[0];
      const inputData = psbt.data.inputs[0];
      const output = psbt.txOutputs[0];

      if (!inputData.witnessUtxo) {
        return json(errorResponse(30003));
      }

      const address = detectScriptToAddressType(
        inputData.witnessUtxo.script.toString("hex"),
        network,
      );

      if (address !== data.address) {
        return json(errorResponse(30004));
      }

      const txid = reverseBuffer(input.hash).toString("hex");
      const vout = input.index;
      const value = inputData.witnessUtxo.value;

      const runeUTXO = utxos.find(
        (utxo) =>
          utxo.txid === txid && utxo.vout === vout && utxo.value === value,
      );

      if (!runeUTXO) {
        return json(errorResponse(30005));
      }

      const inscriptionUTXO = inscriptions.find(
        (inscription) =>
          inscription.utxo.txid === txid &&
          inscription.utxo.vout === vout &&
          inscription.utxo.satoshi === value,
      );

      if (!inscriptionUTXO) {
        return json(errorResponse(30005));
      }

      const unsignedOfferPsbt = new Psbt({ network });
      unsignedOfferPsbt.addInput({
        hash: txid,
        index: vout,
        sequence: input.sequence,
        witnessUtxo: inputData.witnessUtxo,
      });

      unsignedOfferPsbt.addOutput(output);

      psbt.finalizeInput(0);

      const finalizedInput = psbt.data.inputs[0];
      const finalizedOutput = psbt.txOutputs[0];

      const offerPsbt = new Psbt({ network });

      offerPsbt.addInput({
        hash: txid,
        index: vout,
        sequence: input.sequence,
        witnessUtxo: finalizedInput.witnessUtxo,
        sighashType: 131,
        finalScriptWitness: finalizedInput.finalScriptWitness,
      });

      offerPsbt.addOutput(finalizedOutput);

      const SHA256 = createHash("sha256")
        .update(`${txid}:${vout}`)
        .digest("hex");

      offers.push({
        bid: SHA256,
        rune_id: data.rune_id,
        rune_name: runeAsset.rune,
        rune_spaced_name: runeAsset.spacedRune,
        unit_price: parseFloat(data.unit_price),
        amount: 1,
        divisibility: runeAsset.divisibility,
        symbol: runeAsset.symbol,
        total_price: BigInt(finalizedOutput.value),
        lister: data.address,
        funding_receiver: detectScriptToAddressType(
          finalizedOutput.script.toString("hex"),
          network,
        ),
        unsigned_psbt: unsignedOfferPsbt.toHex(),
        psbt: offerPsbt.toHex(),
        status: 1,
        location_txid: txid,
        location_vout: vout,
        location_value: value,
        inscription_id: inscriptionUTXO.inscriptionId,
        inscription_txid: txid,
        inscription_vout: vout,
        collection_name: getCollectionName(runeAsset.spacedRune),
      });
    } else if (psbt.txInputs.length === 2) {
      for (let i = 0; i < psbt.data.inputs.length; i++) {
        const psbtValid = validateInputSignature(psbt, i);

        if (!psbtValid) {
          return json(errorResponse(30008));
        }

        if (!psbt.data.inputs[i].witnessUtxo) {
          return json(errorResponse(30003));
        }

        const address = detectScriptToAddressType(
          psbt.data.inputs[i].witnessUtxo!.script.toString("hex"),
          network,
        );

        if (address !== data.address) {
          return json(errorResponse(30004));
        }
      }

      const runeInput = psbt.txInputs[1];
      const runeInputData = psbt.data.inputs[1];
      const runeOutput = psbt.txOutputs[1];

      const inscriptionInput = psbt.txInputs[0];
      const inscriptionInputData = psbt.data.inputs[0];
      const inscriptionOutput = psbt.txOutputs[0];

      const runeTxid = reverseBuffer(runeInput.hash).toString("hex");
      const runeVout = runeInput.index;
      const runeValue = runeInputData.witnessUtxo!.value;

      const inscriptionTxid = reverseBuffer(inscriptionInput.hash).toString(
        "hex",
      );
      const inscriptionVout = inscriptionInput.index;
      const inscriptionValue = inscriptionInputData.witnessUtxo!.value;

      const runeUTXO = utxos.find(
        (utxo) =>
          utxo.txid === runeTxid &&
          utxo.vout === runeVout &&
          utxo.value === runeValue,
      );

      if (!runeUTXO) {
        return json(errorResponse(30005));
      }

      const inscriptionUTXO = inscriptions.find(
        (inscription) =>
          inscription.utxo.txid === inscriptionTxid &&
          inscription.utxo.vout === inscriptionVout &&
          inscription.utxo.satoshi === inscriptionValue,
      );

      if (!inscriptionUTXO) {
        return json(errorResponse(30005));
      }

      const unsignedOfferPsbt = new Psbt({ network });

      unsignedOfferPsbt.addInput({
        hash: inscriptionTxid,
        index: inscriptionVout,
        sequence: inscriptionInput.sequence,
        witnessUtxo: inscriptionInputData.witnessUtxo,
      });

      unsignedOfferPsbt.addOutput(inscriptionOutput);

      psbt.finalizeInput(0);

      unsignedOfferPsbt.addInput({
        hash: runeTxid,
        index: runeVout,
        sequence: runeInput.sequence,
        witnessUtxo: runeInputData.witnessUtxo,
      });

      unsignedOfferPsbt.addOutput(runeOutput);

      psbt.finalizeInput(1);

      const finalizedRuneInput = psbt.data.inputs[1];
      const finalizedRuneOutput = psbt.txOutputs[1];

      const finalizedInscriptionInput = psbt.data.inputs[0];
      const finalizedInscriptionOutput = psbt.txOutputs[0];

      const offerPsbt = new Psbt({ network });

      offerPsbt.addInput({
        hash: inscriptionTxid,
        index: inscriptionVout,
        sequence: inscriptionInput.sequence,
        witnessUtxo: finalizedInscriptionInput.witnessUtxo,
        sighashType: 131,
        finalScriptWitness: finalizedInscriptionInput.finalScriptWitness,
      });

      offerPsbt.addOutput(finalizedInscriptionOutput);

      offerPsbt.addInput({
        hash: runeTxid,
        index: runeVout,
        sequence: runeInput.sequence,
        witnessUtxo: finalizedRuneInput.witnessUtxo,
        sighashType: 131,
        finalScriptWitness: finalizedRuneInput.finalScriptWitness,
      });

      offerPsbt.addOutput(finalizedRuneOutput);

      const SHA256 = createHash("sha256")
        .update(`${runeTxid}:${runeVout}`)
        .digest("hex");

      offers.push({
        bid: SHA256,
        rune_id: data.rune_id,
        rune_name: runeAsset.rune,
        rune_spaced_name: runeAsset.spacedRune,
        unit_price: parseFloat(data.unit_price),
        amount: 1,
        divisibility: runeAsset.divisibility,
        symbol: runeAsset.symbol,
        total_price:
          BigInt(finalizedRuneOutput.value) +
          BigInt(finalizedInscriptionOutput.value),
        lister: data.address,
        funding_receiver: detectScriptToAddressType(
          finalizedRuneOutput.script.toString("hex"),
          network,
        ),
        unsigned_psbt: unsignedOfferPsbt.toHex(),
        psbt: offerPsbt.toHex(),
        status: 1,
        location_txid: runeTxid,
        location_vout: runeVout,
        location_value: runeValue,
        inscription_id: inscriptionUTXO.inscriptionId,
        inscription_txid: inscriptionTxid,
        inscription_vout: inscriptionVout,
        collection_name: getCollectionName(runeAsset.spacedRune),
      });
    } else {
      return json(errorResponse(30010));
    }

    try {
      offers.forEach((item) => {
        try {
          OfferCreateReqSchema.parse(item);
        } catch (e) {
          throw new Error("List data invalid");
        }
      });

      await DatabaseInstance.$transaction(async () => {
        await DatabaseInstance.activities.createMany({
          data: offers.map((item) => {
            return {
              rune_id: data.rune_id,
              rune_name: runeAsset.rune,
              rune_spaced_name: runeAsset.spacedRune,
              collection_name: item.collection_name,
              item_lister: data.address,
              symbol: runeAsset.symbol,
              amount: item.amount,
              unit_price: item.unit_price,
              total_price: item.total_price,
              type: "list",
              timestamp: dayjs().unix(),
              inscription_id: item.inscription_id,
            };
          }),
        });

        for (const offer of offers) {
          await DatabaseInstance.offers.upsert({
            create: {
              ...offer,
              create_at: dayjs().unix(),
              update_at: dayjs().unix(),
            },
            update: {
              ...offer,
              update_at: dayjs().unix(),
            },
            where: {
              bid: offer.bid,
            },
          });
        }
      });
    } catch (e) {
      console.error(e);
      return json(errorResponse(20001));
    }

    return json({
      code: 0,
      error: false,
      data: null,
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
