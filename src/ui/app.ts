import { CPU } from '../cpu/cpu.js';
import { assemble } from '../assembler/assembler.js';
import { disassembleAll } from '../disassembler/disassembler.js';
import { REG_NAMES } from '../cpu/registers.js';

export class App {
  private cpu: CPU;
  private animFrame: number = 0;
  private stepMode = false;

  constructor() {
    this.cpu = new CPU();
    this.cpu.onUART((ch: string) => this.appendTerminal(ch));
  }

  init(): void {
    this.loadExample('hello');
    this.bindEvents();
    this.updateRegisters();
    this.updatePipeline();
  }

  private bindEvents(): void {
    document.getElementById('btn-run')?.addEventListener('click', () => this.run());
    document.getElementById('btn-step')?.addEventListener('click', () => this.step());
    document.getElementById('btn-stop')?.addEventListener('click', () => this.stop());
    document.getElementById('btn-reset')?.addEventListener('click', () => this.reset());
    document.getElementById('btn-assemble')?.addEventListener('click', () => this.assembleCode());
    document.getElementById('btn-example')?.addEventListener('change', (e) => {
      this.loadExample((e.target as HTMLSelectElement).value);
    });
  }

  private assembleCode(): boolean {
    const src = (document.getElementById('code-editor') as HTMLTextAreaElement).value;
    const { code, errors, labels } = assemble(src);

    if (errors.length > 0) {
      this.setLog(errors.join('\n'), 'error');
      return false;
    }

    // Show disassembly
    const disasm = disassembleAll(code, 0);
    (document.getElementById('disassembly') as HTMLTextAreaElement).value = disasm;

    // Load into CPU
    this.cpu.reset();
    this.cpu.loadProgram(0, code);

    this.setLog(`Assembled ${code.length} instructions (${code.length * 4} bytes)\nLabels: ${Object.entries(labels).map(([k,v]) => `${k}=0x${(v as number).toString(16)}`).join(', ')}`, 'info');
    this.updateRegisters();
    this.updatePipeline();
    this.updateMemory(0);
    return true;
  }

  private run(): void {
    if (!this.assembleCode()) return;
    this.cpu.run(100000);
    this.updateRegisters();
    this.updatePipeline();
    this.updateMemory(0);
    this.appendLog(`CPU ran ${this.cpu.cycleCount} cycles`);
  }

  private step(): void {
    if (this.cpu.cycleCount === 0) {
      if (!this.assembleCode()) return;
    }
    this.cpu.step();
    this.updateRegisters();
    this.updatePipeline();
    this.updateMemory(0);
  }

  private stop(): void {
    this.cpu.stop();
    cancelAnimationFrame(this.animFrame);
  }

  private reset(): void {
    this.cpu.reset();
    this.updateRegisters();
    this.updatePipeline();
    this.clearTerminal();
    this.setLog('CPU reset', 'info');
  }

  private updateRegisters(): void {
    const state = this.cpu.getState();
    const container = document.getElementById('registers')!;
    let html = `<div class="reg-pc">PC: 0x${state.pc.toString(16).padStart(8, '0')}</div>`;
    html += '<div class="reg-grid">';
    for (let i = 0; i < 32; i++) {
      const val = state.registers[i];
      const changed = this.isRegHighlighted(i, state.pc);
      html += `<div class="reg-item${changed ? ' changed' : ''}">
        <span class="reg-idx">x${i}</span>
        <span class="reg-name">${REG_NAMES[i]}</span>
        <span class="reg-val">0x${(val >>> 0).toString(16).padStart(8, '0')}</span>
        <span class="reg-dec">${val}</span>
      </div>`;
    }
    html += '</div>';
    html += `<div class="reg-footer">Cycles: ${state.cycles}</div>`;
    container.innerHTML = html;
  }

  private prevRegs: Int32Array | null = null;
  private isRegHighlighted(idx: number, _pc: number): boolean {
    const state = this.cpu.getState();
    if (!this.prevRegs) { this.prevRegs = new Int32Array(state.registers); return false; }
    const changed = state.registers[idx] !== this.prevRegs[idx];
    this.prevRegs = new Int32Array(state.registers);
    return changed;
  }

  private updatePipeline(): void {
    const state = this.cpu.getState();
    const container = document.getElementById('pipeline')!;
    const inst = state.currentInst;
    container.innerHTML = `
      <div class="pipe-stage ${state.running ? 'active' : ''}">
        <div class="pipe-label">FETCH</div>
        <div class="pipe-detail">${state.pipeline.fetch || '—'}</div>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="pipe-stage">
        <div class="pipe-label">DECODE</div>
        <div class="pipe-detail">${inst ? `${inst.name} (type: ${inst.type})` : '—'}</div>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="pipe-stage">
        <div class="pipe-label">EXECUTE</div>
        <div class="pipe-detail">${state.pipeline.execute || '—'}</div>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="pipe-stage">
        <div class="pipe-label">WRITEBACK</div>
        <div class="pipe-detail">${inst ? `rd=x${inst.rd} ← result` : '—'}</div>
      </div>
    `;
  }

  private updateMemory(addr: number): void {
    const container = document.getElementById('memory-view')!;
    container.textContent = this.cpu.memory.dump(addr, 256);
  }

  private appendTerminal(ch: string): void {
    const term = document.getElementById('terminal-output')!;
    term.textContent += ch;
    term.scrollTop = term.scrollHeight;
  }

  private clearTerminal(): void {
    (document.getElementById('terminal-output')!).textContent = '';
  }

  private setLog(msg: string, type: string = 'info'): void {
    const log = document.getElementById('log')!;
    log.innerHTML = `<div class="log-${type}">${msg.replace(/\n/g, '<br>')}</div>`;
  }

  private appendLog(msg: string): void {
    const log = document.getElementById('log')!;
    log.innerHTML += `<div class="log-info">${msg}</div>`;
  }

  private loadExample(name: string): void {
    const examples: Record<string, string> = {
      hello: `# Hello World - RISC-V
# Uses ecall to print a string

.data
msg: .string "Hello, RISC-V World!\\n"

.text
main:
    la a0, msg        # load address of msg
    li a7, 4          # ecall 4 = print string
    ecall
    li a7, 10         # ecall 10 = exit
    ecall`,

      fibonacci: `# Fibonacci sequence - RISC-V
# Computes first 10 Fibonacci numbers

.text
main:
    li a0, 0           # fib(0) = 0
    li a1, 1           # fib(1) = 1
    li t0, 10          # count
    li t1, 0           # index

loop:
    # Print current fib number
    li a7, 1
    ecall              # print a0

    add t2, a0, a1     # next = a0 + a1
    mv a0, a1          # a0 = a1
    mv a1, t2          # a1 = next

    addi t1, t1, 1
    blt t1, t0, loop

    li a7, 10
    ecall`,

      factorial: `# Factorial - RISC-V
# Computes 5! = 120

.text
main:
    li a0, 5           # n = 5
    jal ra, factorial  # call factorial(5)
    li a7, 1
    ecall              # print result
    li a7, 10
    ecall

factorial:
    # a0 = n, returns n! in a0
    addi sp, sp, -8    # allocate stack
    sw ra, 4(sp)       # save return address
    sw a0, 0(sp)       # save n

    li t0, 1
    ble a0, t0, base   # if n <= 1, return 1

    addi a0, a0, -1    # n-1
    jal ra, factorial  # factorial(n-1)

    lw t1, 0(sp)       # load original n
    mul a0, a0, t1     # n * factorial(n-1)

    lw ra, 4(sp)
    addi sp, sp, 8
    ret

base:
    li a0, 1
    lw ra, 4(sp)
    addi sp, sp, 8
    ret`,

      sum: `# Sum 1 to 100 - RISC-V
# Computes sum = 1+2+...+100

.text
main:
    li t0, 0           # sum = 0
    li t1, 1           # i = 1
    li t2, 100         # limit

loop:
    add t0, t0, t1     # sum += i
    addi t1, t1, 1     # i++
    ble t1, t2, loop   # while i <= 100

    mv a0, t0          # a0 = sum
    li a7, 1
    ecall              # print sum (should be 5050)
    li a7, 10
    ecall`,

      prime: `# Prime check - RISC-V
# Checks if 17 is prime

.text
main:
    li a0, 17          # number to check
    jal ra, is_prime
    li a7, 1
    ecall              # print result (1=prime)
    li a7, 10
    ecall

is_prime:
    # a0 = n, returns 1 if prime, 0 if not
    li t0, 2
    blt a0, t0, not_prime  # n < 2

check_loop:
    mul t1, t0, t0
    ble t1, a0, check_body
    li a0, 1           # is prime
    ret

check_body:
    rem t2, a0, t0     # n % i
    beq t2, zero, not_prime
    addi t0, t0, 1
    j check_loop

not_prime:
    li a0, 0
    ret`,
    };

    (document.getElementById('code-editor') as HTMLTextAreaElement).value = examples[name] || examples.hello;
  }
}
