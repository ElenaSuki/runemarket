import { ActionFunction, json } from "@remix-run/node";
import { Psbt, networks } from "bitcoinjs-lib";
import { createHash } from "crypto";
import dayjs from "dayjs";
import { z } from "zod";

import {
  getAddressRuneUTXOsByUnisat,
  getRuneInfo,
} from "@/lib/apis/unisat/api";
import DatabaseInstance from "@/lib/server/prisma.server";
import {
  OfferCreateReqSchema,
  OfferCreateReqSchemaType,
} from "@/lib/types/market";
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

    const [runeAsset, utxos] = await Promise.all([
      getRuneInfo(network, data.rune_id),
      getAddressRuneUTXOsByUnisat(network, data.address, data.rune_id),
    ]);

    if (!runeAsset) {
      return json(errorResponse(30013));
    }

    const validRunes: {
      txid: string;
      vout: number;
      value: number;
      amount: string;
    }[] = [];

    utxos.forEach((utxo) => {
      if (utxo.runes.length !== 1) return;

      const rune = utxo.runes[0];

      validRunes.push({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        amount: rune.amount,
      });
    });

    const offers: OfferCreateReqSchemaType[] = [];

    for (let i = 0; i < psbt.txInputs.length; i++) {
      // check psbt input signature
      const psbtValid = validateInputSignature(psbt, i);

      if (!psbtValid) {
        return json(errorResponse(30008));
      }

      const input = psbt.txInputs[i];
      const inputData = psbt.data.inputs[i];
      const output = psbt.txOutputs[i];

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

      // check rune valid
      const txid = reverseBuffer(input.hash).toString("hex");
      const vout = input.index;
      const value = inputData.witnessUtxo.value;

      const utxoValid = validRunes.find(
        (rune) =>
          rune.txid === txid && rune.vout === vout && rune.value === value,
      );

      if (!utxoValid) {
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

      psbt.finalizeInput(i);

      const finalizedInput = psbt.data.inputs[i];
      const finalizedOutput = psbt.txOutputs[i];

      // split offer psbt
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
        amount: parseInt(utxoValid.amount),
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
      });
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

        if (runeAsset.supply !== "1") {
          const token = await DatabaseInstance.rune_token.findFirst({
            where: {
              rune_id: data.rune_id,
            },
          });

          if (!token) {
            await DatabaseInstance.rune_token.create({
              data: {
                rune_id: data.rune_id,
                name: runeAsset.rune || "",
                spaced_name: runeAsset.spacedRune || "",
                divisibility: runeAsset.divisibility || 0,
                symbol: runeAsset.symbol || "",
                etch_tx_hash: runeAsset.etching || "",
                supply: runeAsset.supply || "0",
                holders: runeAsset.holders || 0,
                sort: 0,
              },
            });
          }
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
