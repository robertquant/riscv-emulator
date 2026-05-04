import { decode } from '../cpu/decoder.js';
import { REG_NAMES } from '../cpu/registers.js';

export function disassemble(inst: number, pc: number): string {
  const d = decode(inst);
  const hex = `0x${(inst >>> 0).toString(16).padStart(8, '0')}`;
  const addr = `0x${pc.toString(16).padStart(8, '0')}`;

  const regName = (idx: number) => REG_NAMES[idx] || `x${idx}`;
  const signedHex = (v: number) => v >= 0 ? `0x${v.toString(16)}` : `-0x${(-v).toString(16)}`;

  switch (d.name) {
    case 'lui': return `${addr}  ${hex}  lui ${regName(d.rd)}, 0x${(d.imm >>> 0).toString(16)}`;
    case 'auipc': return `${addr}  ${hex}  auipc ${regName(d.rd)}, 0x${(d.imm >>> 0).toString(16)}`;
    case 'jal': return `${addr}  ${hex}  jal ${regName(d.rd)}, ${signedHex(d.imm)}`;
    case 'jalr': return `${addr}  ${hex}  jalr ${regName(d.rd)}, ${d.imm}(${regName(d.rs1)})`;
    case 'beq': case 'bne': case 'blt': case 'bge': case 'bltu': case 'bgeu':
      return `${addr}  ${hex}  ${d.name} ${regName(d.rs1)}, ${regName(d.rs2)}, ${signedHex(d.imm)}`;
    case 'lb': case 'lh': case 'lw': case 'lbu': case 'lhu':
      return `${addr}  ${hex}  ${d.name} ${regName(d.rd)}, ${d.imm}(${regName(d.rs1)})`;
    case 'sb': case 'sh': case 'sw':
      return `${addr}  ${hex}  ${d.name} ${regName(d.rs2)}, ${d.imm}(${regName(d.rs1)})`;
    case 'addi': case 'slti': case 'sltiu': case 'xori': case 'ori': case 'andi':
    case 'slli': case 'srli': case 'srai':
      return `${addr}  ${hex}  ${d.name} ${regName(d.rd)}, ${regName(d.rs1)}, ${d.imm}`;
    case 'add': case 'sub': case 'sll': case 'slt': case 'sltu':
    case 'xor': case 'srl': case 'sra': case 'or': case 'and':
    case 'mul': case 'mulh': case 'mulhsu': case 'mulhu':
    case 'div': case 'divu': case 'rem': case 'remu':
      return `${addr}  ${hex}  ${d.name} ${regName(d.rd)}, ${regName(d.rs1)}, ${regName(d.rs2)}`;
    case 'ecall': return `${addr}  ${hex}  ecall`;
    case 'ebreak': return `${addr}  ${hex}  ebreak`;
    case 'fence': return `${addr}  ${hex}  fence`;
    default: return `${addr}  ${hex}  ??? (${d.name})`;
  }
}

export function disassembleAll(code: number[], baseAddr: number = 0): string {
  return code.map((inst, i) => disassemble(inst, baseAddr + i * 4)).join('\n');
}
