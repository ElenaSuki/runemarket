import { isAxiosError } from "axios";

export const errorResponse = (code: number) => {
  return {
    data: null,
    error: true,
    code,
  };
};

export const formatError = (error: unknown) => {
  if (isAxiosError(error)) {
    return error.response?.data;
  } else if (error instanceof Error) {
    console.log(error);
    return ErrorMap[error.message as keyof typeof ErrorMap] || error.message;
  } else if (typeof error === "object" && error && "message" in error) {
    return error.message;
  }

  return "an unknown error occurred";
};

const ErrorMap = {
  "10001": "Bad request",
  "20001": "Internal server error",
  "20002": "Testnet not supported",
  "30001": "No inputs or outputs in psbt",
  "30002": "Inputs and outputs length do not match",
  "30003": "No witness utxo in psbt",
  "30004": "Witness utxo address does not match",
  "30005": "Asset does not owned by this address",
  "30006": "Create offer failed",
  "30007": "Invalid signature",
  "30008": "Invalid input signature",
  "30009": "Invalid rune input",
  "30010": "Invalid offer psbt",
  "30011": "Push tx failed",
  "30012": "Address balance not found this rune",
  "30013": "Rune not found",
  "30014": "Inscription not match",
  "30015": "Check offer failed, please try again",
  "30016": "Invalid transaction",
  "30017": "Some inputs not match offer location",
};
