export interface StockOption {
  label: string;
  value: string;
}

export const AVAILABLE_STOCK_CODES: StockOption[] = [
  { label: "BBCA", value: "BBCA" },
  { label: "BBRI", value: "BBRI" },
  { label: "BMRI", value: "BMRI" },
  { label: "BBNI", value: "BBNI" },
  { label: "TLKM", value: "TLKM" },
  { label: "ASII", value: "ASII" },
  { label: "ADRO", value: "ADRO" },
  { label: "AMMN", value: "AMMN" },
  { label: "ANTM", value: "ANTM" },
  { label: "ARTO", value: "ARTO" },
  { label: "BRIS", value: "BRIS" },
  { label: "BRPT", value: "BRPT" },
  { label: "BUKA", value: "BUKA" },
  { label: "CPIN", value: "CPIN" },
  { label: "GOTO", value: "GOTO" },
  { label: "ICBP", value: "ICBP" },
  { label: "INCO", value: "INCO" },
  { label: "INDF", value: "INDF" },
  { label: "INKP", value: "INKP" },
  { label: "ISAT", value: "ISAT" },
  { label: "KLBF", value: "KLBF" },
  { label: "MDKA", value: "MDKA" },
  { label: "MEDC", value: "MEDC" },
  { label: "PGAS", value: "PGAS" },
  { label: "PTBA", value: "PTBA" },
  { label: "SMGR", value: "SMGR" },
  { label: "UNTR", value: "UNTR" },
  { label: "UNVR", value: "UNVR" },
];

export const DEFAULT_STOCK_CODE = "BBCA";
