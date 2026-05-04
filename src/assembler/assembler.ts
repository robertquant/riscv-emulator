const REG_MAP: Record<string, number> = {
  zero: 0, x0: 0, ra: 1, x1: 1, sp: 2, x2: 2, gp: 3, x3: 3, tp: 4, x4: 4,
  t0: 5, x5: 5, t1: 6, x6: 6, t2: 7, x7: 7,
  s0: 8, fp: 8, x8: 8, s1: 9, x9: 9,
  a0: 10, x10: 10, a1: 11, x11: 11, a2: 12, x12: 12, a3: 13, x13: 13,
  a4: 14, x14: 14, a5: 15, x15: 15, a6: 16, x16: 16, a7: 17, x17: 17,
  s2: 18, x18: 18, s3: 19, x19: 19, s4: 20, x20: 20, s5: 21, x21: 21,
  s6: 22, x22: 22, s7: 23, x23: 23, s8: 24, x24: 24, s9: 25, x25: 25,
  s10: 26, x26: 26, s11: 27, x27: 27,
  t3: 28, x28: 28, t4: 29, x29: 29, t5: 30, x30: 30, t6: 31, x31: 31,
};

function parseReg(s: string): number {
  const r = REG_MAP[s.trim().replace(/,/g, '')];
  if (r === undefined) throw new Error(`Unknown register: ${s}`);
  return r;
}

function parseImm(s: string): number {
  s = s.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
  if (s.startsWith('-0x') || s.startsWith('-0X')) return -parseInt(s.slice(1), 16);
  return parseInt(s, 10);
}

function encR(funct7: number, rs2: number, rs1: number, funct3: number, rd: number): number {
  return (funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | 0x33;
}

function encI(funct3: number, rs1: number, rd: number, imm: number): number {
  return ((imm & 0xFFF) << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | 0x13;
}

function encS(funct3: number, rs1: number, rs2: number, imm: number): number {
  return (((imm >> 5) & 0x7F) << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | ((imm & 0x1F) << 7) | 0x23;
}

function encB(funct3: number, rs1: number, rs2: number, imm: number): number {
  const b12 = (imm >> 12) & 1, b11 = (imm >> 11) & 1;
  const b10_5 = (imm >> 5) & 0x3F, b4_1 = (imm >> 1) & 0xF;
  return (b12 << 31) | (b10_5 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (b4_1 << 8) | (b11 << 7) | 0x63;
}

function encU(opcode: number, rd: number, imm: number): number {
  return (imm & 0xFFFFF000) | (rd << 7) | opcode;
}

function encJ(rd: number, imm: number): number {
  const b20 = (imm >> 20) & 1, b10_1 = (imm >> 1) & 0x3FF;
  const b11 = (imm >> 11) & 1, b19_12 = (imm >> 12) & 0xFF;
  return (b20 << 31) | (b10_1 << 21) | (b11 << 20) | (b19_12 << 12) | (rd << 7) | 0x6F;
}

export function assemble(source: string): { code: number[]; errors: string[]; labels: Record<string, number> } {
  const code: number[] = [];
  const errors: string[] = [];
  const labels: Record<string, number> = {};
  const pendingLabels: { label: string; offset: number }[] = [];

  const lines = source.split('\n');
  const cleanLines: { text: string; lineNum: number }[] = [];

  // First pass: collect labels and clean lines
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.endsWith(':')) {
      labels[line.slice(0, -1).trim()] = cleanLines.length * 4;
      continue;
    }
    if (line.includes(':')) {
      const colonIdx = line.indexOf(':');
      const lbl = line.slice(0, colonIdx).trim();
      labels[lbl] = cleanLines.length * 4;
      line = line.slice(colonIdx + 1).trim();
      if (!line) continue;
    }
    cleanLines.push({ text: line, lineNum: i + 1 });
  }

  // Helper to resolve label/immediate
  function resolveImm(s: string, instOffset: number): number {
    s = s.trim();
    if (REG_MAP[s] !== undefined) return REG_MAP[s]; // shouldn't happen but safety
    // Check if it's a label
    const lbl = labels[s];
    if (lbl !== undefined) {
      return lbl - instOffset;
    }
    return parseImm(s);
  }

  // Second pass: encode instructions
  for (let idx = 0; idx < cleanLines.length; idx++) {
    const { text, lineNum } = cleanLines[idx];
    const offset = idx * 4;
    try {
      const parts = text.split(/\s+/);
      const op = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ').split(',').map(s => s.trim()).filter(Boolean);

      let encoded: number | null = null;

      switch (op) {
        // U-type
        case 'lui': encoded = encU(0x37, parseReg(args[0]), parseImm(args[1])); break;
        case 'auipc': encoded = encU(0x17, parseReg(args[0]), parseImm(args[1])); break;

        // J-type
        case 'jal': encoded = encJ(parseReg(args[0]), resolveImm(args[1], offset)); break;

        // I-type jumps
        case 'jalr': encoded = ((parseImm(args.length > 2 ? args[1] : '0') & 0xFFF) << 20) | (parseReg(args.length > 2 ? args[1] : args[0]) << 15) | (0 << 12) | (parseReg(args[0]) << 7) | 0x67; break;

        // B-type
        case 'beq': encoded = encB(0, parseReg(args[0]), parseReg(args[1]), resolveImm(args[2], offset)); break;
        case 'bne': encoded = encB(1, parseReg(args[0]), parseReg(args[1]), resolveImm(args[2], offset)); break;
        case 'blt': encoded = encB(4, parseReg(args[0]), parseReg(args[1]), resolveImm(args[2], offset)); break;
        case 'bge': encoded = encB(5, parseReg(args[0]), parseReg(args[1]), resolveImm(args[2], offset)); break;
        case 'bltu': encoded = encB(6, parseReg(args[0]), parseReg(args[1]), resolveImm(args[2], offset)); break;
        case 'bgeu': encoded = encB(7, parseReg(args[0]), parseReg(args[1]), resolveImm(args[2], offset)); break;

        // I-type loads
        case 'lb': encoded = ((parseImm(args[1]) & 0xFFF) << 20) | (parseReg(args[0]) << 15) | (0 << 12) | (parseReg(args[0]) << 7) | 0x03;
          // Fix: lb rd, offset(rs1) format
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = ((parseImm(m[1]) & 0xFFF) << 20) | (parseReg(m[2]) << 15) | (0 << 12) | (parseReg(args[0]) << 7) | 0x03; }
          break;
        case 'lh':
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = ((parseImm(m[1]) & 0xFFF) << 20) | (parseReg(m[2]) << 15) | (1 << 12) | (parseReg(args[0]) << 7) | 0x03; }
          break;
        case 'lw':
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = ((parseImm(m[1]) & 0xFFF) << 20) | (parseReg(m[2]) << 15) | (2 << 12) | (parseReg(args[0]) << 7) | 0x03; }
          break;
        case 'lbu':
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = ((parseImm(m[1]) & 0xFFF) << 20) | (parseReg(m[2]) << 15) | (4 << 12) | (parseReg(args[0]) << 7) | 0x03; }
          break;
        case 'lhu':
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = ((parseImm(m[1]) & 0xFFF) << 20) | (parseReg(m[2]) << 15) | (5 << 12) | (parseReg(args[0]) << 7) | 0x03; }
          break;

        // S-type stores
        case 'sb':
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = encS(0, parseReg(m[2]), parseReg(args[0]), parseImm(m[1])); }
          break;
        case 'sh':
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = encS(1, parseReg(m[2]), parseReg(args[0]), parseImm(m[1])); }
          break;
        case 'sw':
          { const m = args[1].match(/(-?\w+)\((\w+)\)/);
            if (m) encoded = encS(2, parseReg(m[2]), parseReg(args[0]), parseImm(m[1])); }
          break;

        // I-type ALU
        case 'addi': encoded = encI(0, parseReg(args[1]), parseReg(args[0]), parseImm(args[2])); break;
        case 'slti': encoded = encI(2, parseReg(args[1]), parseReg(args[0]), parseImm(args[2])); break;
        case 'sltiu': encoded = encI(3, parseReg(args[1]), parseReg(args[0]), parseImm(args[2])); break;
        case 'xori': encoded = encI(4, parseReg(args[1]), parseReg(args[0]), parseImm(args[2])); break;
        case 'ori': encoded = encI(6, parseReg(args[1]), parseReg(args[0]), parseImm(args[2])); break;
        case 'andi': encoded = encI(7, parseReg(args[1]), parseReg(args[0]), parseImm(args[2])); break;
        case 'slli': encoded = encI(1, parseReg(args[1]), parseReg(args[0]), parseImm(args[2]) & 0x1F); break;
        case 'srli': encoded = encI(5, parseReg(args[1]), parseReg(args[0]), parseImm(args[2]) & 0x1F); break;
        case 'srai': encoded = ((0x20 | (parseImm(args[2]) & 0x1F)) << 20) | (parseReg(args[1]) << 15) | (5 << 12) | (parseReg(args[0]) << 7) | 0x13; break;

        // R-type ALU
        case 'add': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 0, parseReg(args[0])); break;
        case 'sub': encoded = encR(0x20, parseReg(args[2]), parseReg(args[1]), 0, parseReg(args[0])); break;
        case 'sll': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 1, parseReg(args[0])); break;
        case 'slt': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 2, parseReg(args[0])); break;
        case 'sltu': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 3, parseReg(args[0])); break;
        case 'xor': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 4, parseReg(args[0])); break;
        case 'srl': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 5, parseReg(args[0])); break;
        case 'sra': encoded = encR(0x20, parseReg(args[2]), parseReg(args[1]), 5, parseReg(args[0])); break;
        case 'or': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 6, parseReg(args[0])); break;
        case 'and': encoded = encR(0, parseReg(args[2]), parseReg(args[1]), 7, parseReg(args[0])); break;

        // Pseudo-instructions
        case 'nop': encoded = 0x00000013; break;
        case 'li': {
          const val = parseImm(args[1]);
          const rd = parseReg(args[0]);
          if ((val & 0xFFF) === 0 || (val >= -2048 && val <= 2047)) {
            encoded = val >= -2048 && val <= 2047 ? encI(0, 0, rd, val) : encU(0x37, rd, val);
          } else {
            // lui + addi
            code.push(encU(0x37, rd, val));
            encoded = encI(0, rd, rd, val & 0xFFF);
          }
          break;
        }
        case 'mv': encoded = encI(0, parseReg(args[1]), parseReg(args[0]), 0); break;
        case 'j': encoded = encJ(0, resolveImm(args[0], offset)); break;
        case 'jr': encoded = ((0 & 0xFFF) << 20) | (parseReg(args[0]) << 15) | (0 << 12) | (0 << 7) | 0x67; break;
        case 'ret': encoded = encJ(0, 0); encoded = ((0 & 0xFFF) << 20) | (1 << 15) | (0 << 12) | (0 << 7) | 0x67; break;
        case 'call': encoded = encJ(1, resolveImm(args[0], offset)); break;
        case 'ecall': encoded = 0x00000073; break;
        case 'ebreak': encoded = 0x00100073; break;

        // Data directives
        case '.word':
          encoded = parseImm(args[0]);
          break;
        case '.byte':
          // Handle .byte by encoding as a word (simplified)
          encoded = parseImm(args[0]) & 0xFF;
          break;
        case '.string':
        case '.asciz':
        case '.ascii': {
          const str = args.join(' ').replace(/^"|"$/g, '');
          for (let c = 0; c < str.length; c++) {
            code.push(str.charCodeAt(c));
          }
          if (op === '.asciz') code.push(0);
          continue;
        }

        default:
          errors.push(`Line ${lineNum}: Unknown instruction '${op}'`);
      }

      if (encoded !== null) code.push(encoded);
    } catch (e: any) {
      errors.push(`Line ${lineNum}: ${e.message}`);
    }
  }

  return { code, errors, labels };
}
