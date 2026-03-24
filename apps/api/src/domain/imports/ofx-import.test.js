import { describe, expect, it } from "vitest";
import { parseOfxRows } from "./ofx-import.js";

describe("ofx import parser", () => {
  it("extrai transacoes de OFX SGML", () => {
    const content = [
      "OFXHEADER:100",
      "DATA:OFXSGML",
      "<OFX>",
      "<BANKMSGSRSV1>",
      "<STMTTRNRS>",
      "<STMTRS>",
      "<BANKTRANLIST>",
      "<STMTTRN>",
      "<TRNTYPE>CREDIT",
      "<DTPOSTED>20260205000000[-3:BRT]",
      "<TRNAMT>2812.99",
      "<FITID>ABC123",
      "<MEMO>PGTO INSS 01776829899",
      "</STMTTRN>",
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260206000000[-3:BRT]",
      "<TRNAMT>-15.98",
      "<FITID>XYZ456",
      "<NAME>PIX QRS UBER DO BRA",
      "</STMTTRN>",
      "</BANKTRANLIST>",
    ].join("\n");

    const rows = parseOfxRows(Buffer.from(content, "utf8"));

    expect(rows).toEqual([
      {
        line: 1,
        raw: {
          date: "2026-02-05",
          type: "Entrada",
          value: "2812.99",
          description: "PGTO INSS 01776829899",
          notes: "FITID ABC123",
          category: "",
        },
      },
      {
        line: 2,
        raw: {
          date: "2026-02-06",
          type: "Saida",
          value: "15.98",
          description: "PIX QRS UBER DO BRA",
          notes: "FITID XYZ456",
          category: "",
        },
      },
    ]);
  });

  it("usa o sinal do valor quando o TRNTYPE nao ajuda", () => {
    const content = [
      "<STMTTRN>",
      "<TRNTYPE>OTHER",
      "<DTPOSTED>20260310000000",
      "<TRNAMT>-99.90",
      "<MEMO>TARIFA BANCARIA",
      "</STMTTRN>",
    ].join("\n");

    const rows = parseOfxRows(Buffer.from(content, "utf8"));

    expect(rows[0].raw.type).toBe("Saida");
    expect(rows[0].raw.value).toBe("99.90");
  });
});
