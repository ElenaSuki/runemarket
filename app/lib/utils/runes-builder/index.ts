import { opcodes } from "bitcoinjs-lib";

import { RuneTags } from "./tag";
import { RuneId, RuneStone } from "./type";

export const encodeOpReturn = (payload: RuneStone) => {
  const encodedOpReturn: number[] = [];
  encodedOpReturn.push(opcodes.OP_RETURN, opcodes.OP_13);
  const encodedPayload = encodeRunestonePayload(payload);
  encodedOpReturn.push(encodedPayload.length);
  encodedOpReturn.push(...encodedPayload);

  return Buffer.from(encodedOpReturn).toString("hex");
};

export const encodeRunestonePayload = (payload: RuneStone) => {
  const encodedArray: number[] = [];

  if (payload.mint) {
    const { mint } = payload;

    if (typeof mint.block === "number" && typeof mint.tx === "number") {
      encodedArray.push(
        ...encodeToVec(RuneTags.Mint),
        ...encodeToVec(mint.block),
        ...encodeToVec(RuneTags.Mint),
        ...encodeToVec(mint.tx),
      );
    }
  }

  if (typeof payload.pointer === "number" && payload.pointer > 0) {
    encodedArray.push(
      ...encodeToVec(RuneTags.Pointer),
      ...encodeToVec(payload.pointer),
    );
  }

  if (payload.edicts && payload.edicts.length > 0) {
    const { edicts } = payload;

    encodedArray.push(...encodeToVec(RuneTags.Body));

    const sortedEdicts = edicts.sort((a, b) => {
      if (a.id.block !== b.id.block) {
        return a.id.block - b.id.block;
      }
      return a.id.tx - b.id.tx;
    });

    let previous: RuneId = { block: 0, tx: 0 };

    sortedEdicts.forEach((edict) => {
      const [block, tx] = deltaBlockAndTx(previous, edict.id);
      encodedArray.push(
        ...encodeToVec(block),
        ...encodeToVec(tx),
        ...encodeToVec(edict.amount),
        ...encodeToVec(edict.output),
      );
      previous = edict.id;
    });
  }

  return encodedArray;
};

export const encodeToVec = (number: bigint | number) => {
  const encodedArray: number[] = [];

  while (BigInt(number) >> 7n > 0n) {
    encodedArray.push(Number((BigInt(number) & 0xffn) | 0x80n));
    number = BigInt(number) >> 7n;
  }

  encodedArray.push(Number(BigInt(number) & 0xffn));

  return encodedArray;
};

export const encodeRunestoneName = (name: string): bigint => {
  let result = 0n;
  let flag = false;
  for (let i = 0; i < name.length; i++) {
    const temp = BigInt(name.charCodeAt(i) - 65);
    if (flag) {
      result = result * 26n + temp + 1n;
    } else {
      result = result * 26n + temp;
      flag = true;
    }
  }
  return result;
};

export const deltaBlockAndTx = (previous: RuneId, next: RuneId): number[] => {
  const blockDelta = next.block - previous.block;
  const txDelta = blockDelta === 0 ? next.tx - previous.tx : next.tx;
  return [blockDelta, txDelta];
};

export const encodeSpacer = (name: string) => {
  let binaryString = "";

  for (let i = 0; i < name.length; i++) {
    if (name[i] === "•") {
      binaryString = binaryString.slice(0, -1) + "1";
    } else if (i < name.length - 1 && name[i + 1] === "•") {
      binaryString += "1";
    } else {
      binaryString += "0";
    }
  }

  binaryString = binaryString.split("").reverse().join("");

  return parseInt(binaryString, 2);
};
