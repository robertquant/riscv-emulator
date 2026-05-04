export enum Opcode {
  LUI = 0x37, AUIPC = 0x17, JAL = 0x6F, JALR = 0x67,
  BRANCH = 0x63, LOAD = 0x03, STORE = 0x23,
  OP_IMM = 0x13, OP = 0x33, SYSTEM = 0x73, MISC_MEM = 0x0F,
}

export enum InstType { R, I, S, B, U, J }

export interface DecodedInst {
  type: InstType;
  opcode: number;
  rd: number;
  rs1: number;
  rs2: number;
  funct3: number;
  funct7: number;
  imm: number;
  name: string;
}

function signExtend(val: number, bits: number): number {
  const mask = 1 << (bits - 1);
  return ((val ^ mask) - mask) | 0;
}

function extractBits(inst: number, hi: number, lo: number): number {
  return (inst >>> lo) & ((1 << (hi - lo + 1)) - 1);
}

export function decode(inst: number): DecodedInst {
  const opcode = inst & 0x7F;
  const rd = extractBits(inst, 11, 7);
  const funct3 = extractBits(inst, 14, 12);
  const rs1 = extractBits(inst, 19, 15);
  const rs2 = extractBits(inst, 24, 20);
  const funct7 = extractBits(inst, 31, 25);

  switch (opcode) {
    case Opcode.LUI:
      return { type: InstType.U, opcode, rd, rs1: 0, rs2: 0, funct3: 0, funct7: 0,
        imm: inst & 0xFFFFF000, name: 'lui' };

    case Opcode.AUIPC:
      return { type: InstType.U, opcode, rd, rs1: 0, rs2: 0, funct3: 0, funct7: 0,
        imm: inst & 0xFFFFF000, name: 'auipc' };

    case Opcode.JAL: {
      const imm20 = extractBits(inst, 30, 21);
      const imm11 = extractBits(inst, 20, 20);
      const imm10_1 = extractBits(inst, 19, 12);
      const imm = signExtend((imm20 << 20) | (imm11 << 11) | (imm10_1 << 1), 21);
      return { type: InstType.J, opcode, rd, rs1: 0, rs2: 0, funct3: 0, funct7: 0,
        imm, name: 'jal' };
    }

    case Opcode.JALR: {
      const imm = signExtend(extractBits(inst, 31, 20), 12);
      return { type: InstType.I, opcode, rd, rs1, rs2: 0, funct3, funct7: 0,
        imm, name: 'jalr' };
    }

    case Opcode.BRANCH: {
      const imm12 = extractBits(inst, 31, 31);
      const imm10_5 = extractBits(inst, 30, 25);
      const imm4_1 = extractBits(inst, 11, 8);
      const imm11 = extractBits(inst, 7, 7);
      const imm = signExtend((imm12 << 12) | (imm11 << 11) | (imm10_5 << 5) | (imm4_1 << 1), 13);
      const names: Record<number, string> = { 0: 'beq', 1: 'bne', 4: 'blt', 5: 'bge', 6: 'bltu', 7: 'bgeu' };
      return { type: InstType.B, opcode, rd: 0, rs1, rs2, funct3, funct7: 0,
        imm, name: names[funct3] || 'b??' };
    }

    case Opcode.LOAD: {
      const imm = signExtend(extractBits(inst, 31, 20), 12);
      const names: Record<number, string> = { 0: 'lb', 1: 'lh', 2: 'lw', 4: 'lbu', 5: 'lhu' };
      return { type: InstType.I, opcode, rd, rs1, rs2: 0, funct3, funct7: 0,
        imm, name: names[funct3] || 'l??' };
    }

    case Opcode.STORE: {
      const imm4_0 = extractBits(inst, 11, 7);
      const imm11_5 = extractBits(inst, 31, 25);
      const imm = signExtend((imm11_5 << 5) | imm4_0, 12);
      const names: Record<number, string> = { 0: 'sb', 1: 'sh', 2: 'sw' };
      return { type: InstType.S, opcode, rd: 0, rs1, rs2, funct3, funct7: 0,
        imm, name: names[funct3] || 's??' };
    }

    case Opcode.OP_IMM: {
      const imm = signExtend(extractBits(inst, 31, 20), 12);
      const isShift = funct3 >= 4 && funct3 <= 5;
      const shiftAmt = isShift ? (funct7 & 0x20 ? rs2 : extractBits(inst, 24, 20)) : 0;
      const names: Record<number, string> = {
        0: 'addi', 1: 'slli', 2: 'slti', 3: 'sltiu',
        4: 'xori', 5: (funct7 & 0x20) ? 'srai' : 'srli',
        6: 'ori', 7: 'andi'
      };
      if (funct3 === 1) imm; // slli uses shamt from imm
      if (funct3 === 5) imm; // srli/srai uses shamt from imm
      return { type: InstType.I, opcode, rd, rs1, rs2: 0, funct3, funct7,
        imm, name: names[funct3] || 'op_i??' };
    }

    case Opcode.OP: {
      // M extension: funct7 = 0x01
      if (funct7 === 0x01) {
        const mNames: Record<number, string> = {
          0: 'mul', 1: 'mulh', 2: 'mulhsu', 3: 'mulhu',
          4: 'div', 5: 'divu', 6: 'rem', 7: 'remu',
        };
        return { type: InstType.R, opcode, rd, rs1, rs2, funct3, funct7,
          imm: 0, name: mNames[funct3] || 'm??' };
      }
      const names: Record<string, string> = {
        '0-0': 'add', '0-32': 'sub',
        '1-0': 'sll', '2-0': 'slt', '3-0': 'sltu',
        '4-0': 'xor', '5-0': 'srl', '5-32': 'sra',
        '6-0': 'or', '7-0': 'and',
      };
      const key = `${funct3}-${funct7}`;
      return { type: InstType.R, opcode, rd, rs1, rs2, funct3, funct7,
        imm: 0, name: names[key] || 'op??' };
    }

    case Opcode.SYSTEM: {
      if (funct3 === 0) {
        if (rd === 0 && rs1 === 0 && funct7 === 0) return { type: InstType.I, opcode, rd, rs1, rs2, funct3, funct7, imm: 0, name: 'ecall' };
        if (rd === 0 && rs1 === 0 && funct7 === 1) return { type: InstType.I, opcode, rd, rs1, rs2, funct3, funct7, imm: 0, name: 'ebreak' };
      }
      const csrImm = funct3 >= 4;
      const names: Record<number, string> = { 1: 'csrrw', 2: 'csrrs', 3: 'csrrc', 5: 'csrrwi', 6: 'csrrsi', 7: 'csrrci' };
      const immVal = signExtend(extractBits(inst, 31, 20), 12);
      return { type: InstType.I, opcode, rd, rs1, rs2: 0, funct3, funct7: 0,
        imm: immVal, name: names[funct3] || 'sys??' };
    }

    case Opcode.MISC_MEM:
      return { type: InstType.I, opcode, rd, rs1, rs2: 0, funct3, funct7: 0,
        imm: signExtend(extractBits(inst, 31, 20), 12), name: 'fence' };

    default:
      return { type: InstType.I, opcode, rd, rs1, rs2, funct3, funct7,
        imm: 0, name: `unknown(0x${opcode.toString(16)})` };
  }
}
