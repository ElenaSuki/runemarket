export enum Flag {
  Etching = 0,
  Terms = 1,
  Turbo = 2,
  Cenotaph = 127,
}

const maskFlag = (flag: Flag) => {
  return 1 << flag;
};

export const setFlag = (target: number, flag: Flag) => {
  return target | maskFlag(flag);
};
