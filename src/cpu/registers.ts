export const REG_NAMES = [
  'zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2',
  's0/fp', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5',
  'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7',
  's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6',
];

export class Registers {
  private regs: Int32Array;
  private _pc: number = 0;

  constructor() {
    this.regs = new Int32Array(32);
  }

  get pc(): number { return this._pc; }
  set pc(v: number) { this._pc = v >>> 0; }

  get(idx: number): number {
    if (idx === 0) return 0;
    return this.regs[idx];
  }

  set(idx: number, val: number): void {
    if (idx !== 0) {
      this.regs[idx] = val | 0;
    }
  }

  getUnsigned(idx: number): number {
    if (idx === 0) return 0;
    return this.regs[idx] >>> 0;
  }

  getAll(): Int32Array {
    return new Int32Array(this.regs);
  }

  reset(): void {
    this.regs.fill(0);
    this._pc = 0;
  }
}
