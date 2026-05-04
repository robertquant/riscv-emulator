import { Registers } from './registers.js';
import { decode, DecodedInst, Opcode } from './decoder.js';
import { Memory } from '../memory/memory.js';

export interface CPUState {
  pc: number;
  registers: Int32Array;
  currentInst: DecodedInst | null;
  pipeline: { fetch: string; decode: string; execute: string };
  running: boolean;
  cycles: number;
}

export class CPU {
  regs: Registers;
  memory: Memory;
  private running = false;
  private cycles = 0;
  private currentInst: DecodedInst | null = null;
  private pipeline = { fetch: '', decode: '', execute: '' };
  private uartOutput: ((ch: string) => void) | null = null;
  private haltAddr: number = 0;

  constructor(memorySize = 1024 * 1024) {
    this.regs = new Registers();
    this.memory = new Memory(memorySize);
  }

  onUART(fn: (ch: string) => void): void { this.uartOutput = fn; }

  loadProgram(addr: number, code: number[], entryPoint?: number, haltAddr?: number): void {
    for (let i = 0; i < code.length; i++) {
      this.memory.writeWord(addr + i * 4, code[i]);
    }
    this.regs.pc = entryPoint ?? addr;
    this.regs.set(2, this.memory.size - 16); // sp
    this.haltAddr = haltAddr ?? 0;
    this.cycles = 0;
  }

  getState(): CPUState {
    return {
      pc: this.regs.pc,
      registers: this.regs.getAll(),
      currentInst: this.currentInst,
      pipeline: { ...this.pipeline },
      running: this.running,
      cycles: this.cycles,
    };
  }

  step(): boolean {
    if (!this.running && this.cycles === 0) this.running = true;
    if (!this.running) return false;

    // Fetch
    const pc = this.regs.pc;
    const instWord = this.memory.readWord(pc);
    this.pipeline.fetch = `PC=0x${pc.toString(16).padStart(8,'0')}  inst=0x${instWord.toString(16).padStart(8,'0')}`;

    // Decode
    const inst = decode(instWord);
    this.currentInst = inst;
    this.pipeline.decode = `${inst.name} rd=x${inst.rd} rs1=x${inst.rs1} rs2=x${inst.rs2} imm=${inst.imm}`;

    // Execute
    const nextPc = this.execute(inst);
    this.pipeline.execute = `result: pc <- 0x${(nextPc ?? pc + 4).toString(16).padStart(8,'0')}`;

    this.regs.pc = nextPc ?? (pc + 4);
    this.cycles++;

    // Check halt
    if (this.haltAddr && this.regs.pc === this.haltAddr) {
      this.running = false;
      return false;
    }

    return this.running;
  }

  run(maxCycles = Infinity): void {
    while (this.running && this.cycles < maxCycles) {
      if (!this.step()) break;
    }
  }

  stop(): void { this.running = false; }
  reset(): void { this.regs.reset(); this.memory.reset(); this.cycles = 0; this.running = false; }
  get isRunning(): boolean { return this.running; }
  get cycleCount(): number { return this.cycles; }

  private execute(inst: DecodedInst): number | null {
    const { name, rd, rs1, rs2, imm, funct3 } = inst;
    const pc = this.regs.pc;
    let nextPc: number | null = null;

    switch (name) {
      // LUI / AUIPC
      case 'lui':
        this.regs.set(rd, imm); break;
      case 'auipc':
        this.regs.set(rd, (pc + imm) | 0); break;

      // Jumps
      case 'jal':
        this.regs.set(rd, pc + 4);
        nextPc = (pc + imm) >>> 0;
        break;
      case 'jalr':
        this.regs.set(rd, pc + 4);
        nextPc = ((this.regs.get(rs1) + imm) & ~1) >>> 0;
        break;

      // Branches
      case 'beq': if (this.regs.get(rs1) === this.regs.get(rs2)) nextPc = (pc + imm) >>> 0; break;
      case 'bne': if (this.regs.get(rs1) !== this.regs.get(rs2)) nextPc = (pc + imm) >>> 0; break;
      case 'blt': if (this.regs.get(rs1) < this.regs.get(rs2)) nextPc = (pc + imm) >>> 0; break;
      case 'bge': if (this.regs.get(rs1) >= this.regs.get(rs2)) nextPc = (pc + imm) >>> 0; break;
      case 'bltu': if (this.regs.getUnsigned(rs1) < this.regs.getUnsigned(rs2)) nextPc = (pc + imm) >>> 0; break;
      case 'bgeu': if (this.regs.getUnsigned(rs1) >= this.regs.getUnsigned(rs2)) nextPc = (pc + imm) >>> 0; break;

      // Loads
      case 'lb': this.regs.set(rd, this.signExt(this.memory.readByte(this.regs.get(rs1) + imm), 8)); break;
      case 'lh': this.regs.set(rd, this.signExt(this.memory.readHalf(this.regs.get(rs1) + imm), 16)); break;
      case 'lw': this.regs.set(rd, this.memory.readWord(this.regs.get(rs1) + imm) | 0); break;
      case 'lbu': this.regs.set(rd, this.memory.readByte(this.regs.get(rs1) + imm)); break;
      case 'lhu': this.regs.set(rd, this.memory.readHalf(this.regs.get(rs1) + imm)); break;

      // Stores
      case 'sb': this.memory.writeByte(this.regs.get(rs1) + imm, this.regs.get(rs2)); break;
      case 'sh': this.memory.writeHalf(this.regs.get(rs1) + imm, this.regs.get(rs2)); break;
      case 'sw': this.memory.writeWord(this.regs.get(rs1) + imm, this.regs.get(rs2)); break;

      // Immediate arithmetic
      case 'addi': this.regs.set(rd, (this.regs.get(rs1) + imm) | 0); break;
      case 'slti': this.regs.set(rd, this.regs.get(rs1) < imm ? 1 : 0); break;
      case 'sltiu': this.regs.set(rd, this.regs.getUnsigned(rs1) < (imm >>> 0) ? 1 : 0); break;
      case 'xori': this.regs.set(rd, this.regs.get(rs1) ^ imm); break;
      case 'ori': this.regs.set(rd, this.regs.get(rs1) | imm); break;
      case 'andi': this.regs.set(rd, this.regs.get(rs1) & imm); break;
      case 'slli': this.regs.set(rd, this.regs.get(rs1) << (imm & 0x1F)); break;
      case 'srli': this.regs.set(rd, this.regs.getUnsigned(rs1) >>> (imm & 0x1F)); break;
      case 'srai': this.regs.set(rd, this.regs.get(rs1) >> (imm & 0x1F)); break;

      // Register arithmetic
      case 'add': this.regs.set(rd, (this.regs.get(rs1) + this.regs.get(rs2)) | 0); break;
      case 'sub': this.regs.set(rd, (this.regs.get(rs1) - this.regs.get(rs2)) | 0); break;
      case 'sll': this.regs.set(rd, this.regs.get(rs1) << (this.regs.get(rs2) & 0x1F)); break;
      case 'slt': this.regs.set(rd, this.regs.get(rs1) < this.regs.get(rs2) ? 1 : 0); break;
      case 'sltu': this.regs.set(rd, this.regs.getUnsigned(rs1) < this.regs.getUnsigned(rs2) ? 1 : 0); break;
      case 'xor': this.regs.set(rd, this.regs.get(rs1) ^ this.regs.get(rs2)); break;
      case 'srl': this.regs.set(rd, this.regs.getUnsigned(rs1) >>> (this.regs.get(rs2) & 0x1F)); break;
      case 'sra': this.regs.set(rd, this.regs.get(rs1) >> (this.regs.get(rs2) & 0x1F)); break;
      case 'or': this.regs.set(rd, this.regs.get(rs1) | this.regs.get(rs2)); break;
      case 'and': this.regs.set(rd, this.regs.get(rs1) & this.regs.get(rs2)); break;

      // System
      case 'ecall':
        this.handleEcall();
        break;
      case 'ebreak':
        this.running = false;
        break;
      case 'fence':
        break;

      default:
        break;
    }

    return nextPc;
  }

  private signExt(val: number, bits: number): number {
    const mask = 1 << (bits - 1);
    return ((val ^ mask) - mask) | 0;
  }

  private handleEcall(): void {
    const a0 = this.regs.get(10);
    const a7 = this.regs.get(17);
    // Simple syscall: a7=1 = print int, a7=4 = print string, a7=10 = exit, a7=64 = write
    switch (a7) {
      case 1: // print integer
        this.uartOutput?.(String(a0));
        break;
      case 4: { // print string at a0
        let addr = a0;
        let ch: number;
        while ((ch = this.memory.readByte(addr)) !== 0) {
          this.uartOutput?.(String.fromCharCode(ch));
          addr++;
        }
        break;
      }
      case 10: // exit
        this.running = false;
        break;
      case 64: { // write(fd=unused, buf=a1, len=a2)
        const buf = a0; // Actually a1 for buf, but simplified
        const len = this.regs.get(12);
        for (let i = 0; i < len; i++) {
          this.uartOutput?.(String.fromCharCode(this.memory.readByte(this.regs.get(11) + i)));
        }
        this.regs.set(10, len);
        break;
      }
    }
  }
}
