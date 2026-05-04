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

      bubblesort: `# Bubble Sort - RISC-V
# Sorts an array and prints the result

.data
arr: .word 64, 25, 12, 22, 11, 90, 45

.text
main:
    la s0, arr
    li s1, 7          # array length
    li s2, 1          # swapped flag

outer:
    beqz s2, done
    li s2, 0
    li t0, 0

inner:
    addi t1, s1, -1
    bge t0, t1, outer
    slli t2, t0, 2
    add t3, s0, t2
    lw t4, 0(t3)
    lw t5, 4(t3)
    ble t4, t5, skip
    sw t5, 0(t3)
    sw t4, 4(t3)
    li s2, 1
skip:
    addi t0, t0, 1
    j inner

done:
    li t0, 0
print_loop:
    bge t0, s1, exit
    slli t2, t0, 2
    add t3, s0, t2
    lw a0, 0(t3)
    li a7, 1
    ecall
    li a0, 32
    li a7, 11
    ecall
    addi t0, t0, 1
    j print_loop

exit:
    li a7, 10
    ecall`,

      gcd: `# GCD (Greatest Common Divisor) - RISC-V
# Computes GCD(48, 18) = 6 using Euclidean algorithm

.text
main:
    li a0, 48          # a = 48
    li a1, 18          # b = 18

gcd_loop:
    beqz a1, done      # if b == 0, a is GCD
    rem t0, a0, a1     # t0 = a % b
    mv a0, a1          # a = b
    mv a1, t0          # b = a % b
    j gcd_loop

done:
    # a0 now holds GCD
    li a7, 34
    ecall              # print hex
    li a0, 10
    li a7, 11
    ecall
    li a7, 10
    ecall`,

      power: `# Power Function - RISC-V
# Computes 2^10 = 1024

.text
main:
    li a0, 2           # base
    li a1, 10          # exponent
    jal ra, power

    # Print result
    li a7, 1
    ecall
    li a0, 10
    li a7, 11
    ecall
    li a7, 10
    ecall

# power(base, exp) -> base^exp
power:
    addi sp, sp, -8
    sw ra, 4(sp)
    sw s0, 0(sp)

    li s0, 1           # result = 1
    mv t0, a0          # t0 = base
    mv t1, a1          # t1 = exp

pow_loop:
    beqz t1, pow_done
    mul s0, s0, t0     # result *= base
    addi t1, t1, -1
    j pow_loop

pow_done:
    mv a0, s0
    lw s0, 0(sp)
    lw ra, 4(sp)
    addi sp, sp, 8
    ret`,

      strcpy: `# String Copy - RISC-V
# Copies "Hello!" to another buffer and prints both

.data
src: .string "Hello!"
dst: .space  16

.text
main:
    la a0, src
    la a1, dst

copy_loop:
    lb t0, 0(a0)
    sb t0, 0(a1)
    beqz t0, copy_done
    addi a0, a0, 1
    addi a1, a1, 1
    j copy_loop

copy_done:
    # Print source
    la a0, src
    li a7, 4
    ecall
    li a0, 10
    li a7, 11
    ecall

    # Print copy
    la a0, dst
    li a7, 4
    ecall
    li a0, 10
    li a7, 11
    ecall

    li a7, 10
    ecall`,

      strlen: `# String Length Calculator - RISC-V
# Counts characters in "RISC-V" (should be 6)

.data
str1: .string "RISC-V"
str2: .string "Hello, World!"

.text
main:
    # First string
    la a0, str1
    jal ra, strlen
    mv s0, a0
    li a7, 1
    ecall
    li a0, 10
    li a7, 11
    ecall

    # Second string
    la a0, str2
    jal ra, strlen
    li a7, 1
    ecall
    li a0, 10
    li a7, 11
    ecall

    li a7, 10
    ecall

# strlen(s) -> length
strlen:
    li t0, 0
len_loop:
    lb t1, 0(a0)
    beqz t1, len_done
    addi a0, a0, 1
    addi t0, t0, 1
    j len_loop
len_done:
    mv a0, t0
    ret`,

      fizzbuzz: `# FizzBuzz - RISC-V
# Prints FizzBuzz from 1 to 20

.data
fizz: .string "Fizz"
buzz: .string "Buzz"
nl:   .string "\\n"

.text
main:
    li s0, 1           # i = 1
    li s1, 21          # limit

loop:
    bge s0, s1, exit

    # Check FizzBuzz
    li t0, 15
    rem t1, s0, t0
    beqz t1, print_fizzbuzz

    # Check Fizz
    li t0, 3
    rem t1, s0, t0
    beqz t1, print_fizz

    # Check Buzz
    li t0, 5
    rem t1, s0, t0
    beqz t1, print_buzz

    # Print number
    mv a0, s0
    li a7, 1
    ecall
    j print_nl

print_fizzbuzz:
    la a0, fizz
    li a7, 4
    ecall
    la a0, buzz
    li a7, 4
    ecall
    j print_nl

print_fizz:
    la a0, fizz
    li a7, 4
    ecall
    j print_nl

print_buzz:
    la a0, buzz
    li a7, 4
    ecall

print_nl:
    li a0, 10
    li a7, 11
    ecall

    addi s0, s0, 1
    j loop

exit:
    li a7, 10
    ecall`,

      binary_search: `# Binary Search - RISC-V
# Searches for 22 in sorted array [5, 11, 12, 22, 25, 45, 64]
# Returns index (3) if found

.data
arr: .word 5, 11, 12, 22, 25, 45, 64

.text
main:
    la a0, arr          # array base
    li a1, 0            # low = 0
    li a2, 6            # high = 6
    li a3, 22           # target = 22
    jal ra, bsearch

    # Print result (index or -1)
    li a7, 1
    ecall
    li a0, 10
    li a7, 11
    ecall
    li a7, 10
    ecall

# bsearch(arr, low, high, target) -> index
bsearch:
    addi sp, sp, -12
    sw ra, 8(sp)
    sw s0, 4(sp)
    sw s1, 0(sp)

    bgt a1, a2, not_found

    # mid = (low + high) / 2
    add t0, a1, a2
    srli t0, t0, 1      # mid = (low+high)/2
    mv s0, t0           # save mid

    # arr[mid]
    slli t1, t0, 2
    add t1, a0, t1
    lw t2, 0(t1)        # t2 = arr[mid]

    beq t2, a3, found    # if arr[mid] == target

    blt t2, a3, search_right

    # search left: high = mid - 1
    addi a2, s0, -1
    jal ra, bsearch
    j bs_done

search_right:
    # search right: low = mid + 1
    addi a1, s0, 1
    jal ra, bsearch
    j bs_done

found:
    mv a0, s0
    j bs_done

not_found:
    li a0, -1

bs_done:
    lw s1, 0(sp)
    lw s0, 4(sp)
    lw ra, 8(sp)
    addi sp, sp, 12
    ret`,

      countdown: `# Countdown Timer - RISC-V
# Counts down from 10 to 1, then prints "Go!"

.data
go_msg: .string "Go!"

.text
main:
    li s0, 10          # counter = 10

count_loop:
    blez s0, go
    mv a0, s0
    li a7, 1           # print number
    ecall
    li a0, 32          # space
    li a7, 11
    ecall
    addi s0, s0, -1
    j count_loop

go:
    la a0, go_msg
    li a7, 4
    ecall
    li a0, 10
    li a7, 11
    ecall
    li a7, 10
    ecall`,

      sum_array: `# Sum Array - RISC-V
# Sums array [10, 20, 30, 40, 50] = 150

.data
arr: .word 10, 20, 30, 40, 50

.text
main:
    la t0, arr          # array base
    li t1, 5            # count
    li t2, 0            # sum = 0

sum_loop:
    beqz t1, done
    lw t3, 0(t0)        # load element
    add t2, t2, t3      # sum += element
    addi t0, t0, 4      # next element
    addi t1, t1, -1
    j sum_loop

done:
    mv a0, t2
    li a7, 1
    ecall
    li a0, 10
    li a7, 11
    ecall
    li a7, 10
    ecall`,

      max_array: `# Find Maximum - RISC-V
# Finds max in [23, 67, 12, 89, 45, 34] = 89

.data
arr: .word 23, 67, 12, 89, 45, 34

.text
main:
    la t0, arr
    li t1, 6
    lw t2, 0(t0)        # max = arr[0]
    addi t0, t0, 4
    addi t1, t1, -1

max_loop:
    beqz t1, done
    lw t3, 0(t0)
    ble t3, t2, skip     # if arr[i] <= max, skip
    mv t2, t3            # max = arr[i]
skip:
    addi t0, t0, 4
    addi t1, t1, -1
    j max_loop

done:
    mv a0, t2
    li a7, 1
    ecall
    li a0, 10
    li a7, 11
    ecall
    li a7, 10
    ecall`,
    };

    (document.getElementById('code-editor') as HTMLTextAreaElement).value = examples[name] || examples.hello;
  }
}
