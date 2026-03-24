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

  it("lanca erro em buffer vazio — sem bloco STMTTRN", () => {
    expect(() => parseOfxRows(Buffer.from("", "utf8"))).toThrow(
      "Nenhuma transacao reconhecida no OFX.",
    );
  });

  it("lanca erro em conteudo OFX sem transacoes validas", () => {
    const garbage = "OFXHEADER:100\nDATA:OFXSGML\n<OFX>\n<BANKMSGSRSV1>\n</BANKMSGSRSV1>\n</OFX>";
    expect(() => parseOfxRows(Buffer.from(garbage, "utf8"))).toThrow(
      "Nenhuma transacao reconhecida no OFX.",
    );
  });

  it("lanca erro quando TRNAMT esta ausente ou invalido", () => {
    const content = [
      "<STMTTRN>",
      "<TRNTYPE>CREDIT",
      "<DTPOSTED>20260205000000",
      "<TRNAMT>abc",
      "<MEMO>PGTO INVALIDO",
      "</STMTTRN>",
    ].join("\n");

    expect(() => parseOfxRows(Buffer.from(content, "utf8"))).toThrow(
      "Transacao OFX com valor invalido.",
    );
  });

  it("lanca erro quando arquivo excede 2000 transacoes", () => {
    const blocks = Array.from(
      { length: 2001 },
      (_, i) => `<STMTTRN>\n<TRNTYPE>CREDIT\n<TRNAMT>1.00\n<FITID>ID${i}\n</STMTTRN>`,
    ).join("\n");

    expect(() => parseOfxRows(Buffer.from(blocks, "utf8"))).toThrow(
      "Arquivo excede o limite de 2000 linhas.",
    );
  });
});
