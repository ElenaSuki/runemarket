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
import { SUPPORT_TESTNET } from "@/lib/config";
import DatabaseInstance from "@/lib/server/prisma.server";
import {
  OfferCreateReqSchema,
  OfferCreateReqSchemaType,
} from "@/lib/types/market";
import {
  getCollectionName,
  getNonBundlesCollectionName,
  sleep,
} from "@/lib/utils";
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

    if (!SUPPORT_TESTNET && isTestnetAddress(data.address)) {
      return json(errorResponse(20002));
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

    // check psbt input signature
    for (let i = 0; i < psbt.txInputs.length; i++) {
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

    const runeAsset = await getRuneInfo(network, data.rune_id);

    const utxos = await getAddressRuneUTXOsByUnisat(
      network,
      data.address,
      data.rune_id,
    );

    if (utxos.length !== 1 || utxos[0].runes.length !== 1) {
      return json(errorResponse(30018));
    }

    await sleep(400);

    const inscriptions = await getAddressInscriptions(network, data.address);

    const offerPsbt = new Psbt({
      network,
    });
    const unsignedOfferPsbt = new Psbt({ network });
    const offers: OfferCreateReqSchemaType[] = [];

    let nonBundle = false;
    let isMerged = false;

    // first input
    const txInputI = psbt.txInputs[0];
    const txOutputI = psbt.txOutputs[0];
    const txInputDataI = psbt.data.inputs[0];
    const txidI = reverseBuffer(txInputI.hash).toString("hex");
    const voutI = txInputI.index;
    const valueI = txInputDataI.witnessUtxo!.value;

    const inscriptionUTXO = inscriptions.find(
      (inscription) =>
        inscription.utxo.txid === txidI &&
        inscription.utxo.vout === voutI &&
        inscription.utxo.satoshi === valueI,
    );

    if (!inscriptionUTXO) {
      // only rune
      nonBundle = true;

      // only one input
      if (psbt.txInputs.length !== 1) {
        return json(errorResponse(30019));
      }

      // input must be rune item
      const runeUTXO = utxos.find(
        (utxo) =>
          utxo.txid === txidI && utxo.vout === voutI && utxo.value === valueI,
      );

      if (!runeUTXO) {
        return json(errorResponse(30019));
      }
    } else {
      // merged rune item
      const runeUTXO = utxos.find(
        (utxo) =>
          utxo.txid === txidI && utxo.vout === voutI && utxo.value === valueI,
      );

      if (runeUTXO) {
        isMerged = true;

        if (psbt.txInputs.length !== 1) {
          return json(errorResponse(30019));
        }
      }
    }

    if (nonBundle) {
      const runeValid = await DatabaseInstance.rune_collection_item.findUnique({
        select: {
          valid: true,
        },
        where: {
          rune_id: data.rune_id,
        },
      });

      // only rune process
      unsignedOfferPsbt.addInput({
        hash: txidI,
        index: voutI,
        sequence: txInputI.sequence,
        witnessUtxo: txInputDataI.witnessUtxo,
      });

      unsignedOfferPsbt.addOutput(txOutputI);

      psbt.finalizeInput(0);

      const finalizedInput = psbt.data.inputs[0];
      const finalizedOutput = psbt.txOutputs[0];

      offerPsbt.addInput({
        hash: txidI,
        index: voutI,
        sequence: txInputI.sequence,
        witnessUtxo: finalizedInput.witnessUtxo,
        sighashType: 131,
        finalScriptWitness: finalizedInput.finalScriptWitness,
      });

      offerPsbt.addOutput(finalizedOutput);

      const SHA256 = createHash("sha256")
        .update(`${txidI}:${voutI}`)
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
        location_txid: txidI,
        location_vout: voutI,
        location_value: valueI,
        collection_name: runeValid?.valid
          ? getNonBundlesCollectionName(runeAsset.spacedRune)
          : "",
        inscription_id: "",
        inscription_txid: "",
        inscription_vout: 0,
      });
    } else {
      if (isMerged) {
        unsignedOfferPsbt.addInput({
          hash: txidI,
          index: voutI,
          sequence: txInputI.sequence,
          witnessUtxo: txInputDataI.witnessUtxo,
        });

        unsignedOfferPsbt.addOutput(txOutputI);

        psbt.finalizeInput(0);

        const finalizedInput = psbt.data.inputs[0];
        const finalizedOutput = psbt.txOutputs[0];

        offerPsbt.addInput({
          hash: txidI,
          index: voutI,
          sequence: txInputI.sequence,
          witnessUtxo: finalizedInput.witnessUtxo,
          sighashType: 131,
          finalScriptWitness: finalizedInput.finalScriptWitness,
        });

        offerPsbt.addOutput(finalizedOutput);

        const SHA256 = createHash("sha256")
          .update(`${txidI}:${voutI}`)
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
          location_txid: txidI,
          location_vout: voutI,
          location_value: valueI,
          inscription_id: inscriptionUTXO!.inscriptionId,
          inscription_txid: txidI,
          inscription_vout: voutI,
          collection_name: getCollectionName(runeAsset.spacedRune),
        });
      } else {
        if (psbt.txInputs.length !== 2) {
          return json(errorResponse(30019));
        }

        const txInputII = psbt.txInputs[1];
        const txOutputII = psbt.txOutputs[1];
        const txInputDataII = psbt.data.inputs[1];
        const txidII = reverseBuffer(txInputII.hash).toString("hex");
        const voutII = txInputII.index;
        const valueII = txInputDataII.witnessUtxo!.value;

        const runeUTXO = utxos.find(
          (utxo) =>
            utxo.txid === txidII &&
            utxo.vout === voutII &&
            utxo.value === valueII,
        );

        if (!runeUTXO) {
          return json(errorResponse(30019));
        }

        unsignedOfferPsbt.addInput({
          hash: txidI,
          index: voutI,
          sequence: txInputI.sequence,
          witnessUtxo: txInputDataI.witnessUtxo,
        });

        unsignedOfferPsbt.addOutput(txOutputI);

        psbt.finalizeInput(0);

        unsignedOfferPsbt.addInput({
          hash: txidII,
          index: voutII,
          sequence: txInputII.sequence,
          witnessUtxo: txInputDataII.witnessUtxo,
        });

        unsignedOfferPsbt.addOutput(txOutputII);

        psbt.finalizeInput(1);

        const finalizedInscriptionInput = psbt.data.inputs[0];
        const finalizedInscriptionOutput = psbt.txOutputs[0];

        const finalizedRuneInput = psbt.data.inputs[1];
        const finalizedRuneOutput = psbt.txOutputs[1];

        offerPsbt.addInputs([
          {
            hash: txidI,
            index: voutI,
            sequence: txInputI.sequence,
            witnessUtxo: finalizedInscriptionInput.witnessUtxo,
            sighashType: 131,
            finalScriptWitness: finalizedInscriptionInput.finalScriptWitness,
          },
          {
            hash: txidII,
            index: voutII,
            sequence: txInputII.sequence,
            witnessUtxo: finalizedRuneInput.witnessUtxo,
            sighashType: 131,
            finalScriptWitness: finalizedRuneInput.finalScriptWitness,
          },
        ]);

        offerPsbt.addOutputs([finalizedInscriptionOutput, finalizedRuneOutput]);

        const SHA256 = createHash("sha256")
          .update(`${txidI}:${voutI}`)
          .update(`${txidII}:${voutII}`)
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
          location_txid: txidII,
          location_vout: voutII,
          location_value: valueII,
          inscription_id: inscriptionUTXO!.inscriptionId,
          inscription_txid: txidI,
          inscription_vout: voutI,
          collection_name: getCollectionName(runeAsset.spacedRune),
        });
      }
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
